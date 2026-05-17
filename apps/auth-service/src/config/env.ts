import { z } from "zod";
import { logger } from "./logger";

const envSchema = z.object({
	//server
	PORT: z.coerce.number().default(6001),
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

	// Database
	AUTH_DATABASE_URL: z.string().min(1, { error: "AUTH_DATABASE_URL is required" }),

	// JWT secrets
	JWT_ACCESS_SECRET: z.string().min(32, { error: "JWT_ACCESS_SECRET must be at least 32 characters" }),
	ACCESS_TOKEN_EXPIRY: z.string().default("15m"),
	REFRESH_TOKEN_EXPIRY: z.string().default("7d"),

	// Email verification
	EMAIL_VERIFICATION_SECRET: z.string().min(32, {
		error: "EMAIL_VERIFICATION_SECRET must be at least 32 characters",
	}),
	CLIENT_URL: z.string().default("http://localhost:3000"),

	// Kafka
	KAFKA_BROKERS: z.string().default("localhost:9092"),
	KAFKA_CLIENT_ID: z.string().default("notification-service"),
	KAFKA_GROUP_ID: z.string().default("notification-group"),

	// Redis (for future rate limiting / caching)
});

//Parse and validate - throws on invalid config
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
	const errorMessages = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
	logger.fatal(`Invalid environment variables: \n${errorMessages}`);
	process.exit(1);
}

export const env = parsed.data;
