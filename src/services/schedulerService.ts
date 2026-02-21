import { EventSubService } from "./twitch/eventsubService";
import { IrcService } from "./twitch/ircService";
import { config } from "../config/config";
import { ChannelConfig } from "../models/channel";
import { logger } from "../utils/logger";

interface DbUser {
  id: string;
  username: string;
  profileImageUrl: string | null;
  channelDescription: string | null;
  scope: string;
}

export class SchedulerService {
  private readonly eventSubService: EventSubService;
  private readonly ircService: IrcService;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(eventSubService: EventSubService, ircService: IrcService) {
    this.eventSubService = eventSubService;
    this.ircService = ircService;
  }

  public async start() {
    const initialSync = this.syncListeners();
    this.intervalId = setInterval(() => {
      void this.syncListeners();
    }, config.syncIntervalMs);
    logger.info("SchedulerService started", {
      service: "twitch-scheduler",
      intervalMs: config.syncIntervalMs,
    });
    await initialSync;
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info("SchedulerService stopped", { service: "twitch-scheduler" });
  }

  private async syncListeners() {
    try {
      const baseUrl = config.dbServiceUrl.endsWith("/")
        ? config.dbServiceUrl
        : `${config.dbServiceUrl}/`;
      const url = `${baseUrl}users`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`DB Service returned ${response.status}`);
      }

      const users: DbUser[] = await response.json();

      const channels: ChannelConfig[] = users.map((user) => {
        const decodedScope = user.scope ? decodeURIComponent(user.scope) : "";
        const scopesArray = decodedScope.split(" ").filter(Boolean);

        return {
          twitchUserId: user.id,
          login: user.username,
          scopes: scopesArray,
          listenEventSub: true,
          listenChatIrc: true,
          eventSubTopics: [
            "channel.follow",
            "stream.online",
            "channel.subscribe",
            "channel.cheer",
            "channel.channel_points_custom_reward_redemption.add",
            "channel.hype_train.begin",
            "channel.hype_train.progress",
            "channel.hype_train.end",
            "channel.poll.begin",
            "channel.poll.progress",
            "channel.poll.end",
            "channel.prediction.begin",
            "channel.prediction.progress",
            "channel.prediction.lock",
            "channel.prediction.end",
            "channel.charity_campaign.donate",
            "channel.charity_campaign.start",
            "channel.charity_campaign.progress",
            "channel.charity_campaign.stop",
          ],
        };
      });

      config.channels = channels;

      logger.info("Triggering EventSub subscribeAll", {
        service: "twitch-scheduler",
      });
      await this.eventSubService.subscribeAll();
      this.ircService.updateSubscriptions();
      logger.info(`Synced ${channels.length} channels from DB Service`, {
        service: "twitch-scheduler",
        count: channels.length,
      });
    } catch (err) {
      logger.error("Failed to sync listeners", {
        service: "twitch-scheduler",
        error: err,
      });
    }
  }
}
