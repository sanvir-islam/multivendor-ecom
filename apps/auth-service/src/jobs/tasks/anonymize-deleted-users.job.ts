import { prisma } from "../../config/database";
import { createLogger } from "@multivendor-ecom/shared";
import * as events from "../../events/publisher";

const logger = createLogger("anonymization-job");

// Users have 30 days to change their mind and log back in.
// After 30 days, their personal data is wiped permanently.
const GRACE_PERIOD_DAYS = 30;

export async function anonymizeDeletedUsers(): Promise<{ anonymized: number }> {
	const cutoffDate = new Date(Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

	// Find candidates — soft-deleted past grace period, not yet anonymized
	const candidates = await prisma.user.findMany({
		where: {
			deletedAt: { lt: cutoffDate, not: null },
			isAnonymized: false,
		},
		select: { id: true, email: true, name: true },
	});

	if (candidates.length === 0) {
		logger.info("No users to anonymize today");
		return { anonymized: 0 };
	}

	logger.info({ count: candidates.length }, "Starting anonymization batch");
	let successCount = 0;

	const batchTraceId = `cron-anon-${crypto.randomUUID()}`;
	// Process each user individually. If one fails, the loop continues to the next!
	for (const user of candidates) {
		try {
			await prisma.$transaction(async (tx) => {
				// 1. Wipe the PII (Personally Identifiable Information)
				const updateResult = await tx.user.updateMany({
					where: { id: user.id, isAnonymized: false },
					data: {
						name: "Deleted User",
						// MUST be unique so we don't crash the database unique constraint
						email: `deleted-${user.id}@anonymous.local`,
						password: "", // Empty hash means login compare will ALWAYS fail
						isAnonymized: true,
						lastVerificationEmailAt: null,
						failedLoginAttempts: 0,
						lockUntil: null,
					},
				});

				// 2. Burn any lingering tokens (Defense in Depth)
				await tx.refreshToken.deleteMany({ where: { userId: user.id } });
				await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });

				if (updateResult.count > 0) {
					// Order and Product services know to wipe this user's name from their DBs too!
					await events.publishUserAnonymized({
						userId: user.id,
						email: user.email,
						traceId: batchTraceId,
					});
				}
			});

			successCount++;
		} catch (err) {
			logger.error({ err, userId: user.id }, "Failed to anonymize user");
		}
	}

	logger.info({ anonymized: successCount, total: candidates.length }, "Anonymization batch complete");
	return { anonymized: successCount };
}
