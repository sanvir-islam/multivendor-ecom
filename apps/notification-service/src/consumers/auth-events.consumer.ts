import { type AuthEvent, type BaseEvent, createKafkaConsumer, TOPICS } from "@multivendor-ecom/shared";
import {
	accountBlockedEmail,
	accountDeletedEmail,
	accountLockedEmail,
	passwordChangedEmail,
	passwordResetEmail,
	roleChangedEmail,
	securityAlertEmail,
	verificationEmail,
} from "../templates/auth-email";
import { sendEmail } from "../config/email";
import { logger } from "../config/logger";

const consumer = createKafkaConsumer("notification-service");

const eventInfo = (email: string, event: BaseEvent) => ({ traceId: event.traceId, email, event: event.eventType });

export async function startAuthEventsConsumer(): Promise<void> {
	await consumer.connect();

	await consumer.subscribe<AuthEvent>(TOPICS.AUTH_EVENTS, async (event) => {
		try {
			switch (event.eventType) {
				case "USER_REGISTERED":
				case "VERIFICATION_EMAIL_REQUESTED": {
					const { email, name, verificationToken } = event.data;
					const template = verificationEmail(name, verificationToken);
					await sendEmail({ to: email, ...template });

					logger.info(
						eventInfo(email, event),
						event.eventType === "VERIFICATION_EMAIL_REQUESTED"
							? "Resent verification email"
							: "Verification email sent after registration",
					);
					break;
				}

				case "ACCOUNT_LOCKED": {
					const { email, name, failedAttempts, lockUntil } = event.data;
					const lockUntilMinutes = Math.ceil((new Date(lockUntil).getTime() - Date.now()) / 60000);
					const template = accountLockedEmail(name, failedAttempts, lockUntilMinutes);
					await sendEmail({ to: email, ...template });

					logger.info(eventInfo(email, event), "Account locked email sent");
					break;
				}

				case "TOKEN_THEFT_DETECTED": {
					const { email, name, ipAddress, userAgent } = event.data;
					const template = securityAlertEmail(name, ipAddress, userAgent);
					await sendEmail({ to: email, ...template });

					logger.info(eventInfo(email, event), "Security alert email sent");
					break;
				}

				case "PASSWORD_RESET_REQUESTED": {
					const { email, name, resetToken } = event.data;
					const template = passwordResetEmail(name, resetToken);
					await sendEmail({ to: email, ...template });

					logger.info(eventInfo(email, event), "Password reset email sent");
					break;
				}

				case "PASSWORD_CHANGED": {
					const { email, name } = event.data;
					const template = passwordChangedEmail(name);
					await sendEmail({ to: email, ...template });

					logger.info(eventInfo(email, event), "Password changed email sent");
					break;
				}

				case "USER_BLOCKED": {
					const { email, name } = event.data;
					const template = accountBlockedEmail(name);
					await sendEmail({ to: email, ...template });

					logger.info(eventInfo(email, event), "Account blocked email sent");
					break;
				}

				case "USER_ROLE_CHANGED": {
					const { email, name, oldRole, newRole } = event.data;
					const template = roleChangedEmail(name, oldRole, newRole);
					await sendEmail({ to: email, ...template });

					logger.info(eventInfo(email, event), "Role changed email sent");
					break;
				}

				case "USER_VERIFIED": {
					const { email } = event.data;
					logger.info(eventInfo(email, event), "User verified successfully");
					break;
				}

				case "ACCOUNT_DELETED": {
					const { email, name } = event.data;
					const template = accountDeletedEmail(name);
					await sendEmail({ to: email, ...template });

					logger.info(eventInfo(email, event), "Account deletion scheduled email sent");
					break;
				}
				case "USER_ANONYMIZED": {
					const { email } = event.data;
					logger.info(eventInfo(email, event), "Account deleted successfully");
					break;
				}
				default: {
					const unknownEvent = event as BaseEvent;
					logger.warn(
						{ traceId: unknownEvent.traceId, event: unknownEvent.eventType },
						`Unhandled event type received: ${unknownEvent.eventType}`,
					);
					break;
				}
			}
		} catch (err) {
			const userId = "userId" in event.data ? event.data.userId : undefined;
			logger.error({ err, traceId: event.traceId, userId }, `Failed to process auth event: ${event.eventType}`);

			// TODO: In production, send to dead-letter queue for retry
		}
	});
}

export async function stopAuthEventsConsumer(): Promise<void> {
	await consumer.disconnect();
}
