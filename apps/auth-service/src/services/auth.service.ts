import {
	BadRequestError,
	ConflictError,
	ForbiddenError,
	NotFoundError,
	TooManyRequestsError,
	UnauthorizedError,
} from "@multivendor-ecom/shared";
import type {
	ChangePasswordInput,
	DeleteAccountInput,
	ForgotPasswordInput,
	LoginInput,
	RegisterInput,
	ResendVerificationInput,
	ResetPasswordInput,
} from "../schemas/auth.schema";
import { comparePassword, hashPassword } from "../utils/hash";
import { prisma } from "../config/database";
import { Prisma } from "../generated/prisma/client";
import { generateAccessToken, generateVerificationToken, verifyVerificationToken } from "../utils/jwt";
import { generateOpaqueToken, getRefreshTokenExpiryDate, hashToken } from "../utils/token";
import { logger } from "../config/logger";
import * as events from "../events/publisher";
import type { RequestMetadata } from "../utils/request";

// ──────────────────────────────────────────────
// Constants — configurable per environment in production
// ──────────────────────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// ──────────────────────────────────────────────
// REGISTER — create new user account
// ──────────────────────────────────────────────
export async function register(data: RegisterInput, traceId: string) {
	const hashedPassword = await hashPassword(data.password);

	try {
		// Relies on the database unique constraint (P2002 error) to prevent race conditions.
		const user = await prisma.user.create({
			data: {
				name: data.name,
				email: data.email,
				password: hashedPassword,
			},
			select: {
				id: true,
				name: true,
				email: true,
				role: true,
				isVerified: true,
				createdAt: true,
			},
		});

		// Generate email verification token
		const verificationToken = generateVerificationToken(user.id);

		// kafka.publish
		await events.publishUserRegistered({
			userId: user.id,
			email: user.email,
			name: user.name,
			role: user.role,
			verificationToken,
			traceId,
		});

		return { user, verificationToken };
	} catch (err: unknown) {
		// 1. Check if it's a known Prisma error AND it's the Unique Constraint error (P2002)
		if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
			throw new ConflictError("Email already registered");
		}

		throw err;
	}
}

// ──────────────────────────────────────────────
// LOGIN — authenticate user + create session
// ──────────────────────────────────────────────
export async function login(data: LoginInput, meta: RequestMetadata) {
	const user = await prisma.user.findUnique({ where: { email: data.email } });
	// check: user exist and account is not blocked
	if (!user) {
		throw new UnauthorizedError("Invalid email or password");
	}
	if (user.isBlocked) {
		throw new ForbiddenError("Account is suspended. Please contact support.");
	}

	// Brute force lock - temporary, auto-expires
	if (user.lockUntil && user.lockUntil > new Date()) {
		const minutesLeft = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
		throw new TooManyRequestsError(`Account temporarily locked. Try again in ${minutesLeft} minutes.`);
	}

	// Verify password
	const isPasswordValid = await comparePassword(data.password, user.password);
	if (!isPasswordValid) {
		// Increment failed attempts
		const attempts = user.failedLoginAttempts + 1;
		const updateData: { failedLoginAttempts: number; lockUntil?: Date } = { failedLoginAttempts: attempts };

		// Lock account if threshold reached
		if (attempts >= MAX_LOGIN_ATTEMPTS) {
			updateData.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);

			// kafka.publish on lock account
			events.publishAccountLocked({
				userId: user.id,
				email: user.email,
				name: user.name,
				failedAttempts: updateData.failedLoginAttempts,
				lockUntil: updateData.lockUntil,
				traceId: meta.traceId,
			});
		}

		await prisma.user.update({
			where: { id: user.id },
			data: updateData,
		});

		// Don't tell the attacker how many attempts are left
		throw new UnauthorizedError("Invalid email or password");
	}

	// ─── Login successful ───

	// Reset failed attempts and clear lock (if any expired lock was lingering)
	if (user.failedLoginAttempts > 0 || user.lockUntil || user.deletedAt) {
		await prisma.user.update({
			where: { id: user.id },
			data: {
				failedLoginAttempts: 0,
				lockUntil: null,
				deletedAt: null,
			},
		});
	}

	// Generate a opaque refresh token
	const rawRefreshToken = generateOpaqueToken();
	const hashedRefreshToken = hashToken(rawRefreshToken);

	// Store HASH in database — raw token goes to client cookie only
	await prisma.refreshToken.create({
		data: {
			token: hashedRefreshToken,
			userId: user.id,
			tokenVersion: user.tokenVersion,
			userAgent: meta.userAgent,
			ipAddress: meta.ipAddress,
			expiresAt: getRefreshTokenExpiryDate(),
		},
	});

	// Generate access token JWT
	const accessToken = generateAccessToken({
		userId: user.id,
		role: user.role,
		tokenVersion: user.tokenVersion,
		isVerified: user.isVerified,
	});

	const userData = {
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
		isVerified: user.isVerified,
	};

	// rawRefreshToken goes to cookie
	return { accessToken, refreshToken: rawRefreshToken, user: userData };
}

