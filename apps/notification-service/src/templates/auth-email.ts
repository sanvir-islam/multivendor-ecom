// apps/notification-service/src/templates/auth-emails.ts
// HTML email templates for auth-related notifications
// Kept simple — no template engine needed. Just functions returning HTML strings.
// In production, you might use React Email or MJML for fancier templates.

import { env } from "../config/env.js";

const BRAND = "Multivendor Ecom";
const PRIMARY_COLOR = "#2563eb";

// Reusable email wrapper
function wrap(content: string): string {
	return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: ${PRIMARY_COLOR}; margin: 0;">${BRAND}</h1>
      </div>
      ${content}
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
      <p style="font-size: 12px; color: #6b7280; text-align: center;">
        This email was sent by ${BRAND}. If you didn't request this, please ignore it.
      </p>
    </div>
  `;
}

// ──────────────────────────────────────────────
// Email verification
// ──────────────────────────────────────────────
export function verificationEmail(name: string, token: string): { subject: string; html: string } {
	const verifyUrl = `${env.CLIENT_URL}/auth/verify-email?token=${token}`;

	return {
		subject: `Verify your email — ${BRAND}`,
		html: wrap(`
      <h2 style="margin-top: 0;">Welcome, ${name}!</h2>
      <p>Thanks for signing up. Please verify your email address to get started.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" 
           style="background-color: ${PRIMARY_COLOR}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
          Verify Email Address
        </a>
      </div>
      <p style="font-size: 14px; color: #6b7280;">
        Or copy and paste this link into your browser:<br/>
        <a href="${verifyUrl}" style="color: ${PRIMARY_COLOR}; word-break: break-all;">${verifyUrl}</a>
      </p>
      <p style="font-size: 14px; color: #6b7280;">This link expires in 24 hours.</p>
    `),
	};
}

// ──────────────────────────────────────────────
// Password reset requested
// ──────────────────────────────────────────────
export function passwordResetEmail(name: string, resetToken: string): { subject: string; html: string } {
	const resetUrl = `${env.CLIENT_URL}/auth/reset-password?token=${resetToken}`;

	return {
		subject: `Reset your password — ${BRAND}`,
		html: wrap(`
      <h2 style="margin-top: 0;">Password Reset Request</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset the password for your account. If you made this request, click the button below to choose a new password.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" 
           style="background-color: ${PRIMARY_COLOR}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
          Reset Password
        </a>
      </div>
      <p style="font-size: 14px; color: #6b7280;">
        Or copy and paste this link into your browser:<br/>
        <a href="${resetUrl}" style="color: ${PRIMARY_COLOR}; word-break: break-all;">${resetUrl}</a>
      </p>
      <p style="font-size: 14px; color: #6b7280;"><em>This link expires in 1 hour.</em></p>
      <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
        If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
      </p>
    `),
	};
}

// ──────────────────────────────────────────────
// Password changed confirmation
// ──────────────────────────────────────────────
export function passwordChangedEmail(name: string): { subject: string; html: string } {
	return {
		subject: `Password changed — ${BRAND}`,
		html: wrap(`
      <h2 style="margin-top: 0;">Password Changed</h2>
      <p>Hi ${name},</p>
      <p>Your password was successfully changed. All your active sessions have been logged out for security.</p>
      <p>If you didn't make this change, please contact our support team immediately.</p>
    `),
	};
}

// ──────────────────────────────────────────────
// Account locked warning
// ──────────────────────────────────────────────
export function accountLockedEmail(name: string, failedAttempts: number, lockMinutes: number): { subject: string; html: string } {
	return {
		subject: `⚠️ Account locked — ${BRAND}`,
		html: wrap(`
      <h2 style="margin-top: 0; color: #dc2626;">Account Temporarily Locked</h2>
      <p>Hi ${name},</p>
      <p>Your account has been temporarily locked after <strong>${failedAttempts} failed login attempts</strong>.</p>
      <p>You can try logging in again in <strong>${lockMinutes} minutes</strong>.</p>
      <p>If this wasn't you, someone may be trying to access your account. We recommend changing your password after the lockout period.</p>
    `),
	};
}

// ──────────────────────────────────────────────
// Security alert — token theft detected
// ──────────────────────────────────────────────
export function securityAlertEmail(name: string, ipAddress?: string, userAgent?: string): { subject: string; html: string } {
	return {
		subject: `🚨 Security Alert — ${BRAND}`,
		html: wrap(`
      <h2 style="margin-top: 0; color: #dc2626;">Suspicious Activity Detected</h2>
      <p>Hi ${name},</p>
      <p>We detected suspicious activity on your account. Someone attempted to use an old session token, which could indicate unauthorized access.</p>
      <p><strong>For your protection, all your active sessions have been terminated.</strong></p>
      ${ipAddress ? `<p style="font-size: 14px; color: #6b7280;">Suspicious IP: ${ipAddress}</p>` : ""}
      ${userAgent ? `<p style="font-size: 14px; color: #6b7280;">Device: ${userAgent}</p>` : ""}
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0; color: #991b1b;"><strong>What you should do:</strong></p>
        <ol style="color: #991b1b; margin-bottom: 0;">
          <li>Log in and change your password immediately</li>
          <li>Review your active sessions</li>
          <li>Enable two-factor authentication if available</li>
        </ol>
      </div>
    `),
	};
}

// ──────────────────────────────────────────────
// Account blocked by admin
// ──────────────────────────────────────────────
export function accountBlockedEmail(name: string): { subject: string; html: string } {
	return {
		subject: `Account suspended — ${BRAND}`,
		html: wrap(`
      <h2 style="margin-top: 0;">Account Suspended</h2>
      <p>Hi ${name},</p>
      <p>Your account has been suspended by a platform administrator. You will not be able to log in until the suspension is lifted.</p>
      <p>If you believe this is a mistake, please contact our support team.</p>
    `),
	};
}

// ──────────────────────────────────────────────
// Role changed
// ──────────────────────────────────────────────
export function roleChangedEmail(name: string, oldRole: string, newRole: string): { subject: string; html: string } {
	return {
		subject: `Role updated — ${BRAND}`,
		html: wrap(`
      <h2 style="margin-top: 0;">Your Role Has Been Updated</h2>
      <p>Hi ${name},</p>
      <p>Your account role has been changed from <strong>${oldRole}</strong> to <strong>${newRole}</strong>.</p>
      <p>Please log in again for the changes to take effect.</p>
    `),
	};
}

// ──────────────────────────────────────────────
// Account deletion requested (30-day grace period)
// ──────────────────────────────────────────────
export function accountDeletedEmail(name: string): { subject: string; html: string } {
	return {
		subject: `Account scheduled for deletion — ${BRAND}`,
		html: wrap(`
      <h2 style="margin-top: 0;">Account Deactivation</h2>
      <p>Hi ${name},</p>
      <p>As requested, your account has been deactivated and is now scheduled for permanent deletion in 30 days.</p>
      <p>During this time, your profile, active sessions, and data will be hidden from the platform.</p>
      
      <div style="background-color: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0; color: #0f766e; font-weight: 600;">Changed your mind?</p>
        <p style="margin: 8px 0 0 0; color: #0f766e;">
          If this was a mistake or you wish to keep your account, you can cancel the deletion process at any time. 
          <strong>Simply log back into your account within the next 30 days</strong>, and it will be instantly reactivated.
        </p>
      </div>

      <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
        After 30 days, your account and all associated data will be permanently and irreversibly deleted. 
        If you did not authorize this request, please log in immediately to secure your account.
      </p>
    `),
	};
}
