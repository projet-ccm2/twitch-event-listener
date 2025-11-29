import { EventSubService } from "./twitch/eventsubService";
import { IrcService } from "./twitch/ircService";
import { config } from "../config/config";
import { ChannelConfig } from "../models/channel";
import { logger } from "../utils/logger";

export class SchedulerService {
  private eventSubService: EventSubService;
  private ircService: IrcService;
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
      const response = await fetch(config.authServiceUrl);
      if (!response.ok) {
        throw new Error(`Auth Service returned ${response.status}`);
      }

      // Immediately refresh downstream services upon a successful response
      const channels: ChannelConfig[] = await response.json();
      config.channels = channels;

      logger.info("Triggering EventSub subscribeAll", {
        service: "twitch-scheduler",
      });
      await this.eventSubService.subscribeAll();
      this.ircService.updateSubscriptions();
      logger.info(`Synced ${channels.length} channels from Auth Service`, {
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
