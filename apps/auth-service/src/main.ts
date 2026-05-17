import "dotenv/config";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import { env } from "./config/env";
import { errorHandler, generateTraceId, globalRedactFields, kafkaProducer } from "@multivendor-ecom/shared";
import { logger } from "./config/logger";
import authRoutes from "./routes/auth.routes";
import { connectDB, disconnectDB } from "./config/database";
import type { Server } from "node:http";
import { pinoHttp } from "pino-http";

const app: Express = express();
app.disable("x-powered-by");
let server: Server;

// ──── Global middleware ────
app.use(
	pinoHttp({
		logger,
		genReqId: generateTraceId,
		redact: [...globalRedactFields, "req.body.password", "req.body.passwordConfirm"],
	}),
);

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// ──── Health check (used by Docker / load balancer) ────
app.get("/health", (_req, res) => {
	res.json({ status: "ok", service: "auth-service" });
});

// ──── API routes ────
app.use("/", authRoutes);

// ──── 404 and Global error handler ────
app.use((req, res) => {
	req.log.warn({ method: req.method, path: req.originalUrl }, "Route not found");
	res.status(404).json({
		success: false,
		message: "Route not found",
	});
});
app.use(errorHandler(logger));

// ──── Start server ────
async function bootstrap() {
	const port = env.PORT ? Number(env.PORT) : 6001;
	try {
		// Verify database connection
		await connectDB();

		await kafkaProducer.connect();
		logger.info("Kafka producer connected");

		server = app.listen(port, () => {
			logger.info(`Auth service is running at port ${port}`);
		});

		// Async error handler for listen failures (port in use, permissions, etc.)
		server.on("error", (err: NodeJS.ErrnoException) => {
			if (err.code === "EADDRINUSE") {
				logger.fatal({ port }, "Port already in use — another instance running?");
			} else if (err.code === "EACCES") {
				logger.fatal({ port }, "Permission denied to bind to port");
			} else {
				logger.fatal({ err }, "Server error");
			}
			process.exit(1);
		});
	} catch (err) {
		logger.fatal({ err }, `Failed to start auth service at port ${port}`);
		process.exit(1);
	}
}

// ──── Graceful Shutdown ────
async function shutdown(signal: string) {
	logger.info(`${signal} received — shutting down gracefully`);

	// Force exit after 10 seconds if graceful shutdown stalls
	const forceExit = setTimeout(() => {
		logger.error("Graceful shutdown timed out — forcing exit");
		process.exit(1);
	}, 10_000);

	if (server) {
		server.close(async () => {
			logger.info("HTTP server closed");
			await kafkaProducer.disconnect();
			logger.info("Kafka producer disconnected");
			await disconnectDB();
			logger.info("Database disconnected");
			clearTimeout(forceExit);
			process.exit(0);
		});
	} else {
		await kafkaProducer.disconnect();
		await disconnectDB();
		clearTimeout(forceExit);
		process.exit(0);
	}
}

process.on("SIGTERM", async () => shutdown("SIGTERM"));
process.on("SIGINT", async () => shutdown("SIGINT"));

if (process.env.NODE_ENV !== "test") {
	bootstrap();
}

// For Automated Testing
export default app;
