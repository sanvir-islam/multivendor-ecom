import cron from "node-cron";
import { createLogger } from "@multivendor-ecom/shared";
import { cleanupExpiredTokens } from "./tasks/cleanup-tokens.job";
import { anonymizeDeletedUsers } from "./tasks/anonymize-deleted-users.job";

const logger = createLogger("scheduler");

export function startScheduledJobs(): void {
	// ──────────────────────────────────────────────
	// TOKEN CLEANUP — every day at 3:00 AM
	// Removes expired refresh tokens and revoked tokens older than 24h
	// ──────────────────────────────────────────────
	cron.schedule("0 3 * * *", async () => {
		try {
			logger.info("Starting daily token cleanup...");
			const result = await cleanupExpiredTokens();
			logger.info({ deleted: result.deleted }, "Token cleanup complete");
		} catch (err) {
			logger.error({ err }, "Token cleanup failed");
		}
	});

	// ──────────────────────────────────────────────
	// USER ANONYMIZATION — every day at 4:00 AM
	// Anonymizes users whose accounts were soft-deleted >30 days ago
	// Staggered 1 hour after token cleanup to avoid DB contention
	// ──────────────────────────────────────────────
	cron.schedule("0 4 * * *", async () => {
		try {
			const result = await anonymizeDeletedUsers();
			logger.info({ anonymized: result.anonymized }, "Anonymization batch complete");
		} catch (err) {
			logger.error({ err }, "Anonymization job failed");
		}
	});

	logger.info("Scheduled jobs started: token-cleanup (3:00 AM), anonymization (4:00 AM)");
}
