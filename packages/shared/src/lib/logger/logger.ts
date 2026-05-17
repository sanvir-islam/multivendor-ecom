import pino from "pino";
import crypto from "node:crypto";
import type { Request } from "express";

// 1. THE ENGINE: Creates the beautiful terminal logs
export function createLogger(serviceName: string) {
	const isDev = process.env.NODE_ENV === "development";

	return pino({
		level: process.env.LOG_LEVEL || "info",
		base: { service: serviceName }, // Attaches the service name to every log
		...(isDev && {
			transport: {
				target: "pino-pretty",
				options: { colorize: true, ignore: "pid,hostname", translateTime: "SYS:standard" },
			},
		}),
	});
}

// 2. THE TRACER: Safely grabs or creates the Correlation ID
export function generateTraceId(req: Request) {
	return (req.headers["x-request-id"] as string) || crypto.randomUUID();
}

// 3. THE SECRETS: Global fields that EVERY service must hide
export const globalRedactFields = ["req.headers.authorization", "req.headers.cookie", "req.headers['x-api-key']", "req.cookies"];
