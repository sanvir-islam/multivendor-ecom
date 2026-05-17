import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

type AccessTokenPayload = {
	userId: string;
	role: string;
	tokenVersion: number;
	isVerified: boolean;
};

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
	// Strip these headers so clients cannot forge them.
	delete req.headers["x-user-id"];
	delete req.headers["x-user-role"];
	delete req.headers["x-token-version"];
	delete req.headers["x-user-verified"];

	// Extract access token from cookie
	const token = req.cookies?.access_token;
	if (!token) {
		res.status(401).json({
			success: false,
			message: "Access token required",
		});
		return;
	}

	try {
		const secret = process.env.JWT_ACCESS_SECRET;
		if (!secret) {
			// Throwing a 500 here because this is a server misconfiguration, not a user error
			res.status(500).json({ success: false, message: "Internal server error: Missing JWT secret" });
			return;
		}
		// Verify token
		const decoded = jwt.verify(token, secret) as AccessTokenPayload;

		// Attach user info as headers for downstream services
		req.headers["x-user-id"] = decoded.userId;
		req.headers["x-user-role"] = decoded.role;
		req.headers["x-token-version"] = String(decoded.tokenVersion);
		req.headers["x-user-verified"] = String(decoded.isVerified);

		next();
	} catch (err: unknown) {
		if (err instanceof Error && err.name === "TokenExpiredError") {
			res.status(401).json({
				success: false,
				message: "Access token expired",
				code: "TOKEN_EXPIRED", // frontend uses this to trigger refresh
			});
			return;
		}

		res.status(401).json({
			success: false,
			message: "Invalid access token",
		});
	}
}
