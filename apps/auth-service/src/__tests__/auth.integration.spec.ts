import request from "supertest";
import app from "../main";
import { cleanDatabase, connectTestDatabase, disconnectTestDatabase, testPrisma } from "./helpers/db";
import * as events from "../events/publisher";

interface AuthResponse {
	success: boolean;
	message?: string;
	data?: {
		id: string;
		email: string;
		role: string;
		isVerified: boolean;
		password?: string;
	};
	_dev?: {
		verificationToken: string;
	};
}

// ──────────────────────────────────────────────
// Test data
// ──────────────────────────────────────────────
const testUser = {
	name: "Test User",
	email: "test@example.com",
	password: "TestPass123",
};

// const testUser2 = {
// 	name: "Second User",
// 	email: "second@example.com",
// 	password: "SecondPass123",
// };

// ──────────────────────────────────────────────
// MOCK KAFKA EVENTS GLOBALLY
// ──────────────────────────────────────────────
jest.mock("../events/publisher", () => ({
	publishUserRegistered: jest.fn().mockResolvedValue(undefined),
	publishPasswordChanged: jest.fn().mockResolvedValue(undefined),
	publishAccountLocked: jest.fn().mockResolvedValue(undefined),
	publishTokenTheftDetected: jest.fn().mockResolvedValue(undefined),
	publishUserBlocked: jest.fn().mockResolvedValue(undefined),
	publishUserRoleChanged: jest.fn().mockResolvedValue(undefined),
}));

// Helper: register and login, return cookies for authenticated requests
async function createSession(userData = testUser) {
	await request(app).post("/register").send(userData);
	const res = await request(app).post("/login").send({
		email: userData.email,
		password: userData.password,
	});

	return {
		cookies: res.headers["set-cookie"],
		user: res.body.data,
	};
}

// ──────────────────────────────────────────────
// Setup / Teardown
// ──────────────────────────────────────────────
beforeAll(async () => {
	await connectTestDatabase();
});

beforeEach(async () => {
	await cleanDatabase();
	jest.clearAllMocks();
});

afterAll(async () => {
	await disconnectTestDatabase();
});

// ══════════════════════════════════════════════
// REGISTER
// ══════════════════════════════════════════════
describe("POST /register", () => {
	it("should register a new user with status 201", async () => {
		const res = await request(app).post("/register").send(testUser);
		const body = res.body as AuthResponse;

		expect(res.status).toBe(201);
		expect(res.body.success).toBe(true);
		expect(body.data?.email).toBe(testUser.email);
		expect(body.data?.role).toBe("USER");
		expect(body.data?.isVerified).toBe(false);
		expect(body.data?.password).toBeUndefined();
	});

	it("should return verifcation token in development mode", async () => {
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "development";

		const res = await request(app).post("/register").send(testUser);
		expect(res.status).toBe(201);
		expect(res.body._dev?.verificationToken).toBeDefined();

		process.env.NODE_ENV = originalEnv;
	});

	it("should return 409 for duplicate email", async () => {
		await request(app).post("/register").send(testUser);
		const res = await request(app).post("/register").send(testUser);

		expect(res.status).toBe(409);
		expect(res.body.success).toBe(false);
		expect(res.body.error.message).toMatch(/already registered/i);
	});

	it("should return 400 for missing name", async () => {
		const res = await request(app).post("/register").send({ email: "test@example.com", password: "TestPass123" });
		expect(res.status).toBe(400);
		expect(res.body.errors).toBeDefined();
	});

	it("should return 400 for invalid email", async () => {
		const res = await request(app)
			.post("/register")
			.send({ ...testUser, email: "not-an-email" });

		expect(res.status).toBe(400);
	});

	it("should return 400 for weak password (no uppercase)", async () => {
		const res = await request(app)
			.post("/register")
			.send({ ...testUser, password: "weakpass123" });

		expect(res.status).toBe(400);
	});

	it("should return 400 for short password", async () => {
		const res = await request(app)
			.post("/register")
			.send({ ...testUser, password: "Ab1" });

		expect(res.status).toBe(400);
	});

	it("should trim and lowercase the email", async () => {
		const res = await request(app)
			.post("/register")
			.send({ ...testUser, email: "  Test@EXAMPLE.COM  " });

		expect(res.status).toBe(201);
		expect(res.body.data.email).toBe("test@example.com");
	});

	it("should default role to USER (no role field in request)", async () => {
		const res = await request(app).post("/register").send(testUser);

		expect(res.body.data.role).toBe("USER");
	});

	it("should ignore injected roles and force role to USER", async () => {
		const res = await request(app)
			.post("/register")
			.send({ ...testUser, role: "SUPER_ADMIN" }); // Hacker tries to be admin

		expect(res.status).toBe(201);
		expect(res.body.data.role).toBe("USER"); // Backend says "Nice try."
	});

	it("should successfully publish the USER_REGISTERED event to Kafka", async () => {
		await request(app).post("/register").send(testUser);

		expect(events.publishUserRegistered).toHaveBeenCalledTimes(1);
		expect(events.publishUserRegistered).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: expect.any(String),
				email: testUser.email,
				name: testUser.name,
				role: "USER",
				verificationToken: expect.any(String),
				traceId: expect.any(String),
			}),
		);
	});
});

