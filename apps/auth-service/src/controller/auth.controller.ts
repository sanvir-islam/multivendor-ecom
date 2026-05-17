import type { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth.service";
import { clearAuthCookies, setAuthCookies } from "../utils/cookies";
import { getRequestMetadata } from "../utils/request";
import type { PaginationInput } from "../schemas/auth.schema";

// ──────────────────────────────────────────────
// POST /auth/register
// ──────────────────────────────────────────────
export async function register(req: Request, res: Response, next: NextFunction) {
	try {
		const meta = getRequestMetadata(req);
		const result = await authService.register(req.body, meta.traceId);

		res.status(201).json({
			success: true,
			message: "Registration successful. Please verify your email.",
			data: result.user,
			// Use raw process.env to allow Jest to change the environment during tests
			...(process.env.NODE_ENV === "development" && {
				_dev: { verificationToken: result.verificationToken },
			}),
		});
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// POST /auth/login
// ──────────────────────────────────────────────
export async function login(req: Request, res: Response, next: NextFunction) {
	try {
		const meta = getRequestMetadata(req);
		const result = await authService.login(req.body, meta);

		setAuthCookies(res, result.accessToken, result.refreshToken);

		res.status(200).json({
			success: true,
			message: "Login successful",
			data: result.user,
		});
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// POST /auth/refresh
// ──────────────────────────────────────────────
export async function refreshToken(req: Request, res: Response, next: NextFunction) {
	try {
		const token = req.cookies?.refresh_token;
		if (!token) {
			res.status(401).json({
				success: false,
				message: "Refresh token not found",
			});
			return;
		}
		const meta = getRequestMetadata(req);
		const result = await authService.refresh(token, meta);

		// Set new cookies (rotation — old ones are now invalid)
		setAuthCookies(res, result.accessToken, result.refreshToken);

		res.status(200).json({
			success: true,
			message: "Token refreshed successfully",
		});
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// POST /auth/logout
// ──────────────────────────────────────────────
export async function logout(req: Request, res: Response, next: NextFunction) {
	try {
		const token = req.cookies?.refresh_token;
		if (token) await authService.logout(token);

		clearAuthCookies(res);

		res.status(200).json({
			success: true,
			message: "Logged out successfully",
		});
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// POST /auth/logout-all
// ──────────────────────────────────────────────
export async function logoutAll(req: Request, res: Response, next: NextFunction) {
	try {
		const userId = req.headers["x-user-id"] as string;
		await authService.logoutAll(userId);

		clearAuthCookies(res);

		res.status(200).json({
			success: true,
			message: "Logged out from all devices",
		});
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// POST /auth/resend-verification
// ──────────────────────────────────────────────
export async function resendVerification(req: Request, res: Response, next: NextFunction) {
	try {
		const meta = getRequestMetadata(req);
		const result = await authService.resendVerificationEmail(req.body, meta.traceId);
		res.status(200).json({
			success: true,
			message: result.message,
		});
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// POST /auth/verify-email
// ──────────────────────────────────────────────
export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
	try {
		const meta = getRequestMetadata(req);
		const result = await authService.verifyEmail(req.body.token, meta.traceId);

		res.status(200).json({
			success: true,
			message: result.message,
		});
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// POST /auth/forgot-password -> POST /auth/reset-password
// ──────────────────────────────────────────────
export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
	try {
		const meta = getRequestMetadata(req);
		const result = await authService.forgotPassword(req.body, meta.traceId);
		res.status(200).json({
			success: true,
			message: result.message,
		});
	} catch (err) {
		next(err);
	}
}
export async function resetPassword(req: Request, res: Response, next: NextFunction) {
	try {
		const meta = getRequestMetadata(req);
		const result = await authService.resetPassword(req.body, meta.traceId);

		// Clear any existing auth cookies (in case user is logged in on this device)
		clearAuthCookies(res);

		res.status(200).json({
			success: true,
			message: result.message,
		});
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// POST /auth/change-password
// ──────────────────────────────────────────────
export async function changePassword(req: Request, res: Response, next: NextFunction) {
	try {
		const userId = req.headers["x-user-id"] as string;
		const meta = getRequestMetadata(req);
		const result = await authService.changePassword(userId, meta.traceId, req.body);

		clearAuthCookies(res);
		res.status(200).json({
			success: true,
			message: result.message,
		});
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// GET /auth/me
// ──────────────────────────────────────────────
export async function getMe(req: Request, res: Response, next: NextFunction) {
	try {
		const userId = req.headers["x-user-id"] as string;
		const user = await authService.getMe(userId);

		res.status(200).json({
			success: true,
			data: user,
		});
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// GET /auth/sessions
// ──────────────────────────────────────────────
export async function getSessions(req: Request, res: Response, next: NextFunction) {
	try {
		const userId = req.headers["x-user-id"] as string;
		const sessions = await authService.getSessions(userId);

		res.status(200).json({
			success: true,
			data: sessions,
		});
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// DELETE /auth/sessions/:tokenId
// ──────────────────────────────────────────────
export async function revokeSession(req: Request, res: Response, next: NextFunction) {
	try {
		const userId = req.headers["x-user-id"] as string;
		const { tokenId } = req.params;
		const result = await authService.revokeSession(userId, tokenId);

		res.status(200).json({
			success: true,
			message: result.message,
		});
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// ADMIN: PATCH /auth/users/:userId/block
// ──────────────────────────────────────────────
export async function blockUser(req: Request, res: Response, next: NextFunction) {
	try {
		const meta = getRequestMetadata(req);
		const result = await authService.blockUser(req.params.userId, meta.traceId);
		res.status(200).json({ success: true, message: result.message });
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// ADMIN: PATCH /auth/users/:userId/unblock
// ──────────────────────────────────────────────
export async function unblockUser(req: Request, res: Response, next: NextFunction) {
	try {
		const result = await authService.unblockUser(req.params.userId);
		res.status(200).json({ success: true, message: result.message });
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// ADMIN: PATCH /auth/users/:userId/role
// ──────────────────────────────────────────────
export async function changeUserRole(req: Request, res: Response, next: NextFunction) {
	const requestingUserId = req.headers["x-user-id"] as string;
	try {
		const meta = getRequestMetadata(req);
		const result = await authService.changeUserRole(req.params.userId, requestingUserId, req.body.role, meta.traceId);
		res.status(200).json({ success: true, message: result.message });
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// ADMIN: GET /auth/users
// ──────────────────────────────────────────────
export async function listUsers(req: Request, res: Response, next: NextFunction) {
	try {
		const { page, limit } = req.query as unknown as PaginationInput;
		const result = await authService.listUsers(page, limit);

		res.status(200).json({
			success: true,
			data: result.users,
			pagination: result.pagination,
		});
	} catch (err) {
		next(err);
	}
}

// ──────────────────────────────────────────────
// DELETE /auth/me — delete current user's account
// ──────────────────────────────────────────────
export async function deleteAccount(req: Request, res: Response, next: NextFunction) {
	try {
		const userId = req.headers["x-user-id"] as string;
		const meta = getRequestMetadata(req);
		const result = await authService.deleteAccount(userId, meta.traceId, req.body);

		// Clear cookies after deletion
		clearAuthCookies(res);

		res.status(200).json({
			success: true,
			message: result.message,
		});
	} catch (err) {
		next(err);
	}
}
