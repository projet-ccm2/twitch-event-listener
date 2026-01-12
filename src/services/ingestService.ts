import { TwitchEvent } from "../models/event";
import { DispatcherService } from "./dispatcherService";
import { logger } from "../utils/logger";
import { config as envConfig } from "../config/environment";
import crypto from "node:crypto";

export class IngestService {
    private readonly dispatcher: DispatcherService;
    private eventBuffer: TwitchEvent[] = [];
    private flushInterval: NodeJS.Timeout | null = null;

    constructor(dispatcher?: DispatcherService) {
        this.dispatcher = dispatcher || new DispatcherService();
        this.startFlushInterval();
    }

    private startFlushInterval() {
        if (this.flushInterval) return;
        logger.info(`Starting global batch flush interval: ${envConfig.batchIntervalMs}ms`, { service: 'twitch-ingest' });
        this.flushInterval = setInterval(() => {
            void this.flush();
        }, envConfig.batchIntervalMs);
    }

    public async handleEvent(eventData: any): Promise<void> {
        try {
            const normalizedEvent = this.normalizeEvent(eventData);
            logger.info(`Buffering event: ${normalizedEvent.type}`, {
                service: "twitch-notification-handler",
                eventId: normalizedEvent.id,
                eventType: normalizedEvent.type,
            });
            this.eventBuffer.push(normalizedEvent);
        } catch (err) {
            logger.error("Failed to buffer event", {
                service: "twitch-notification-handler",
                error: err,
                rawEvent: eventData,
            });
        }
    }

    public async handleBatch(eventsData: any[]): Promise<void> {
        try {
            const normalizedEvents = eventsData.map((e) => this.normalizeEvent(e));
            logger.info(`Buffering batch of ${normalizedEvents.length} events`, {
                service: "twitch-notification-handler",
                count: normalizedEvents.length,
            });
            this.eventBuffer.push(...normalizedEvents);
        } catch (err) {
            logger.error("Failed to buffer batch", {
                service: "twitch-notification-handler",
                error: err,
                count: eventsData.length,
            });
        }
    }

    public async flush(): Promise<void> {
        if (this.eventBuffer.length === 0) return;

        const batch = [...this.eventBuffer];
        this.eventBuffer = []; // Clear buffer

        logger.info(`Flushing global batch of ${batch.length} events`, {
            service: 'twitch-ingest',
            count: batch.length
        });

        try {
            await this.dispatcher.dispatch(batch);
        } catch (err) {
            logger.error("Failed to dispatch global batch", {
                service: "twitch-ingest",
                error: err,
                count: batch.length
            });
            // Optional: Re-queue failed events? somewhat dangerous for loops.
            // For now, let DispatcherService handle retries.
        }
    }

    private normalizeEvent(rawEvent: any): TwitchEvent {
        const eventId = rawEvent.id || crypto.randomUUID();
        const timestamp = rawEvent.timestamp || new Date().toISOString();

        let type = rawEvent.type || "unknown";
        if (rawEvent.subscription?.type) {
            type = rawEvent.subscription.type;
        }

        return {
            id: eventId,
            source: rawEvent.source || "twitch",
            type: type,
            timestamp: timestamp,
            version: rawEvent.version || "1.0",
            payload: rawEvent.event || rawEvent.payload || rawEvent,
            channelId: rawEvent.channelId,
            channelLogin: rawEvent.channelLogin,
            userId: rawEvent.userId,
            userLogin: rawEvent.userLogin,
        };
    }
}
