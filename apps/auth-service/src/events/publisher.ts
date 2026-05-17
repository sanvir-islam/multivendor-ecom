import { kafkaProducer } from "@multivendor-ecom/shared";
import type {
	TokenTheftDetectedEvent,
	AccountLockedEvent,
	UserRegisteredEvent,
	PasswordResetRequestedEvent,
	PasswordChangedEvent,
	AccountDeletedEvent,
	UserAnonymizedEvent,
	UserRoleChangedEvent,
	UserBlockedEvent,
	VerificationEmailRequestedEvent,
	UserVerifiedEvent,
} from "@multivendor-ecom/shared";
import { TOPICS } from "@multivendor-ecom/shared";

const SOURCE = "auth-service";

function now(): string {
	return new Date().toISOString();
}

// ──────────────────────────────────────────────
// Published after successful registration
// Notification service sends verification email
// ──────────────────────────────────────────────
export async function publishUserRegistered(data: {
	userId: string;
	email: string;
	name: string;
	role: string;
	verificationToken: string;
	traceId: string;
}): Promise<void> {
	const event: UserRegisteredEvent = {
		eventType: "USER_REGISTERED",
		data: {
			userId: data.userId,
			email: data.email,
			name: data.name,
			role: data.role,
			verificationToken: data.verificationToken,
		},
		timestamp: now(),
		source: SOURCE,
		traceId: data.traceId,
	};

	await kafkaProducer.publish(TOPICS.AUTH_EVENTS, event, data.userId);
}

// ──────────────────────────────────────────────
// Published on Resend verification email
// Notification service sends verification email
// ──────────────────────────────────────────────
export async function publishVerificationEmailRequested(data: {
	userId: string;
	email: string;
	name: string;
	verificationToken: string;
	traceId: string;
}): Promise<void> {
	const event: VerificationEmailRequestedEvent = {
		eventType: "VERIFICATION_EMAIL_REQUESTED",
		data: {
			userId: data.userId,
			email: data.email,
			name: data.name,
			verificationToken: data.verificationToken,
		},
		timestamp: now(),
		source: SOURCE,
		traceId: data.traceId,
	};

	await kafkaProducer.publish(TOPICS.AUTH_EVENTS, event, data.userId);
}

// ──────────────────────────────────────────────
// Published on user verified
// Expected consumers: Marketing, Analytics, Promotions.
// ──────────────────────────────────────────────
export async function publishUserVerified(data: { userId: string; email: string; name: string; traceId: string }): Promise<void> {
	const event: UserVerifiedEvent = {
		eventType: "USER_VERIFIED",
		data: {
			userId: data.userId,
			email: data.email,
			name: data.name,
		},
		timestamp: now(),
		source: SOURCE,
		traceId: data.traceId,
	};

	await kafkaProducer.publish(TOPICS.AUTH_EVENTS, event, data.userId);
}

// ──────────────────────────────────────────────
// Published when account is locked after failed attempts
// Notification service sends security warning email
// ──────────────────────────────────────────────
export async function publishAccountLocked(data: {
	userId: string;
	email: string;
	name: string;
	failedAttempts: number;
	lockUntil: Date;
	traceId: string;
}): Promise<void> {
	const event: AccountLockedEvent = {
		eventType: "ACCOUNT_LOCKED",
		data: {
			userId: data.userId,
			email: data.email,
			name: data.name,
			failedAttempts: data.failedAttempts,
			lockUntil: data.lockUntil.toISOString(),
		},
		timestamp: now(),
		source: SOURCE,
		traceId: data.traceId,
	};

	await kafkaProducer.publish(TOPICS.AUTH_EVENTS, event, data.userId);
}

// ──────────────────────────────────────────────
// Published when a rotated refresh token is reused (theft detected)
// Notification service sends urgent security alert email
// ──────────────────────────────────────────────
export async function publishTokenTheftDetected(data: {
	userId: string;
	email: string;
	name: string;
	ipAddress?: string;
	userAgent?: string;
	traceId: string;
}): Promise<void> {
	const event: TokenTheftDetectedEvent = {
		eventType: "TOKEN_THEFT_DETECTED",
		data: {
			userId: data.userId,
			email: data.email,
			name: data.name,
			ipAddress: data.ipAddress,
			userAgent: data.userAgent,
		},
		timestamp: now(),
		source: SOURCE,
		traceId: data.traceId,
	};

	await kafkaProducer.publish(TOPICS.AUTH_EVENTS, event, data.userId);
}

