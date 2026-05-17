import "dotenv/config";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import { env } from "./config/env";
import { errorHandler, generateTraceId, globalRedactFields } from "@multivendor-ecom/shared";
import { logger } from "./config/logger";
import type { Server } from "node:http";
import { pinoHttp } from "pino-http";
import { closeEmailTransport, createEmailTransport } from "./config/email";
import { startAuthEventsConsumer, stopAuthEventsConsumer } from "./consumers/auth-events.consumer";

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

app.use(cookieParser());

// ──── Health check (used by Docker / load balancer) ────
app.get("/notification/health", (_req, res) => {
	res.json({ status: "ok", service: "notification-service" });
});

// ──── Global error handler (must be LAST middleware) ────
app.use(errorHandler(logger));

// ──── Start server ────
async function bootstrap() {
	const port = env.PORT ? Number(env.PORT) : 6002;
	try {
		// Step 1: Initialize email transport (Ethereal in dev, real SMTP in prod)

		await createEmailTransport();
		logger.info("Email transport initialized");

		// Step 2: Start Kafka consumers
		await startAuthEventsConsumer();
		logger.info("Auth events consumer started");

		// Step 3: Start health check server
		server = app.listen(port, () => {
			logger.info(`Notification service running on port ${port}`);
		});

		// Future: add more consumers here
		// await startOrderEventsConsumer();
		// await startVendorEventsConsumer();

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
		logger.fatal({ err }, `Failed to start notification service at port ${port}`);
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
			await stopAuthEventsConsumer();
			logger.info("Kafka consumers stopped");
			closeEmailTransport();
			logger.info("Email transport closed");
			clearTimeout(forceExit);
			process.exit(0);
		});
	} else {
		await stopAuthEventsConsumer();
		closeEmailTransport();
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
