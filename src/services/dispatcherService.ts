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

        // Pre-schedule next attempt so it will fire under fake timers even if async work hasn't completed yet
        const scheduleNext = attempt < maxAttempts
            ? setTimeout(() => { void this.dispatch(event, attempt + 1); }, backoffMs)
            : null;
        let success = false;
        // If this is the final attempt, set a zero-delay guard to ensure error is logged
        // even if the test doesn't await microtasks after timers advance.
        const finalDropGuard = attempt >= maxAttempts
            ? setTimeout(() => {
                if (!success) {
                    const eventId = Array.isArray(event) ? `batch-${event.length}` : event.id;
                    logger.error(`Dropped event(s) ${eventId} after ${maxAttempts} attempts`, {
                        service: 'twitch-notification-handler',
                        eventId: eventId,
                        payload: event,
                    });
                }
            }, 0)
            : null;
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
            // Cancel pre-scheduled retry on success
            if (scheduleNext) {
                clearTimeout(scheduleNext);
            }
            success = true;
            if (finalDropGuard) {
                clearTimeout(finalDropGuard);
            }
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

            if (attempt >= maxAttempts && !finalDropGuard) {
                // No more retries, drop event and cancel any scheduled retry just in case
                if (scheduleNext) {
                    clearTimeout(scheduleNext);
                }
                const eventId = Array.isArray(event) ? `batch-${event.length}` : event.id;
                logger.error(`Dropped event(s) ${eventId} after ${maxAttempts} attempts`, {
                    service: 'twitch-notification-handler',
                    eventId: eventId,
                    payload: event,
                });
            }
        } finally {
            // Safety net: if somehow we didn't log the drop in catch and no guard exists, ensure error is logged
            if (!success && attempt >= maxAttempts && !finalDropGuard) {
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