// ──────────────────────────────────────────────
// REFRESH — rotate refresh token + issue new access token
// ──────────────────────────────────────────────
export async function refresh(rawRefreshToken: string, meta: RequestMetadata) {
	// Step 1: Hash the incoming token to look up in database
	const hashedToken = hashToken(rawRefreshToken);

	// Step 2: Fetch user AND refresh token record in one query
	const tokenRecord = await prisma.refreshToken.findUnique({ where: { token: hashedToken }, include: { user: true } });

	// check 1: Fails if token doesn't exist, user is deleted, or user is blocked
	if (!tokenRecord) {
		throw new UnauthorizedError("Session not found. Please log in again.");
	}
	const user = tokenRecord.user;
	if (!user || user.deletedAt) {
		throw new UnauthorizedError("User not found. please log in again.");
	}
	if (user.isBlocked) throw new ForbiddenError("Account is suspended. Please contact support.");

	// check 2: Token is not revoked (with theft detection)
	if (tokenRecord.isRevoked) {
		if (tokenRecord.revokedBy === "ROTATION") {
			// THEFT DETECTED: rotated token reused
			// Nuclear: kill all sessions
			await prisma.$transaction([
				prisma.refreshToken.updateMany({
					where: {
						userId: user.id,
						isRevoked: false,
					},
					data: {
						isRevoked: true, // revoke all sessions
						revokedBy: "ADMIN",
					},
				}),
				prisma.user.update({
					where: { id: user.id },
					data: { tokenVersion: { increment: 1 } },
				}),
			]);

			// kafka.publish on token theft detection
			events.publishTokenTheftDetected({
				userId: user.id,
				email: user.email,
				name: user.name,
				ipAddress: meta.ipAddress ?? tokenRecord.ipAddress ?? undefined,
				userAgent: meta.userAgent ?? tokenRecord.userAgent ?? undefined,
				traceId: meta.traceId,
			});
			throw new UnauthorizedError("Security alert: suspicious activity detected — all sessions terminated");
		}

		// Non-theft revocation (MANUAL, LOGOUT, PASSWORD, ADMIN) - quiet reject
		throw new UnauthorizedError("Session expired — please log in again");
	}

	// Check 3: Token version matches current user version
	if (tokenRecord.tokenVersion !== user.tokenVersion) {
		await prisma.refreshToken.update({
			where: { id: tokenRecord.id },
			data: { isRevoked: true, revokedBy: "PASSWORD" },
		});
		throw new UnauthorizedError("Session invalidated — please log in again");
	}

	// check 4: Token not expired
	if (tokenRecord.expiresAt < new Date()) {
		await prisma.refreshToken.update({
			where: { id: tokenRecord.id },
			data: { isRevoked: true, revokedBy: "EXPIRED" },
		});
		throw new UnauthorizedError("Refresh token expired — please log in again");
	}

	// Step 3: Rotate — conditional revocation (race condition protection)
	const revokeResult = await prisma.refreshToken.updateMany({
		where: {
			id: tokenRecord.id,
			isRevoked: false,
		},
		data: {
			isRevoked: true,
			revokedBy: "ROTATION",
		},
	});

	// If no rows updated, another request already rotated this token
	if (revokeResult.count === 0) {
		// Another request already rotated — concurrent use = theft signal
		await prisma.$transaction([
			prisma.refreshToken.updateMany({
				where: { userId: user.id, isRevoked: false },
				data: {
					isRevoked: true,
					revokedBy: "ADMIN",
				},
			}),
			prisma.user.update({
				where: { id: user.id },
				data: { tokenVersion: { increment: 1 } },
			}),
		]);
		throw new UnauthorizedError("Security alert: concurrent token use detected — all sessions terminated");
	}

	// Step 4: Create new refresh token
	const newRawToken = generateOpaqueToken();
	const newHashedToken = hashToken(newRawToken);

	await prisma.refreshToken.create({
		data: {
			token: newHashedToken,
			userId: user.id,
			tokenVersion: user.tokenVersion,
			ipAddress: meta.ipAddress ?? tokenRecord.ipAddress ?? undefined,
			userAgent: meta.userAgent ?? tokenRecord.userAgent ?? undefined,
			expiresAt: getRefreshTokenExpiryDate(),
		},
	});

	// Step 5: Generate new access token
	const accessToken = generateAccessToken({
		userId: user.id,
		role: user.role,
		tokenVersion: user.tokenVersion,
		isVerified: user.isVerified,
	});

	return { accessToken, refreshToken: newRawToken };
}