// ══════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════
describe("POST /login", () => {
	beforeEach(async () => {
		await request(app).post("/register").send(testUser);
	});

	it("should login and set HttpOnly cookies", async () => {
		const res = await request(app).post("/login").send({ email: testUser.email, password: testUser.password });

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.email).toBe(testUser.email);

		const cookies = res.headers["set-cookie"] as unknown as string[];
		expect(cookies).toBeDefined();
		expect(cookies.some((c: string) => c.includes("access_token"))).toBe(true);
		expect(cookies.some((c: string) => c.includes("refresh_token"))).toBe(true);
		expect(cookies.some((c: string) => c.includes("HttpOnly"))).toBe(true);
	});

	it("should login successfully ignoring email case and whitespace", async () => {
		const res = await request(app).post("/login").send({ email: "  TEST@EXAMPLE.COM  ", password: testUser.password });

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
	});

	it("should return 400 for missing email or password", async () => {
		// Missing password
		const res1 = await request(app).post("/login").send({ email: testUser.email });
		expect(res1.status).toBe(400);

		// Missing email
		const res2 = await request(app).post("/login").send({ password: testUser.password });
		expect(res2.status).toBe(400);
	});

	it("should return 401 for wrong password", async () => {
		const res = await request(app).post("/login").send({ email: testUser.email, password: "WrongPass123" });

		expect(res.status).toBe(401);
		expect(res.body.error.message).toMatch(/invalid email or password/i);
	});

	it("should return 401 for non-existent email", async () => {
		const res = await request(app).post("/login").send({ email: "nobody@example.com", password: "SomePass123" });

		expect(res.status).toBe(401);
		// Same message as wrong password — don't reveal if email exists
		expect(res.body.error.message).toMatch(/invalid email or password/i);
	});

	it("should return 403 for blocked user", async () => {
		// blocking the user
		await testPrisma.user.update({
			where: { email: testUser.email },
			data: { isBlocked: true },
		});

		const res = await request(app).post("/login").send({ email: testUser.email, password: testUser.password });

		expect(res.status).toBe(403);
		expect(res.body.error.message).toMatch(/suspended/i);
	});

	it("should create a refresh token record in database", async () => {
		await request(app).post("/login").send({ email: testUser.email, password: testUser.password });

		const tokens = await testPrisma.refreshToken.findMany({
			where: { user: { email: testUser.email } },
		});

		expect(tokens).toHaveLength(1);
		expect(tokens[0].isRevoked).toBe(false);
		// Token stored in DB is a SHA-256 hash (64 chars), NOT the raw opaque token
		expect(tokens[0].token).toHaveLength(64);
	});

	it("should lock account after 5 failed attempts", async () => {
		// Fail 5 times
		for (let i = 0; i < 5; i++) {
			await request(app).post("/login").send({ email: testUser.email, password: "WrongPass123" });
		}

		// 6th attempt — should be locked even with correct password
		const res = await request(app).post("/login").send({ email: testUser.email, password: testUser.password });

		expect(res.status).toBe(429);
		expect(res.body.error.message).toMatch(/locked/i);
	});

	it("should reset failed attempts on successful login", async () => {
		// Fail 3 times
		for (let i = 0; i < 3; i++) {
			await request(app).post("/login").send({ email: testUser.email, password: "WrongPass123" });
		}

		// Succeed
		await request(app).post("/login").send({ email: testUser.email, password: testUser.password });

		// Check DB — attempts should be reset
		const user = await testPrisma.user.findUnique({ where: { email: testUser.email } });
		expect(user?.failedLoginAttempts).toBe(0);
		expect(user?.lockUntil).toBeNull();
	});

	it("should allow login after lock duration expires", async () => {
		// 1. Manually lock the account in the past (e.g., locked 30 mins ago)
		const pastDate = new Date(Date.now() - 30 * 60 * 1000);
		await testPrisma.user.update({
			where: { email: testUser.email },
			data: { failedLoginAttempts: 5, lockUntil: pastDate },
		});

		// 2. Attempt to login with correct credentials
		const res = await request(app).post("/login").send({ email: testUser.email, password: testUser.password });

		// 3. It should succeed and clear the lock
		expect(res.status).toBe(200);

		const dbUser = await testPrisma.user.findUnique({ where: { email: testUser.email } });
		expect(dbUser?.failedLoginAttempts).toBe(0);
		expect(dbUser?.lockUntil).toBeNull();
	});

	it("should successfully publish the ACCOUNT_LOCKED event to Kafka", async () => {
		// Fail 5 times
		for (let i = 0; i < 5; i++) {
			await request(app).post("/login").send({ email: testUser.email, password: "WrongPass123" });
		}

		// 6th attempt — should be locked even with correct password
		await request(app).post("/login").send({ email: testUser.email, password: testUser.password });

		expect(events.publishAccountLocked).toHaveBeenCalledTimes(1);
		expect(events.publishAccountLocked).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: expect.any(String),
				email: testUser.email,
				name: testUser.name,
				failedAttempts: 5,
				lockUntil: expect.any(String),
				traceId: expect.any(String),
			}),
		);
	});

	it("should reactivate a soft-deleted account upon successful login", async () => {
		// 1. Soft-delete the user in the database
		await testPrisma.user.update({
			where: { email: testUser.email },
			data: { deletedAt: new Date() },
		});

		// 2. Login with correct credentials
		const res = await request(app).post("/login").send({ email: testUser.email, password: testUser.password });

		// 3. Ensure login succeeded
		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);

		// 4. Verify in DB that deletedAt is now null
		const user = await testPrisma.user.findUnique({ where: { email: testUser.email } });
		expect(user?.deletedAt).toBeNull();
	});
});

