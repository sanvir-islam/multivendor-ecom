import type { Request } from "express";

export interface RequestMetadata {
	traceId: string;
	ipAddress?: string;
	userAgent?: string;
}

export function getRequestMetadata(req: Request): RequestMetadata {
	return {
		traceId: req.headers["x-request-id"] as string,
		ipAddress: req.ip || req.socket.remoteAddress,
		userAgent: req.headers["user-agent"],
	};
}