// ──────────────────────────────────────────────
// LOGOUT — revoke current session
// ──────────────────────────────────────────────
export async function logout(rawRefreshToken: string) {
	const hashedToken = hashToken(rawRefreshToken);

	await prisma.refreshToken
		.updateMany({
			where: { token: hashedToken, isRevoked: false },
			data: {
				isRevoked: true,
				revokedBy: "LOGOUT",
			},
		})
		.catch((err) => {
			// Silent to the user, but visible to YOU in the server logs
			logger.warn(`Failed to revoke token during logout: ${err.message}`);
		});
}

// ──────────────────────────────────────────────
// LOGOUT ALL — nuclear: increment version + revoke everything
// ──────────────────────────────────────────────
export async function logoutAll(userId: string) {
	await prisma.$transaction([
		prisma.user.update({
			where: { id: userId },
			data: { tokenVersion: { increment: 1 } },
		}),
		prisma.refreshToken.updateMany({
			where: { userId: userId, isRevoked: false },
			data: { isRevoked: true, revokedBy: "LOGOUT" },
		}),
	]);
}

// ──────────────────────────────────────────────
// RESEND VERIFICATION EMAIL
// ──────────────────────────────────────────────
export async function resendVerificationEmail(data: ResendVerificationInput, traceId: string) {
	const user = await prisma.user.findUnique({
		where: { email: data.email },
	});

	// ALWAYS return same response — don't reveal email existence
	const genericResponse = {
		message: "If your email is registered and not yet verified, a new verification link has been sent.",
	};

	// Silently skip if user doesn't exist , blocked or already verified
	if (!user || user.deletedAt) return genericResponse;
	if (user.isBlocked) return genericResponse;
	if (user.isVerified) return genericResponse;

	// Rate limit — cooldown time 1min
	if (user.lastVerificationEmailAt && Date.now() - user.lastVerificationEmailAt.getTime() < 60 * 1000) {
		// Silently skip — don't reveal that this email is registered
		return genericResponse;
	}

	// Generate fresh verification token
	const verificationToken = generateVerificationToken(user.id);

	// Update timestamp
	await prisma.user.update({
		where: { id: user.id },
		data: { lastVerificationEmailAt: new Date() },
	});

	// publish kafka event
	await events.publishVerificationEmailRequested({
		userId: user.id,
		email: user.email,
		name: user.name,
		verificationToken,
		traceId,
	});

	return genericResponse;
}

