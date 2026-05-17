import type { Request, Response, NextFunction } from "express";

export function requireRole(allowedRoles: string[]) {
	return (req: Request, res: Response, next: NextFunction): void => {
		const userRole = req.headers["x-user-role"] as string;
		if (!userRole) {
			res.status(401).json({
				success: false,
				message: "Authentication required",
			});
			return;
		}

		if (!allowedRoles.includes(userRole)) {
			res.status(403).json({
				success: false,
				message: `Access denied. Required role: ${allowedRoles.join(" or ")}`,
			});
			return;
		}

		next();
	};
}

// Helper to extract user info from gateway-set headers
// Every service uses this to know WHO is making the request
export function getUserFromHeaders(req: Request) {
	return {
		userId: req.headers["x-user-id"] as string | undefined,
		userRole: req.headers["x-user-role"] as string | undefined,
	};
}
