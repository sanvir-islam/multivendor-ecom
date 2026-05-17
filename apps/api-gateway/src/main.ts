import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";
import hpp from "hpp";
import compression from "compression";
import { logger } from "./config/logger";
import apiRoutes from "./routes/api.routes";
import { errorHandler, generateTraceId, globalRedactFields, requestId } from "@multivendor-ecom/shared";
import type { Server } from "node:http";

const app: Express = express();
app.disable("x-powered-by");
let server: Server;

// TRUST PROXY (Must be absolute first)
app.set("trust proxy", 1);

// REQUEST ID GENERATOR
// Attaches a unique ID (traceId) to every request so you can track it across services
app.use(requestId);

// LOGGING
app.use(
	pinoHttp({
		logger,
		genReqId: generateTraceId,
		redact: globalRedactFields,
	}),
);
// SECURITY HEADERS
app.use(helmet());

// CORS
app.use(
	cors({
		origin: ["http://localhost:3000"],
		allowedHeaders: ["Authorization", "Content-Type", "x-request-id"],
		credentials: true,
	}),
);

// RATE LIMITING
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 150,
	message: { error: "Too many requests, please try again later." },
	standardHeaders: "draft-7",
	legacyHeaders: false,
});
app.use(limiter);

// COMPRESSION
app.use(compression());

// PARSERS (Body & Cookies)
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ limit: "2mb", extended: true }));
app.use(cookieParser());

// SECURITY: PARAMETER POLLUTION
app.use(hpp());

// ROUTES & PROXIES
// Health Check
app.get("/api/v1/health", (_req, res) => res.status(200).json({ status: "ok", service: "api-gateway" }));

// proxy routes
app.use("/api/v1", apiRoutes);

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
	const port = process.env.PORT ? Number(process.env.PORT) : 6000;
	server = app.listen(port, () => {
		logger.info(`Api Gateway is running at http://localhost:${port}/api/v1`);
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
			clearTimeout(forceExit);
			process.exit(0);
		});
	} else {
		clearTimeout(forceExit);
		process.exit(0);
	}
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Prevent port collisions during automated testing
if (process.env.NODE_ENV !== "test") {
	bootstrap();
}

export default app;
