import { config } from '../../config/config';
import { IngestService } from '../ingestService';
import { logger } from '../../utils/logger';

export class TwitchService {
    private ingestService: IngestService;
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;

    constructor() {
        this.ingestService = new IngestService();
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;

        logger.info('Starting Mock Twitch Service', { service: 'twitch-mock' });

        this.intervalId = setInterval(() => {
            this.generateRandomEvent();
        }, config.eventFrequencyMs);
    }

    public stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        logger.info('Stopped Mock Twitch Service', { service: 'twitch-mock' });
    }

    private generateRandomEvent() {
        const channels = config.channels;
        if (channels.length === 0) return;

        const channel = channels[Math.floor(Math.random() * channels.length)];
        const eventTypes = ['message', 'follow', 'subscribe', 'cheer', 'raid', 'channel_points_redemption'];
        const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];

        const eventData: any = {
            id: Math.random().toString(36).substring(7),
            timestamp: new Date().toISOString(),
            source: 'mock',
            type: type,
            version: '1.0',
        };

        switch (type) {
            case 'message':
                eventData.source = 'irc';
                eventData.event = {
                    broadcaster_user_id: channel.twitch_user_id,
                    broadcaster_user_login: channel.login,
                    user_login: 'mock_user_' + Math.floor(Math.random() * 100),
                    message: { text: 'This is a mock message ' + Math.random() }
                };
                eventData.payload = eventData.event;
                break;
            case 'follow':
                eventData.source = 'eventsub';
                eventData.subscription = { type: 'channel.follow' };
                eventData.event = {
                    broadcaster_user_id: channel.twitch_user_id,
                    broadcaster_user_login: channel.login,
                    user_id: '12345',
                    user_login: 'mock_follower',
                    followed_at: new Date().toISOString()
                };
                break;
            case 'subscribe':
                eventData.source = 'eventsub';
                eventData.subscription = { type: 'channel.subscribe' };
                eventData.event = {
                    broadcaster_user_id: channel.twitch_user_id,
                    broadcaster_user_login: channel.login,
                    user_id: '67890',
                    user_login: 'mock_subscriber',
                    tier: '1000',
                    is_gift: false
                };
                break;
            case 'cheer':
                eventData.source = 'eventsub';
                eventData.subscription = { type: 'channel.cheer' };
                eventData.event = {
                    broadcaster_user_id: channel.twitch_user_id,
                    broadcaster_user_login: channel.login,
                    user_id: '11223',
                    user_login: 'mock_cheerer',
                    bits: 100,
                    message: 'Cheer100'
                };
                break;
            case 'raid':
                eventData.source = 'eventsub';
                eventData.subscription = { type: 'channel.raid' };
                eventData.event = {
                    to_broadcaster_user_id: channel.twitch_user_id,
                    to_broadcaster_user_login: channel.login,
                    from_broadcaster_user_id: '99887',
                    from_broadcaster_user_login: 'raiding_channel',
                    viewers: 50
                };
                break;
            case 'channel_points_redemption':
                eventData.source = 'eventsub';
                eventData.subscription = { type: 'channel.channel_points_custom_reward_redemption.add' };
                eventData.event = {
                    broadcaster_user_id: channel.twitch_user_id,
                    broadcaster_user_login: channel.login,
                    user_id: '44556',
                    user_login: 'redeemer',
                    reward: {
                        id: 'reward-123',
                        title: 'Hydrate',
                        cost: 100
                    },
                    user_input: ''
                };
                break;
        }

        this.ingestService.handleEvent(eventData);
    }
}