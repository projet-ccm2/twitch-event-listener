import { TwitchEvent } from '../models/event';
import { DispatcherService } from './dispatcherService';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export class IngestService {
    private dispatcher: DispatcherService;

    constructor(dispatcher?: DispatcherService) {
        this.dispatcher = dispatcher || new DispatcherService();
    }

    public async handleEvent(eventData: any): Promise<void> {
        try {
            const normalizedEvent = this.normalizeEvent(eventData);

            logger.info(`Ingesting event: ${normalizedEvent.type}`, {
                service: 'twitch-notification-handler',
                eventId: normalizedEvent.id,
                eventType: normalizedEvent.type,
            });

            console.log('Calling dispatch with:', normalizedEvent);
            await this.dispatcher.dispatch(normalizedEvent);
        } catch (err) {
            logger.error('Failed to ingest event', {
                service: 'twitch-notification-handler',
                error: err,
                rawEvent: eventData,
            });
        }
    }

    public async handleBatch(eventsData: any[]): Promise<void> {
        try {
            const normalizedEvents = eventsData.map(e => this.normalizeEvent(e));

            logger.info(`Ingesting batch of ${normalizedEvents.length} events`, {
                service: 'twitch-notification-handler',
                count: normalizedEvents.length,
            });

            await this.dispatcher.dispatch(normalizedEvents);
        } catch (err) {
            logger.error('Failed to ingest batch', {
                service: 'twitch-notification-handler',
                error: err,
                count: eventsData.length,
            });
        }
    }

    private normalizeEvent(rawEvent: any): TwitchEvent {
        const eventId = rawEvent.id || crypto.randomUUID();
        const timestamp = rawEvent.timestamp || new Date().toISOString();

        let type = rawEvent.type || 'unknown';
        if (rawEvent.subscription && rawEvent.subscription.type) {
            type = rawEvent.subscription.type;
        }

        return {
            id: eventId,
            source: rawEvent.source || 'twitch',
            type: type,
            timestamp: timestamp,
            version: rawEvent.version || '1.0',
            payload: rawEvent.event || rawEvent.payload || rawEvent,
        };
    }
}