// ══════════════════════════════════════════════
// REFRESH TOKEN
// ══════════════════════════════════════════════
describe("POST /refresh", () => {
	it("should refresh tokens and set new cookies", async () => {
		const { cookies } = await createSession();

		const res = await request(app).post("/refresh").set("Cookie", cookies);

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.headers["set-cookie"]).toBeDefined();
	});

	it("should return 401 when no refresh token cookie is provided", async () => {
		const res = await request(app).post("/refresh");

		expect(res.status).toBe(401);
	});

	it("should return 401 if refresh token is explicitly expired", async () => {
		const { cookies, user } = await createSession();

		await testPrisma.refreshToken.updateMany({
			where: { userId: user.id, isRevoked: false },
			data: { expiresAt: new Date(Date.now() - 10000) }, // Expired 10 seconds ago
		});

		const res = await request(app).post("/refresh").set("Cookie", cookies);

		expect(res.status).toBe(401);
		expect(res.body.error?.message || res.body.message).toMatch(/expired/i);
	});

	it("should return 401 if refresh token is malformed", async () => {
		const res = await request(app).post("/refresh").set("Cookie", ["refreshToken=invalid.token.data"]);

		expect(res.status).toBe(401);
	});

	it("should return 401 if the associated user is deleted", async () => {
		const { cookies, user } = await createSession();

		// Delete user before refreshing
		await testPrisma.user.delete({ where: { id: user.id } });

		const res = await request(app).post("/refresh").set("Cookie", cookies);

		expect(res.status).toBe(401);
	});

	it("should return 403 (Forbidden) if the user is blocked", async () => {
		const { cookies, user } = await createSession();

		// Admin blocks the user
		await testPrisma.user.update({
			where: { id: user.id },
			data: { isBlocked: true },
		});

		const res = await request(app).post("/refresh").set("Cookie", cookies);

		expect(res.status).toBe(403);
		expect(res.body.error?.message).toMatch(/suspended/i);
	});

	it("should revoke all tokens if a rotated token is reused (theft detection)", async () => {
		const { cookies: oldCookies, user } = await createSession();

		// Refresh once to rotate the token
		await request(app).post("/refresh").set("Cookie", oldCookies);

		// Reuse the old token to trigger theft detection
		const res = await request(app).post("/refresh").set("Cookie", oldCookies);

		expect(res.status).toBe(401);
		expect(res.body.error.message).toMatch(/suspicious|security/i);

		// Verify nuclear revocation for the user
		const activeTokens = await testPrisma.refreshToken.findMany({
			where: { userId: user.id, isRevoked: false },
		});
		expect(activeTokens).toHaveLength(0);
	});

	it("should return 401 for a manually revoked token without triggering theft detection", async () => {
		const { cookies, user } = await createSession();

		// Find and revoke the active token (simulating normal logout)
		const activeToken = await testPrisma.refreshToken.findFirstOrThrow({
			where: { userId: user.id, isRevoked: false },
		});
		await testPrisma.refreshToken.updateMany({
			where: { id: activeToken.id },
			data: { isRevoked: true, revokedBy: "LOGOUT" },
		});

		const res = await request(app).post("/refresh").set("Cookie", cookies);

		expect(res.status).toBe(401);

		// Ensure standard error, not a security/theft breach error
		const errorMessage = res.body.error?.message || res.body.message || "";
		expect(errorMessage).not.toMatch(/suspicious|security/i);
	});

	it("should reject token if user tokenVersion has incremented", async () => {
		const { cookies, user } = await createSession();

		// Increment tokenVersion (simulating password change)
		await testPrisma.user.update({
			where: { id: user.id },
			data: { tokenVersion: { increment: 1 } },
		});

		const res = await request(app).post("/refresh").set("Cookie", cookies);

		expect(res.status).toBe(401);

		const errorMessage = res.body.error?.message || res.body.message || "";
		expect(errorMessage).toMatch(/invalidated|unauthorized/i);
	});

	it("should revoke all tokens if a rotated token is reused (theft detection)", async () => {
		const { cookies: oldCookies, user } = await createSession();

		// Refresh once to rotate the token
		await request(app).post("/refresh").set("Cookie", oldCookies);

		// Reuse the old token to trigger theft detection
		const res = await request(app).post("/refresh").set("Cookie", oldCookies);

		expect(res.status).toBe(401);
		expect(res.body.error.message).toMatch(/suspicious|security/i);

		// Verify nuclear revocation
		const activeTokens = await testPrisma.refreshToken.findMany({
			where: { userId: user.id, isRevoked: false },
		});
		expect(activeTokens).toHaveLength(0);

		//  Verify the Kafka event was published!
		expect(events.publishTokenTheftDetected).toHaveBeenCalledTimes(1);
		expect(events.publishTokenTheftDetected).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: user.id,
				traceId: expect.any(String),
			}),
		);
	});
});