// ──────────────────────────────────────────────
// VERIFY EMAIL
// ──────────────────────────────────────────────
export async function verifyEmail(token: string, traceId: string) {
	let decoded: { userId: string };

	try {
		decoded = verifyVerificationToken(token);
	} catch {
		throw new BadRequestError("Invalid or expired verification token");
	}

	const user = await prisma.user.findUnique({
		where: { id: decoded.userId },
	});
	const genericErrMsg = "This link is invalid, or your account is already verified. Try logging in.";
	if (!user || user.deletedAt) throw new BadRequestError(genericErrMsg);
	if (user.isBlocked) {
		throw new ForbiddenError("Account is suspended. Please contact support.");
	}

	const result = await prisma.user.updateMany({ where: { id: decoded.userId, isVerified: false }, data: { isVerified: true } });
	if (result.count === 0) throw new BadRequestError(genericErrMsg);

	// publish kafka event on successful verification
	events.publishUserVerified({
		userId: user.id,
		email: user.email,
		name: user.name,
		traceId,
	});
	return { message: "Email verified successfully" };
}

// ──────────────────────────────────────────────
// FORGOT PASSWORD
// ──────────────────────────────────────────────
export async function forgotPassword(data: ForgotPasswordInput, traceId: string) {
	const user = await prisma.user.findUnique({
		where: { email: data.email },
	});

	const genericResponse = {
		message: "If your email is registered, a password reset link has been sent.",
	};

	if (!user || user.deletedAt) return genericResponse;
	// Don't allow reset for blocked accounts (they shouldn't be able to log in anyway)
	if (user.isBlocked) return genericResponse;

	// Rate limit — check most recent reset token for this user
	const recentToken = await prisma.passwordResetToken.findFirst({
		where: { userId: user.id },
		orderBy: { createdAt: "desc" },
	});
	// 1 min cooldown
	if (recentToken && Date.now() - recentToken.createdAt.getTime() < 60 * 1000) {
		return genericResponse;
	}

	// Generate opaque token (same pattern as refresh tokens)
	const rawToken = generateOpaqueToken();
	const hashedToken = hashToken(rawToken);

	// Store hash in DB with 1-hour expiry
	await prisma.passwordResetToken.create({
		data: {
			token: hashedToken,
			userId: user.id,
			expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS),
		},
	});

	// Publish event — notification service sends email with raw token
	await events.publishPasswordResetRequested({
		userId: user.id,
		email: user.email,
		name: user.name,
		resetToken: rawToken,
		traceId,
	});

	return genericResponse;
}

// ──────────────────────────────────────────────
// RESET PASSWORD — consume reset token
// ──────────────────────────────────────────────
export async function resetPassword(data: ResetPasswordInput, traceId: string) {
	const hashedToken = hashToken(data.token);

	// Find token + include user in single query
	const tokenRecord = await prisma.passwordResetToken.findUnique({
		where: { token: hashedToken },
		include: { user: true },
	});

	if (!tokenRecord) {
		throw new BadRequestError("Invalid or expired reset token");
	}
	if (tokenRecord.isUsed) {
		throw new BadRequestError("This reset link has already been used");
	}
	if (tokenRecord.expiresAt < new Date()) {
		throw new BadRequestError("This reset link has expired. Please request a new one.");
	}

	const user = tokenRecord.user;
	// Don't allow resetting password for blocked users
	if (user.isBlocked) {
		throw new ForbiddenError("Account is suspended. Please contact support.");
	}
	// Prevent setting same password as before (security best practice)
	const isSamePassword = await comparePassword(data.newPassword, user.password);
	if (isSamePassword) {
		throw new BadRequestError("New password must be different from your current password");
	}

	const hashedPassword = await hashPassword(data.newPassword);

	// Atomic transaction:
	//   1. Update password + increment tokenVersion + reset lockout
	//   2. Mark this reset token as used
	//   3. Revoke all refresh tokens (force re-login on all devices)
	//   4. Invalidate all OTHER reset tokens for this user (one-time use)
	await prisma.$transaction([
		prisma.user.update({
			where: { id: user.id },
			data: {
				password: hashedPassword,
				tokenVersion: { increment: 1 },
				failedLoginAttempts: 0,
				lockUntil: null,
			},
		}),
		prisma.passwordResetToken.update({
			where: { id: tokenRecord.id },
			data: { isUsed: true },
		}),
		prisma.refreshToken.updateMany({
			where: { userId: user.id, isRevoked: false },
			data: { isRevoked: true, revokedBy: "PASSWORD" },
		}),
		// Invalidate any other pending reset tokens
		prisma.passwordResetToken.updateMany({
			where: { userId: user.id, id: { not: tokenRecord.id }, isUsed: false },
			data: { isUsed: true },
		}),
	]);

	// Publish event — notification service sends confirmation email
	await events.publishPasswordChanged({
		userId: user.id,
		email: user.email,
		name: user.name,
		traceId,
	});

	return { message: "Password reset successful. Please log in with your new password." };
}

