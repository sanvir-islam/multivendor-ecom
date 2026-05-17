import { Kafka, logLevel, type Consumer } from "kafkajs";
import type { BaseEvent } from "./events.js";
import { createLogger } from "../logger/logger.js";

class KafkaConsumerWrapper {
	private consumer: Consumer;
	private isConnected = false;
	private groupId: string;
	private logger;

	constructor(groupId: string) {
		this.groupId = groupId;
		const kafka = new Kafka({
			clientId: `ecom-${groupId}`,
			brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
			logLevel: logLevel.ERROR,
			retry: {
				initialRetryTime: 300,
				retries: 5,
			},
		});

		// groupId ensures each consumer group processes each message exactly once
		// If you have 3 notification-service instances, they share the "notification-service" group
		// Kafka distributes messages across them — each message is processed by ONE instance
		this.consumer = kafka.consumer({ groupId });

		// for loggin
		this.logger = createLogger(`${groupId}-consumer`);
	}

	async connect(): Promise<void> {
		if (this.isConnected) return;
		await this.consumer.connect();
		this.isConnected = true;
	}

	async disconnect(): Promise<void> {
		if (!this.isConnected) return;
		await this.consumer.disconnect();
		this.isConnected = false;
	}

	// Subscribe to a topic and process each message with the handler
	// fromBeginning: true = on first startup, read ALL historical messages (useful for replay)
	//                false = only read NEW messages from now on
	async subscribe<T extends BaseEvent>(
		topic: string,
		handler: (event: T) => Promise<void>,
		fromBeginning = false,
	): Promise<void> {
		await this.consumer.subscribe({ topic, fromBeginning });

		await this.consumer.run({
			eachMessage: async ({ topic: msgTopic, partition, message }) => {
				try {
					const value = message.value?.toString();
					if (!value) return;

					const event = JSON.parse(value) as T;

					// Add kafka metadata for debugging
					this.logger.info(`[${this.groupId}] Processing ${event.eventType} from ${msgTopic}:${partition}`);

					await handler(event);
				} catch (err) {
					// Log but don't crash — failed messages should be handled gracefully
					// In production, you'd send failed messages to a dead-letter queue (DLQ)
					this.logger.error(`[${this.groupId}] Error processing message from ${msgTopic}:${partition}: ${err}`);
				}
			},
		});
	}
}

// Factory function — each consuming service creates its own consumer with a unique groupId
export function createKafkaConsumer(groupId: string): KafkaConsumerWrapper {
	return new KafkaConsumerWrapper(groupId);
}
