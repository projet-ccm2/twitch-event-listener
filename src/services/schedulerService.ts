import { EventSubService } from './twitch/eventsubService';
import { IrcService } from './twitch/ircService';
import { config } from '../config/config';
import { ChannelConfig } from '../models/channel';
import { logger } from '../utils/logger';

export class SchedulerService {
    private eventSubService: EventSubService;
    private ircService: IrcService;
    private intervalId: NodeJS.Timeout | null = null;

    constructor(
        eventSubService: EventSubService,
        ircService: IrcService
    ) {
        this.eventSubService = eventSubService;
        this.ircService = ircService;
    }

    public start() {
        this.syncListeners();
        this.intervalId = setInterval(
            () => this.syncListeners(),
            config.syncIntervalMs
        );
        logger.info('SchedulerService started', {
            service: 'twitch-scheduler',
            intervalMs: config.syncIntervalMs,
        });
    }

    public stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        logger.info('SchedulerService stopped', { service: 'twitch-scheduler' });
    }

    private async syncListeners() {
        try {
            const response = await fetch(config.authServiceUrl);
            if (!response.ok) {
                throw new Error(`Auth Service returned ${response.status}`);
            }

            const channels: ChannelConfig[] = await response.json();
            config.channels = channels;

            logger.info(`Synced ${channels.length} channels from Auth Service`, {
                service: 'twitch-scheduler',
                count: channels.length,
            });

            await this.eventSubService.subscribeAll();
            this.ircService.updateSubscriptions();
        } catch (err) {
            logger.error('Failed to sync listeners', {
                service: 'twitch-scheduler',
                error: err,
            });
        }
    }
}
