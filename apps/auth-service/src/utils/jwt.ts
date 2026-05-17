import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

// ──────────────────────────────────────────────
// Token Payload Interfaces
// ──────────────────────────────────────────────
export interface AccessTokenPayload {
	userId: string;
	role: string;
	tokenVersion: number;
	isVerified: boolean;
}

// ──────────────────────────────────────────────
// Generate access token (15 min default)
// Short-lived — if stolen, damage is limited to 15 minutes
// ──────────────────────────────────────────────
export function generateAccessToken(payload: AccessTokenPayload): string {
	return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
		expiresIn: env.ACCESS_TOKEN_EXPIRY as SignOptions["expiresIn"],
	});
}
// ──────────────────────────────────────────────
// Email verification token (24 hours)
// One-time use, contains only userId
// ──────────────────────────────────────────────
export function generateVerificationToken(userId: string): string {
	return jwt.sign({ userId }, env.EMAIL_VERIFICATION_SECRET, {
		expiresIn: "24h",
	});
}

// ──────────────────────────────────────────────
// Verify functions — return decoded payload or throw
// ──────────────────────────────────────────────
export function verifyAccessToken(token: string): AccessTokenPayload {
	return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyVerificationToken(token: string): { userId: string } {
	return jwt.verify(token, env.EMAIL_VERIFICATION_SECRET) as { userId: string };
}
