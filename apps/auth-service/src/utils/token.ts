import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env";

// 40 bytes = 80 hex characters — sufficiently random to be unguessable
export function generateOpaqueToken(): string {
	return randomBytes(40).toString("hex");
}

// SHA-256 is fast (good for lookup) and one-way (good for security)
export function hashToken(rawToken: string): string {
	return createHash("sha256").update(rawToken).digest("hex");
}

// ──────────────────────────────────────────────
// Parse refresh token expiry string to milliseconds
// Reads from env: REFRESH_TOKEN_EXPIRY (e.g., "7d", "24h", "30m")
// ──────────────────────────────────────────────
export function getRefreshTokenExpiryDate(): Date {
	const expiry = env.REFRESH_TOKEN_EXPIRY;
	// Parses time strings ("15m" / "7d") into amount and unit (s/m/h/d)
	const match = expiry.match(/^(\d+)([smhd])$/);
	if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // default 7 days

	const value = parseInt(match[1], 10);
	const unit = match[2];
	const multipliers: Record<string, number> = {
		s: 1000,
		m: 60 * 1000,
		h: 60 * 60 * 1000,
		d: 24 * 60 * 60 * 1000,
	};

	return new Date(Date.now() + value * (multipliers[unit] || multipliers.d));
}