// ──────────────────────────────────────────────
// Published when user requests password reset
// Notification service sends email with reset link
// ──────────────────────────────────────────────
export async function publishPasswordResetRequested(data: {
	userId: string;
	email: string;
	name: string;
	resetToken: string;
	traceId: string;
}): Promise<void> {
	const event: PasswordResetRequestedEvent = {
		eventType: "PASSWORD_RESET_REQUESTED",
		data: {
			userId: data.userId,
			email: data.email,
			name: data.name,
			resetToken: data.resetToken,
		},
		timestamp: now(),
		source: SOURCE,
		traceId: data.traceId,
	};

	await kafkaProducer.publish(TOPICS.AUTH_EVENTS, event, data.userId);
}

// ──────────────────────────────────────────────
// Published after password change
// Notification service sends confirmation email
// ──────────────────────────────────────────────
export async function publishPasswordChanged(data: {
	userId: string;
	email: string;
	name: string;
	traceId: string;
}): Promise<void> {
	const event: PasswordChangedEvent = {
		eventType: "PASSWORD_CHANGED",
		data: {
			userId: data.userId,
			email: data.email,
			name: data.name,
		},
		timestamp: now(),
		source: SOURCE,
		traceId: data.traceId,
	};

	await kafkaProducer.publish(TOPICS.AUTH_EVENTS, event, data.userId);
}

// ──────────────────────────────────────────────
// Published when admin blocks a user
// ──────────────────────────────────────────────
export async function publishUserBlocked(data: { userId: string; email: string; name: string; traceId: string }): Promise<void> {
	const event: UserBlockedEvent = {
		eventType: "USER_BLOCKED",
		data: {
			userId: data.userId,
			email: data.email,
			name: data.name,
		},
		timestamp: now(),
		source: SOURCE,
		traceId: data.traceId,
	};

	await kafkaProducer.publish(TOPICS.AUTH_EVENTS, event, data.userId);
}

// ──────────────────────────────────────────────
// Published when admin changes user role
// ──────────────────────────────────────────────
export async function publishUserRoleChanged(data: {
	userId: string;
	email: string;
	name: string;
	oldRole: string;
	newRole: string;
	traceId: string;
}): Promise<void> {
	const event: UserRoleChangedEvent = {
		eventType: "USER_ROLE_CHANGED",
		data: {
			userId: data.userId,
			email: data.email,
			name: data.name,
			oldRole: data.oldRole,
			newRole: data.newRole,
		},
		timestamp: now(),
		source: SOURCE,
		traceId: data.traceId,
	};

	await kafkaProducer.publish(TOPICS.AUTH_EVENTS, event, data.userId);
}

// ──────────────────────────────────────────────
// Published when user deletes their account
// All other services should cascade-clean their data
// ──────────────────────────────────────────────
export async function publishAccountDeleted(data: {
	userId: string;
	email: string;
	name: string;
	traceId: string;
}): Promise<void> {
	const event: AccountDeletedEvent = {
		eventType: "ACCOUNT_DELETED",
		data: {
			userId: data.userId,
			email: data.email,
			name: data.name,
		},
		timestamp: now(),
		source: SOURCE,
		traceId: data.traceId,
	};

	await kafkaProducer.publish(TOPICS.AUTH_EVENTS, event, data.userId);
}

// ──────────────────────────────────────────────
// Published for making deleted acount anonymize
// Order and Product services will wipe this user's name from their db
// ──────────────────────────────────────────────
export async function publishUserAnonymized(data: { userId: string; email: string; traceId: string }): Promise<void> {
	const event: UserAnonymizedEvent = {
		eventType: "USER_ANONYMIZED",
		data: {
			userId: data.userId,
			email: data.email,
		},
		timestamp: now(),
		source: SOURCE,
		traceId: data.traceId,
	};

	await kafkaProducer.publish(TOPICS.AUTH_EVENTS, event, data.userId);
}
