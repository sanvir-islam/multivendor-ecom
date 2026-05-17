import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "./env.js";
import { logger } from "./logger.js";

const createPrismaClient = () => {
	// 1. Initialize the standard Node.js Postgres pool
	const pool = new Pool({ connectionString: process.env.AUTH_DATABASE_URL_TEST || env.AUTH_DATABASE_URL });

	// 2. Pass it to the Prisma Adapter (This is required in Prisma 7!)
	const adapter = new PrismaPg(pool);

	return new PrismaClient({
		adapter,
		log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
	});
};

const globalForPrisma = globalThis as unknown as {
	prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function connectDB() {
	try {
		await prisma.$connect();
		logger.info("Connected to Auth PostgreSQL database");
	} catch (error) {
		logger.fatal({ err: error }, "Database connection failed");
		process.exit(1);
	}
}

export async function disconnectDB() {
	await prisma.$disconnect();
	logger.info("🔌 [Auth Service] Database disconnected successfully");
}
