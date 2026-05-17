import { z } from "zod";
import { logger } from "./logger";

const envSchema = z.object({
	//server
	PORT: z.coerce.number().default(6002),
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

	// Kafka
	KAFKA_BROKERS: z.string().default("localhost:9092"),
	KAFKA_CLIENT_ID: z.string().default("notification-service"),
	KAFKA_GROUP_ID: z.string().default("notification-group"),

	// Email — SMTP config
	// Development: uses Ethereal (fake SMTP, emails viewable at ethereal.email)
	// Production: swap to Resend, SES, Zoho, etc.
	SMTP_HOST: z.string().default(""),
	SMTP_PORT: z.coerce.number().default(587),
	SMTP_USER: z.string().default(""),
	SMTP_PASS: z.string().default(""),
	EMAIL_FROM: z.string().default("noreply@multivendor-ecom.com"),

	CLIENT_URL: z.string(),
});

//Parse and validate - throws on invalid config
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
	const errorMessages = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
	logger.fatal(`Invalid environment variables: \n${errorMessages}`);
	process.exit(1);
}

export const env = parsed.data;
