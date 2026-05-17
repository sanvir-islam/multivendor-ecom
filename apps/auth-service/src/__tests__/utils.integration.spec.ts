// ──────────────────────────────────────────────
// HASH UTILITIES

import { comparePassword, hashPassword } from "../utils/hash";
import {
	type AccessTokenPayload,
	generateAccessToken,
	generateVerificationToken,
	verifyAccessToken,
	verifyVerificationToken,
} from "../utils/jwt";
import { generateOpaqueToken, getRefreshTokenExpiryDate, hashToken } from "../utils/token";
import { setAuthCookies, clearAuthCookies } from "../utils/cookies";
import type { Response } from "express";

// ──────────────────────────────────────────────
// HASH UTILITIES
// ──────────────────────────────────────────────
describe("Password Hashing (hash.ts)", () => {
	const plainPassword = "TestPassword123";

	it("should hash a password and not return the original", async () => {
		const hashed = await hashPassword(plainPassword);
		expect(hashed).not.toBe(plainPassword);
		expect(hashed.length).toBeGreaterThan(50); // bcrypt hashes are ~60 chars
	});

	it("should produce different hashes for teh same password (due to salt)", async () => {
		const hash1 = await hashPassword(plainPassword);
		const hash2 = await hashPassword(plainPassword);
		expect(hash1).not.toBe(hash2);
	});

	it("should return true for correct password comparison", async () => {
		const hashed = await hashPassword(plainPassword);
		const result = await comparePassword(plainPassword, hashed);
		expect(result).toBe(true);
	});

	it("should return false for incorrect password comparison", async () => {
		const hashed = await hashPassword(plainPassword);
		const result = await comparePassword("WrongPassword", hashed);
		expect(result).toBe(false);
	});
});

// ──────────────────────────────────────────────
// OPAQUE TOKEN UTILITIES
// ──────────────────────────────────────────────
describe("Opaque Token (token.ts)", () => {
	it("should generate a random token of correct length", () => {
		const token = generateOpaqueToken();
		expect(token).toHaveLength(80); // 40 bytes = 80 hex chars
		expect(token).toMatch(/^[a-f0-9]+$/); // hex characters only
	});

	it("should generate unique token every time", () => {
		const token1 = generateOpaqueToken();
		const token2 = generateOpaqueToken();
		expect(token1).not.toBe(token2);
	});

	it("should produce consistent hash for the same token", () => {
		const token = generateOpaqueToken();
		const hashedToken1 = hashToken(token);
		const hashedToken2 = hashToken(token);
		expect(hashedToken1).toBe(hashedToken2);
	});

	it("should produce a 64-char SHA-256 hash", () => {
		const hash = hashToken(generateOpaqueToken());
		expect(hash).toHaveLength(64); // SHA-256 = 64 hex chars
		expect(hash).toMatch(/^[a-f0-9]+$/); // hex characters only
	});

	it("should return a future date for token expiry", () => {
		const expiry = getRefreshTokenExpiryDate();
		expect(expiry.getTime()).toBeGreaterThan(Date.now());
	});
});

// ──────────────────────────────────────────────
// JWT UTILITIES (Access Token + Verification Token)
// ──────────────────────────────────────────────
describe("Access token (jwt.ts)", () => {
	const payload: AccessTokenPayload = {
		userId: "550e8400-e29b-41d4-a716-446655440000",
		role: "USER",
		tokenVersion: 0,
		isVerified: false,
	};

	it("should generate a valid JWT string", () => {
		const token = generateAccessToken(payload);
		expect(typeof token).toBe("string");
		expect(token.split(".")).toHaveLength(3); // JWT has 3 parts: header.payload.signature
	});

	it("should verify and return the original payload", () => {
		const token = generateAccessToken(payload);
		const decoded = verifyAccessToken(token);
		expect(decoded.userId).toBe(payload.userId);
		expect(decoded.role).toBe(payload.role);
		expect(decoded.tokenVersion).toBe(payload.tokenVersion);
	});

	it("should throw on invalid token", () => {
		expect(() => verifyAccessToken("invalid.token.string")).toThrow();
	});

	it("should throw on tampered token", () => {
		const token = generateAccessToken(payload);
		const tempered = `${token.slice(0, -5)}XXXXX`;
		expect(() => verifyAccessToken(tempered)).toThrow();
	});
});

describe("Verification Token (jwt.ts)", () => {
	const userId = "550e8400-e29b-41d4-a716-446655440000";

	it("should generate and verify correctly", () => {
		const token = generateVerificationToken(userId);
		const decoded = verifyVerificationToken(token);
		expect(decoded.userId).toBe(userId);
	});

	it("should throw on invalid token", () => {
		expect(() => verifyVerificationToken("invalid.token.string")).toThrow();
	});
});

// ──────────────────────────────────────────────
// COOKIE UTILITIES
// ──────────────────────────────────────────────
describe("Cookies (cookies.ts)", () => {
	// We create a fake Express Response object
	let mockRes: Partial<Response>;

	beforeEach(() => {
		// Reset the spies before every test
		mockRes = {
			cookie: jest.fn(),
			clearCookie: jest.fn(),
		};
	});

	describe("setAuthCookies", () => {
		it("should set access_token with correct 15-minute configuration", () => {
			setAuthCookies(mockRes as Response, "access-123", "refresh-456");

			// Assert exact call for Access Token
			expect(mockRes.cookie).toHaveBeenCalledWith(
				"access_token",
				"access-123",
				expect.objectContaining({
					httpOnly: true,
					sameSite: "none",
					maxAge: 15 * 60 * 1000, // Exactly 15 minutes
					path: "/",
				}),
			);
		});

		it("should set refresh_token with correct 7-day configuration", () => {
			setAuthCookies(mockRes as Response, "access-123", "refresh-456");

			// Assert exact call for Refresh Token
			expect(mockRes.cookie).toHaveBeenCalledWith(
				"refresh_token",
				"refresh-456",
				expect.objectContaining({
					httpOnly: true,
					sameSite: "none",
					maxAge: 7 * 24 * 60 * 60 * 1000, // Exactly 7 days
					path: "/",
				}),
			);
		});
	});

	describe("clearAuthCookies", () => {
		it("should clear both access and refresh cookies", () => {
			clearAuthCookies(mockRes as Response);

			expect(mockRes.clearCookie).toHaveBeenCalledTimes(2);
			expect(mockRes.clearCookie).toHaveBeenCalledWith("access_token", { path: "/" });
			expect(mockRes.clearCookie).toHaveBeenCalledWith("refresh_token", { path: "/" });
		});
	});
});
