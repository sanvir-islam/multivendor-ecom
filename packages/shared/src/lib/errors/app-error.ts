export class AppError extends Error {
	public readonly statusCode: number;
	public readonly isOperational: boolean;
	public readonly details?: unknown;

	constructor(
		message: string,
		statusCode: number,
		isOperational = true,
		details?: unknown,
	) {
		super(message);
		this.statusCode = statusCode;
		this.isOperational = isOperational;
		this.details = details;
	}
}

// not found error
export class NotFoundError extends AppError {
	constructor(message = "Resources not found") {
		super(message, 404);
	}
}

// validation error (use for Joi/Jod/react-hook-form validation errors)
export class ValidationError extends AppError {
	constructor(message = "Invalid request data", details?: unknown) {
		super(message, 400, true, details);
	}
}

// authentication error
export class AuthError extends AppError {
	constructor(message = "Unauthorized") {
		super(message, 401);
	}
}
// forbidden error (insufficient permitions)
export class ForbiddenError extends AppError {
	constructor(message = "Forbidden access") {
		super(message, 403);
	}
}
// database error (for mongodb / postgres errors)
export class DatabaseError extends AppError {
	constructor(message = "Database error", details?: unknown) {
		super(message, 500, true, details);
	}
}
// rate limit error (if user extend API limit)
export class RateLimitError extends AppError {
	constructor(message = "Too many request please try again later.") {
		super(message, 429);
	}
}
