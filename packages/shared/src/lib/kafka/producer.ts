import { Kafka, logLevel, type Producer } from "kafkajs";
import type { BaseEvent } from "./events.js";
import { createLogger } from "../logger/logger.js";

const clientId = process.env.KAFKA_CLIENT_ID || "ecom-producer";

class KafkaProducer {
	private producer: Producer;
	private isConnected = false;
	private logger;

	constructor() {
		const kafka = new Kafka({
			clientId,
			brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
			logLevel: logLevel.ERROR, // reduce noise in development
			retry: {
				initialRetryTime: 300,
				retries: 5,
			},
		});
		this.producer = kafka.producer();

		// for logging
		this.logger = createLogger(`${clientId}-producer`);
	}

	async connect(): Promise<void> {
		if (this.isConnected) return;
		await this.producer.connect();
		this.isConnected = true;
	}

	async disconnect(): Promise<void> {
		if (!this.isConnected) return;
		await this.producer.disconnect();
		this.isConnected = false;
	}

	// Publish an event to a topic
	// The event is serialized to JSON and sent as a Kafka message
	// The key is used for partitioning — events with the same key go to the same partition
	// This guarantees ordering per user (all events for user X are processed in order)
	async publish<T extends BaseEvent>(topic: string, event: T, key?: string): Promise<void> {
		if (!this.isConnected) {
			this.logger.error(`[KafkaProducer] Not connected. Event dropped: ${event.eventType}`);
		}

		await this.producer.send({
			topic,
			messages: [
				{
					key: key || (event as T & { data?: { userId?: string } }).data?.userId || undefined,
					value: JSON.stringify(event),
					headers: {
						eventType: event.eventType,
						source: event.source,
						...(event.traceId ? { traceId: event.traceId } : {}),
					},
				},
			],
		});
	}
}

// Singleton — one producer per service instance
export const kafkaProducer = new KafkaProducer();
