// 1. The Robust Base Class
export class AppError extends Error {
	public readonly statusCode: number;
	public readonly isOperational: boolean;
	public readonly details?: unknown;

	constructor(message: string, statusCode: number, isOperational = true, details?: unknown) {
		super(message);
		this.statusCode = statusCode;
		this.isOperational = isOperational;
		this.details = details;

		// Restore prototype chain (Fixes 'instanceof' in TypeScript)
		Object.setPrototypeOf(this, new.target.prototype);

		// Captures clean stack trace, excluding the constructor call itself
		Error.captureStackTrace(this, this.constructor);
	}
}

// 2. Specific Error Subclasses
export class BadRequestError extends AppError {
	constructor(message = "Bad Request", details?: unknown) {
		super(message, 400, true, details);
	}
}

export class ValidationError extends AppError {
	constructor(message = "Validation Error", details?: unknown) {
		// Perfect for passing Zod, Joi, or class-validator error arrays
		super(message, 400, true, details);
	}
}

export class UnauthorizedError extends AppError {
	constructor(message = "Authentication required") {
		super(message, 401);
	}
}

export class ForbiddenError extends AppError {
	constructor(message = "Access denied") {
		super(message, 403);
	}
}

export class NotFoundError extends AppError {
	constructor(message = "Resource not found") {
		super(message, 404);
	}
}

export class ConflictError extends AppError {
	constructor(message = "Resource already exists") {
		super(message, 409);
	}
}

export class TooManyRequestsError extends AppError {
	constructor(message = "Too many requests") {
		super(message, 429);
	}
}

// Note: isOperational is FALSE here.
// Database connections dropping are usually programming/infrastructure bugs, not operational user errors.
export class DatabaseError extends AppError {
	constructor(message = "Database operation failed", details?: unknown) {
		super(message, 500, false, details);
	}
}
