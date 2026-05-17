import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";
import { logger } from "./logger";

let transporter: Transporter;

export async function createEmailTransport(): Promise<Transporter> {
	// If we already connected, don't connect again
	if (transporter) return transporter;

	transporter = nodemailer.createTransport({
		host: env.SMTP_HOST,
		port: env.SMTP_PORT,
		secure: env.SMTP_PORT === 465,
		pool: true, // reuse connections
		maxConnections: 5, // concurrent SMTP connections
		maxMessages: 100, // messages per connection before recycling
		auth: {
			user: env.SMTP_USER,
			pass: env.SMTP_PASS,
		},
	});
	await transporter.verify();
	logger.info("[Email] Connected to Gmail successfully and ready to send!");

	return transporter;
}

export async function sendEmail(options: { to: string; subject: string; html: string }): Promise<{ messageId: string }> {
	if (!transporter) await createEmailTransport();

	const info = await transporter.sendMail({
		from: `"Multivendor Ecom" <${env.EMAIL_FROM}>`,
		to: options.to,
		subject: options.subject,
		html: options.html,
	});

	logger.info(`[Email] Sent successfully to ${options.to} (ID: ${info.messageId})`);

	return { messageId: info.messageId };
}

export function closeEmailTransport(): void {
	if (transporter) {
		transporter.close();
		logger.info("[Email] Transport closed");
	}
}
