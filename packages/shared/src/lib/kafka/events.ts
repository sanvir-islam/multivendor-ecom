export interface BaseEvent {
	eventType: string;
	timestamp: string; // ISO string
	source: string; // which service published this
	traceId: string; // x-request-id for distributed tracing
}

// ──────────────────────────────────────────────
// Auth events — published by auth-service
// ──────────────────────────────────────────────
export interface UserRegisteredEvent extends BaseEvent {
	eventType: "USER_REGISTERED";
	data: {
		userId: string;
		email: string;
		name: string;
		role: string;
		verificationToken: string;
	};
}
export interface VerificationEmailRequestedEvent extends BaseEvent {
	eventType: "VERIFICATION_EMAIL_REQUESTED";
	data: {
		userId: string;
		email: string;
		name: string;
		verificationToken: string;
	};
}

export interface UserVerifiedEvent extends BaseEvent {
	eventType: "USER_VERIFIED";
	data: {
		userId: string;
		email: string;
		name: string;
	};
}

export interface PasswordResetRequestedEvent extends BaseEvent {
	eventType: "PASSWORD_RESET_REQUESTED";
	data: {
		userId: string;
		email: string;
		name: string;
		resetToken: string; // raw token to put in email link
	};
}

export interface PasswordChangedEvent extends BaseEvent {
	eventType: "PASSWORD_CHANGED";
	data: {
		userId: string;
		email: string;
		name: string;
	};
}

export interface AccountLockedEvent extends BaseEvent {
	eventType: "ACCOUNT_LOCKED";
	data: {
		userId: string;
		email: string;
		name: string;
		failedAttempts: number;
		lockUntil: string;
	};
}

export interface TokenTheftDetectedEvent extends BaseEvent {
	eventType: "TOKEN_THEFT_DETECTED";
	data: {
		userId: string;
		email: string;
		name: string;
		ipAddress?: string;
		userAgent?: string;
	};
}

export interface UserBlockedEvent extends BaseEvent {
	eventType: "USER_BLOCKED";
	data: {
		userId: string;
		email: string;
		name: string;
	};
}

export interface UserRoleChangedEvent extends BaseEvent {
	eventType: "USER_ROLE_CHANGED";
	data: {
		userId: string;
		email: string;
		name: string;
		oldRole: string;
		newRole: string;
	};
}

export interface AccountDeletedEvent extends BaseEvent {
	eventType: "ACCOUNT_DELETED";
	data: {
		userId: string;
		email: string;
		name: string;
	};
}

export interface UserAnonymizedEvent extends BaseEvent {
	eventType: "USER_ANONYMIZED";
	data: {
		userId: string;
		email: string;
	};
}

// ──────────────────────────────────────────────
// Union type — all possible auth events
// Consumer uses this to type-switch on eventType
// ──────────────────────────────────────────────
export type AuthEvent =
	| UserRegisteredEvent
	| VerificationEmailRequestedEvent
	| UserVerifiedEvent
	| PasswordResetRequestedEvent
	| PasswordChangedEvent
	| AccountLockedEvent
	| AccountDeletedEvent
	| TokenTheftDetectedEvent
	| UserBlockedEvent
	| UserRoleChangedEvent
	| UserAnonymizedEvent;

// ──────────────────────────────────────────────
// Topic names — centralized so producer and consumer use the same strings
// ──────────────────────────────────────────────
export const TOPICS = {
	AUTH_EVENTS: "auth.events",
	// Future topics:
	// ORDER_EVENTS: 'order.events',
	// PRODUCT_EVENTS: 'product.events',
	// VENDOR_EVENTS: 'vendor.events',
} as const;