// ══════════════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════════════
describe("POST /logout", () => {
	it("should revoke token and clear cookies", async () => {
		const { cookies } = await createSession();
		const res = await request(app).post("/logout").set("Cookie", cookies);

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);

		// Token should be revoked in DB with reason LOGOUT
		const tokens = await testPrisma.refreshToken.findMany({
			where: { user: { email: testUser.email }, isRevoked: false },
		});
		expect(tokens).toHaveLength(0);
	});

	it("should not trigger theft detection (nuclear revocation) when a logged-out token is reused", async () => {
		// 1. User logs in on Laptop
		const { cookies: laptopCookies } = await createSession();

		// 2. User logs in on Phone
		const phoneLoginRes = await request(app).post("/login").send({ email: testUser.email, password: testUser.password });
		phoneLoginRes.headers["set-cookie"];

		// 3. User clicks "Logout" on the Laptop
		await request(app).post("/logout").set("Cookie", laptopCookies);

		// 4. A stale tab on the Laptop accidentally tries to refresh using the logged-out cookie
		const res = await request(app).post("/refresh").set("Cookie", laptopCookies);

		// It should fail authorization normally
		expect(res.status).toBe(401);
		expect(res.body.error?.message || res.body.message).not.toMatch(/suspicious|security/i);

		// 5. Verify the Phone session was NOT destroyed by the Laptop's mistake
		const activeTokens = await testPrisma.refreshToken.findMany({
			where: { user: { email: testUser.email }, isRevoked: false },
		});

		expect(activeTokens).toHaveLength(1); // The phone token survives
	});
});

