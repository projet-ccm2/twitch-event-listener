import { TwitchEvent } from '../models/event';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { config as envConfig } from '../config/environment';

export class DispatcherService {
    private dispatcherUrl: string;

    constructor(dispatcherUrl?: string) {
        this.dispatcherUrl = dispatcherUrl || envConfig.dispatcherApiUrl;
    }

    public async dispatch(event: TwitchEvent | TwitchEvent[], attempt: number = 1): Promise<void> {
        const maxAttempts = 5;
        const backoffMs = 1000 * Math.pow(2, attempt - 1);

        if (envConfig.nodeEnv === 'development') {
            if (Array.isArray(event)) {
                console.log(`\n=== [DEV MODE] Batch of ${event.length} Events Received ===`);
                console.log('First Event ID:', event[0]?.id);
                console.log('Timestamp:', new Date().toISOString());
                console.log('Full Batch:', JSON.stringify(event, null, 2));
                console.log('==========================================\n');
            } else {
                console.log('\n=== [DEV MODE] Event Received ===');
                console.log('Event ID:', event.id);
                console.log('Event Type:', event.type);
                console.log('Source:', event.source);
                console.log('Channel:', event.channelLogin);
                console.log('User:', event.userLogin);
                console.log('Timestamp:', event.timestamp);
                console.log('Full Event:', JSON.stringify(event, null, 2));
                console.log('================================\n');
            }
            return;
        }

        try {
            const response = await fetch(this.dispatcherUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(event),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const eventId = Array.isArray(event) ? `batch-${event.length}` : event.id;
            logger.debug(`Successfully dispatched event(s) ${eventId} to ${this.dispatcherUrl}`, {
                service: 'twitch-notification-handler',
                eventId: eventId,
                count: Array.isArray(event) ? event.length : 1,
            });
        } catch (err) {
            if (err instanceof TypeError && (err as any).cause?.code === 'ECONNREFUSED') {
                const eventId = Array.isArray(event) ? `batch-${event.length}` : event.id;
                logger.warn(`Dispatcher service unreachable at ${this.dispatcherUrl}`, {
                    service: 'twitch-notification-handler',
                    eventId: eventId,
                });
            } else {
                const eventId = Array.isArray(event) ? `batch-${event.length}` : event.id;
                logger.warn(`Failed to dispatch event(s) ${eventId} (attempt ${attempt}/${maxAttempts}): ${err}`, {
                    service: 'twitch-notification-handler',
                    eventId: eventId,
                    error: err,
                });
            }

            if (attempt < maxAttempts) {
                setTimeout(() => this.dispatch(event, attempt + 1), backoffMs);
            } else {
                const eventId = Array.isArray(event) ? `batch-${event.length}` : event.id;
                logger.error(`Dropped event(s) ${eventId} after ${maxAttempts} attempts`, {
                    service: 'twitch-notification-handler',
                    eventId: eventId,
                    payload: event,
                });
            }
        }
    }
}