// ──────────────────────────────────────────────
// CHANGE PASSWORD
// ──────────────────────────────────────────────
export async function changePassword(userId: string, traceId: string, data: ChangePasswordInput) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
	});
	if (!user || user.deletedAt) throw new NotFoundError("User not found");
	if (user.isBlocked) throw new ForbiddenError("Account is suspended. Please contact support.");

	const isCurrentValid = await comparePassword(data.currentPassword, user.password);
	if (!isCurrentValid) throw new UnauthorizedError("Current password is incorrect");

	const isSamePassword = await comparePassword(data.newPassword, user.password);
	if (isSamePassword) throw new BadRequestError("New password must be different from current password");

	const hashedNewPassword = await hashPassword(data.newPassword);
	await prisma.$transaction([
		prisma.user.update({
			where: { id: userId },
			data: {
				password: hashedNewPassword,
				tokenVersion: { increment: 1 },
				failedLoginAttempts: 0,
				lockUntil: null,
			},
		}),
		prisma.refreshToken.updateMany({
			where: { userId, isRevoked: false },
			data: { isRevoked: true, revokedBy: "PASSWORD" },
		}),
	]);

	// Publish event — notification service sends confirmation email
	await events.publishPasswordChanged({
		userId: user.id,
		email: user.email,
		name: user.name,
		traceId,
	});
	return { message: "Password changed successfully. Please log in again." };
}

// ──────────────────────────────────────────────
// GET CURRENT USER
// ──────────────────────────────────────────────
export async function getMe(userId: string) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			email: true,
			role: true,
			isVerified: true,
			createdAt: true,
			updatedAt: true,
			deletedAt: true,
		},
	});

	if (!user || user.deletedAt) throw new NotFoundError("User not found");
	return user;
}

// ──────────────────────────────────────────────
// GET ACTIVE SESSIONS
// ──────────────────────────────────────────────
export async function getSessions(userId: string) {
	return prisma.refreshToken.findMany({
		where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
		select: {
			id: true,
			userAgent: true,
			ipAddress: true,
			createdAt: true,
		},
		orderBy: { createdAt: "desc" },
	});
}

// ──────────────────────────────────────────────
// REVOKE SESSION — manual, from settings
// ──────────────────────────────────────────────
export async function revokeSession(userId: string, tokenId: string) {
	const result = await prisma.refreshToken.updateMany({
		where: { id: tokenId, userId, isRevoked: false },
		data: { isRevoked: true, revokedBy: "MANUAL" },
	});

	if (result.count === 0) throw new NotFoundError("Active session not found");
	return { message: "Session revoked successfully" };
}

// ──────────────────────────────────────────────
// ADMIN: Block user
// ──────────────────────────────────────────────
export async function blockUser(userId: string, traceId: string) {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user || user.deletedAt) throw new NotFoundError("User not found");
	if (user.role === "ADMIN") throw new ForbiddenError("Cannot block an admin");
	if (user.isBlocked) throw new ForbiddenError("User is already blocked");

	await prisma.$transaction([
		prisma.user.update({ where: { id: userId }, data: { isBlocked: true, tokenVersion: { increment: 1 } } }),
		prisma.refreshToken.updateMany({
			where: { userId, isRevoked: false },
			data: { isRevoked: true, revokedBy: "ADMIN" },
		}),
	]);

	// publish kafka event
	await events.publishUserBlocked({
		userId,
		email: user.email,
		name: user.name,
		traceId,
	});

	return { message: "User blocked successfully" };
}