// ══════════════════════════════════════════════
// LOGOUT ALL
// ══════════════════════════════════════════════
describe("POST /logout-all", () => {
	it("should revoke all sessions and increment tokenVersion", async () => {
		const { cookies } = await createSession();

		// Login from a second device
		await request(app).post("/login").send({ email: testUser.email, password: testUser.password });

		const user = await testPrisma.user.findUniqueOrThrow({ where: { email: testUser.email } });

		await request(app).post("/logout-all").set("Cookie", cookies).set("x-user-id", user.id);

		// All tokens revoked
		const activeTokens = await testPrisma.refreshToken.findMany({
			where: { userId: user.id, isRevoked: false },
		});
		expect(activeTokens).toHaveLength(0);

		// TokenVersion incremented
		const updatedUser = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(updatedUser.tokenVersion).toBe(user.tokenVersion + 1);
	});
});

// ══════════════════════════════════════════════
// RESEND VERIFICATION EMAIL
// ══════════════════════════════════════════════
describe("POST /resend-verification", () => {
	const genericMessage = "If your email is registered and not yet verified, a new verification link has been sent.";

	beforeEach(async () => {
		// Clear mocks before each test so call counts are fresh
		jest.clearAllMocks();

		// Create an unverified user for the base success case
		await testPrisma.user.create({
			data: {
				name: "Unverified User",
				email: "unverified@example.com",
				password: "hashedpassword123",
				isVerified: false,
			},
		});
	});

	it("should update timestamp and publish event for a valid, unverified user", async () => {
		const res = await request(app).post("/resend-verification").send({ email: "unverified@example.com" });

		expect(res.status).toBe(200);
		expect(res.body.message).toBe(genericMessage);

		// Verify DB timestamp was updated
		const user = await testPrisma.user.findUnique({ where: { email: "unverified@example.com" } });
		expect(user?.lastVerificationEmailAt).not.toBeNull();

		// Verify Kafka event fired
		expect(events.publishUserRegistered).toHaveBeenCalledTimes(1);
		expect(events.publishUserRegistered).toHaveBeenCalledWith(
			expect.objectContaining({
				email: "unverified@example.com",
				verificationToken: expect.any(String),
				traceId: expect.any(String),
			}),
		);
	});

	it("should silently skip if the email does not exist", async () => {
		const res = await request(app).post("/resend-verification").send({ email: "nobody@example.com" });

		// Still returns 200 and generic message!
		expect(res.status).toBe(200);
		expect(res.body.message).toBe(genericMessage);

		// Ensure NO event was fired
		expect(events.publishUserRegistered).not.toHaveBeenCalled();
	});

	it("should silently skip if the user is already verified", async () => {
		// Manually verify the user
		await testPrisma.user.update({
			where: { email: "unverified@example.com" },
			data: { isVerified: true },
		});

		const res = await request(app).post("/resend-verification").send({ email: "unverified@example.com" });

		expect(res.status).toBe(200);
		expect(res.body.message).toBe(genericMessage);
		expect(events.publishUserRegistered).not.toHaveBeenCalled();
	});

	it("should silently skip if the user is blocked", async () => {
		await testPrisma.user.update({
			where: { email: "unverified@example.com" },
			data: { isBlocked: true },
		});

		const res = await request(app).post("/resend-verification").send({ email: "unverified@example.com" });

		expect(res.status).toBe(200);
		expect(res.body.message).toBe(genericMessage);
		expect(events.publishUserRegistered).not.toHaveBeenCalled();
	});

	it("should silently skip if the user is soft-deleted", async () => {
		await testPrisma.user.update({
			where: { email: "unverified@example.com" },
			data: { deletedAt: new Date() },
		});

		const res = await request(app).post("/resend-verification").send({ email: "unverified@example.com" });

		expect(res.status).toBe(200);
		expect(res.body.message).toBe(genericMessage);
		expect(events.publishUserRegistered).not.toHaveBeenCalled();
	});

	it("should enforce the 1-minute rate limit and silently skip", async () => {
		// Set the last email time to just 10 seconds ago
		const recentDate = new Date(Date.now() - 10 * 1000);
		await testPrisma.user.update({
			where: { email: "unverified@example.com" },
			data: { lastVerificationEmailAt: recentDate },
		});

		const res = await request(app).post("/resend-verification").send({ email: "unverified@example.com" });

		expect(res.status).toBe(200);
		expect(res.body.message).toBe(genericMessage);

		// Event should NOT fire because of the cooldown
		expect(events.publishUserRegistered).not.toHaveBeenCalled();
	});
});

// ══════════════════════════════════════════════
// VERIFY EMAIL
// ══════════════════════════════════════════════
describe("POST /verify-email", () => {
	it("should verify email with valid token", async () => {
		process.env.NODE_ENV = "development";
		const registerRes = await request(app).post("/register").send(testUser);
		process.env.NODE_ENV = "test";

		const token = registerRes.body._dev?.verificationToken;
		const res = await request(app).post("/verify-email").send({ token });
		expect(res.status).toBe(200);

		const user = await testPrisma.user.findUnique({ where: { email: testUser.email } });
		expect(user?.isVerified).toBe(true);
	});

	it("should return 400 for invalid token", async () => {
		const res = await request(app).post("/verify-email").send({ token: "invalid-garbage-token" });

		expect(res.status).toBe(400);
	});

	it("should return 400 if already verified", async () => {
		const registerRes = await request(app).post("/register").send(testUser);
		const token = registerRes.body._dev?.verificationToken;
		if (!token) return;

		// Verify once
		await request(app).post("/verify-email").send({ token });

		// Verify again — should fail
		const res = await request(app).post("/verify-email").send({ token });
		expect(res.status).toBe(400);
		expect(res.body.message).toMatch(/already verified/i);
	});
});
