import z from "zod";

// ──────────────────────────────────────────────
// POST /auth/register
// ──────────────────────────────────────────────
export const registerBody = z.object({
	name: z
		.string({
			error: "Name is required",
		})
		.min(2, { error: "Name must be at least 2 characters" })
		.max(100, { error: "Name must be at most 100 characters" })
		.trim(),
	email: z
		.string({
			error: "Email is required",
		})
		.trim() // Removes the extra spaces
		.toLowerCase() // Normalizes "EXAMPLE.COL" to "example.col"
		.pipe(z.email({ error: "Invalid email address" })), // Validates the cleaned string
	password: z
		.string({ error: "Password is required" })
		.min(8, { error: "Password must be at least 8 characters" })
		.max(128, { error: "Password must be at most 128 characters" })
		.regex(/[A-Z]/, {
			error: "Password must contain at least one uppercase letter",
		})
		.regex(/[a-z]/, {
			error: "Password must contain at least one lowercase letter",
		})
		.regex(/[0-9]/, { error: "Password must contain at least one number" }),
});

// ──────────────────────────────────────────────
// POST /auth/login
// ──────────────────────────────────────────────
export const loginBody = z.object({
	email: z
		.string({
			error: "Email is required",
		})
		.trim() // Removes the extra spaces
		.toLowerCase() // Normalizes "EXAMPLE.COL" to "example.col"
		.pipe(z.email({ error: "Invalid email address" })), // Validates the cleaned string
	password: z.string({ error: "Password is required" }),
});

// ──────────────────────────────────────────────
// POST /auth/resend-verification
// ──────────────────────────────────────────────
export const resendVerificationBody = z.object({
	email: z
		.string({
			error: "Email is required",
		})
		.trim() // Removes the extra spaces
		.toLowerCase() // Normalizes "EXAMPLE.COL" to "example.col"
		.pipe(z.email({ error: "Invalid email address" })), // Validates the cleaned string
});

// ──────────────────────────────────────────────
// POST /auth/verify-email
// ──────────────────────────────────────────────
export const verifyEmailBody = z.object({
	token: z.string({ error: "Verification token is required" }).min(1),
});

// ──────────────────────────────────────────────
// POST /auth/forgot-password
// ──────────────────────────────────────────────
export const forgotPasswordBody = z.object({
	email: z
		.string({
			error: "Email is required",
		})
		.trim() // Removes the extra spaces
		.toLowerCase() // Normalizes "EXAMPLE.COL" to "example.col"
		.pipe(z.email({ error: "Invalid email address" })), // Validates the cleaned string
});

// ──────────────────────────────────────────────
// POST /auth/change-password
// ──────────────────────────────────────────────
export const changePasswordBody = z.object({
	currentPassword: z.string({ error: "Current password is required" }),
	newPassword: z
		.string({ error: "New password is required" })
		.min(8, { error: "Password must be at least 8 characters" })
		.max(128, { error: "Password must be at most 128 characters" })
		.regex(/[A-Z]/, { error: "Must contain at least one uppercase letter" })
		.regex(/[a-z]/, { error: "Must contain at least one lowercase letter" })
		.regex(/[0-9]/, { error: "Must contain at least one number" }),
});

// ──────────────────────────────────────────────
// POST /auth/reset-password
// ──────────────────────────────────────────────
export const resetPasswordBody = z.object({
	token: z.string({ error: "Reset token is required" }).min(1),
	newPassword: z
		.string({ error: "New password is required" })
		.min(8, { error: "Password must be at least 8 characters" })
		.max(128, { error: "Password must be at most 128 characters" })
		.regex(/[A-Z]/, { error: "Must contain at least one uppercase letter" })
		.regex(/[a-z]/, { error: "Must contain at least one lowercase letter" })
		.regex(/[0-9]/, { error: "Must contain at least one number" }),
});

// ──────────────────────────────────────────────
// PATCH /auth/users/:userId/role  (admin only)
// ──────────────────────────────────────────────
export const changeRoleBody = z.object({
	role: z.enum(["USER", "ADMIN"], { error: "Role must be USER or ADMIN" }),
});

// ──────────────────────────────────────────────
// PAGINATION-QUERY
// ──────────────────────────────────────────────
export const paginationQuery = z.object({
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(20),
});

// ──────────────────────────────────────────────
// DELETE /auth/me — delete account
// Requires password confirmation for security
// ──────────────────────────────────────────────
export const deleteAccountBody = z.object({
	password: z.string({ error: "Password confirmation is required" }),
});

// ──────────────────────────────────────────────
// PARAMS: Reusable URL Parameters
// We group these together because they are highly reusable across many routes.
// ──────────────────────────────────────────────
// PATCH /auth/users/:userId/block  (admin only)
export const userIdParams = z.object({
	userId: z.uuid({ error: "Invalid user ID" }),
});
// DELETE /auth/sessions/:tokenId  (revoke specific session)
export const sessionIdParams = z.object({
	tokenId: z.uuid({ error: "Invalid token ID" }),
});

// ──────────────────────────────────────────────
// Type exports — infer TypeScript types from Zod schemas
// ──────────────────────────────────────────────
export type RegisterInput = z.infer<typeof registerBody>;
export type LoginInput = z.infer<typeof loginBody>;
export type VerifyEmailInput = z.infer<typeof verifyEmailBody>;
export type ChangePasswordInput = z.infer<typeof changePasswordBody>;
export type ChangeRoleInput = z.infer<typeof changeRoleBody>;
export type UserIdParamsType = z.infer<typeof userIdParams>;
export type SessionIdParamsType = z.infer<typeof sessionIdParams>;
export type ResendVerificationInput = z.infer<typeof resendVerificationBody>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordBody>;
export type ResetPasswordInput = z.infer<typeof resetPasswordBody>;
export type PaginationInput = z.infer<typeof paginationQuery>;
export type DeleteAccountInput = z.infer<typeof deleteAccountBody>;
