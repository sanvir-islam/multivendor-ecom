import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import type { Logger } from "pino";

export function errorHandler(logger: Logger) {
	return function errorMiddleware(err: Error, req: Request, res: Response, _next: NextFunction) {
		// 1. Handle Known Operational Errors (AppError & its subclasses)
		if (err instanceof AppError) {
			const logContext = {
				err, // Pino will automatically format this error object
				method: req.method,
				url: req.url,
				ip: req.ip, // Extremely useful for debugging rate limits & auth
			};

			// If it's a 500 AppError (like DatabaseError), log as an Error. Otherwise, Warn.
			if (err.statusCode >= 500 || !err.isOperational) {
				logger.error(logContext, `AppError: ${err.message}`);
			} else {
				logger.warn(logContext, `AppError: ${err.message}`);
			}

			return res.status(err.statusCode).json({
				success: false,
				error: {
					type: err.constructor.name, // e.g., 'ValidationError', 'NotFoundError'
					message: err.message,
					...(err.details ? { details: err.details } : {}),
				},
			});
		}

		// 2. Handle Unknown / Unexpected Errors (e.g., Syntax errors, crashes)
		logger.error({ err, method: req.method, url: req.url, ip: req.ip }, "Unhandled Server Error");

		const isDev = process.env.NODE_ENV === "development";

		return res.status(500).json({
			success: false,
			error: {
				type: "InternalServerError",
				message: "Something went wrong. Please try again later.",
				// Only leak the raw error and stack trace if we are in development mode!
				...(isDev ? { rawMessage: err.message, stack: err.stack } : {}),
			},
		});
	};
}