// ──────────────────────────────────────────────
// ADMIN: Unblock user
// ──────────────────────────────────────────────
export async function unblockUser(userId: string) {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user || user.deletedAt) throw new NotFoundError("User not found");
	if (!user.isBlocked) throw new BadRequestError("User is not blocked");

	await prisma.user.update({ where: { id: userId }, data: { isBlocked: false, failedLoginAttempts: 0, lockUntil: null } });

	return { message: "User unblocked successfully" };
}

// ──────────────────────────────────────────────
// ADMIN: Change user role
// ──────────────────────────────────────────────
export async function changeUserRole(userId: string, requestingUserId: string, newRole: "USER" | "ADMIN", traceId: string) {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user || user.deletedAt) throw new NotFoundError("User not found");
	if (user.isBlocked) {
		throw new BadRequestError("Cannot change the role of a blocked user. Unblock them first.");
	}
	if (user.role === newRole) throw new BadRequestError(`User already has role ${newRole}`);

	if (userId === requestingUserId) {
		throw new ForbiddenError("Cannot change your own role");
	}
	const oldRole = user.role; // saving old role before overwrite it

	await prisma.$transaction([
		prisma.user.update({ where: { id: userId }, data: { role: newRole, tokenVersion: { increment: 1 } } }),
		prisma.refreshToken.updateMany({
			where: { userId, isRevoked: false },
			data: { isRevoked: true, revokedBy: "ADMIN" },
		}),
	]);

	// publish kafka event
	await events.publishUserRoleChanged({
		userId,
		email: user.email,
		name: user.name,
		oldRole,
		newRole,
		traceId,
	});

	return { message: `User role changed to ${newRole}. User must re-login.` };
}

// ──────────────────────────────────────────────
// ADMIN: List all users (paginated)
// ──────────────────────────────────────────────
export async function listUsers(page = 1, limit = 20) {
	const skip = (page - 1) * limit;

	const [users, total] = await Promise.all([
		prisma.user.findMany({
			where: { deletedAt: null },
			select: {
				id: true,
				name: true,
				email: true,
				role: true,
				isVerified: true,
				isBlocked: true,
				createdAt: true,
			},
			skip,
			take: limit,
			orderBy: { createdAt: "desc" },
		}),
		prisma.user.count({ where: { deletedAt: null } }),
	]);

	return {
		users,
		pagination: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
}

// ──────────────────────────────────────────────
// DELETE ACCOUNT - soft delete
// ──────────────────────────────────────────────
export async function deleteAccount(userId: string, traceId: string, data: DeleteAccountInput) {
	const user = await prisma.user.findUnique({ where: { id: userId } });

	if (!user) throw new NotFoundError("User not found");
	if (user.isBlocked) throw new ForbiddenError("Account is suspended. Please contact support.");
	if (user.deletedAt) throw new BadRequestError("Account already deactivated");

	// Confirm password
	const isPasswordValid = await comparePassword(data.password, user.password);
	if (!isPasswordValid) throw new UnauthorizedError("Password is incorrect");

	// Prevent last admin from deactivating
	if (user.role === "ADMIN") {
		const adminCount = await prisma.user.count({
			where: { role: "ADMIN", deletedAt: null },
		});
		if (adminCount <= 1) {
			throw new ForbiddenError("Cannot delete the last admin account");
		}
	}

	// Soft delete: mark as deactivated, increment tokenVersion, revoke all sessions
	const [userUpdateResult] = await prisma.$transaction([
		prisma.user.updateMany({
			where: { id: userId, deletedAt: null },
			data: {
				deletedAt: new Date(),
				tokenVersion: { increment: 1 },
			},
		}),
		prisma.passwordResetToken.updateMany({
			where: { userId, isUsed: false },
			data: { isUsed: true },
		}),
		prisma.refreshToken.updateMany({
			where: { userId, isRevoked: false },
			data: { isRevoked: true, revokedBy: "LOGOUT" },
		}),
	]);

	if (userUpdateResult.count === 0) {
		throw new BadRequestError("Account was just deactivated by another request.");
	}

	// Publish event so other services can soft-clean their data
	await events.publishAccountDeleted({
		userId,
		email: user.email,
		name: user.name,
		traceId,
	});

	return { message: "Account deactivated successfully" };
}
