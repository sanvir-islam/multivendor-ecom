import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

const testDatabaseUrl = process.env.AUTH_DATABASE_URL_TEST;

if (!testDatabaseUrl) {
	throw new Error("FATAL: AUTH_DATABASE_URL_TEST is missing. Refusing to run tests to protect dev data.");
}

// Initialize the exact same adapter setup as production
const pool = new Pool({ connectionString: testDatabaseUrl });
const adapter = new PrismaPg(pool);

export const testPrisma = new PrismaClient({
	adapter,
	log: [], // Keep it silent during tests so terminal output is clean
});

// Clean all tables — run before each test for isolation
// Order matters: delete child records (foreign keys) first
export async function cleanDatabase() {
	await testPrisma.refreshToken.deleteMany();
	await testPrisma.user.deleteMany();
}

// Connect to test database
export async function connectTestDatabase() {
	await testPrisma.$connect();
}

// Disconnect after all tests
export async function disconnectTestDatabase() {
	await cleanDatabase();
	await testPrisma.$disconnect();
	await pool.end();
}
