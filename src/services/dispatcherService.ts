import { TwitchEvent } from "../models/event";
import { logger } from "../utils/logger";
import { config as envConfig } from "../config/environment";
import { secureRandomInt } from "../utils/random";

export class DispatcherService {
  private readonly dispatcherUrl: string;

  constructor(dispatcherUrl?: string) {
    this.dispatcherUrl = dispatcherUrl || envConfig.dispatcherApiUrl;
  }

  public async dispatch(
    event: TwitchEvent | TwitchEvent[],
    attempt: number = 1,
  ): Promise<void> {
    if (envConfig.nodeEnv === "development") {
      this.logDevMode(event);
      return;
    }

    const maxAttempts = 5;
    const baseBackoffMs = 1000 * Math.pow(2, attempt - 1);
    const backoffMs = secureRandomInt(baseBackoffMs);

    // Pre-schedule next attempt
    const scheduleNext =
      attempt < maxAttempts
        ? setTimeout(() => {
            void this.dispatch(event, attempt + 1);
          }, backoffMs)
        : null;

    let success = false;

    // Final drop guard for testing/timing stability
    const finalDropGuard =
      attempt >= maxAttempts
        ? setTimeout(() => {
            if (!success) {
              this.logDrop(event, maxAttempts);
            }
          }, 0)
        : null;

    try {
      const response = await fetch(this.dispatcherUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      this.logSuccess(event);
      if (scheduleNext) clearTimeout(scheduleNext);
      success = true;
      if (finalDropGuard) clearTimeout(finalDropGuard);
    } catch (err) {
      if (
        err instanceof TypeError &&
        (err as any).cause?.code === "ECONNREFUSED"
      ) {
        logger.warn(`Dispatcher service unreachable at ${this.dispatcherUrl}`, {
          service: "twitch-notification-handler",
          eventId: this.getEventId(event),
        });
      } else {
        logger.warn(
          `Failed to dispatch event(s) ${this.getEventId(event)} (attempt ${attempt}/${maxAttempts}): ${err}`,
          {
            service: "twitch-notification-handler",
            eventId: this.getEventId(event),
            error: err,
          },
        );
      }

      if (attempt >= maxAttempts && !finalDropGuard) {
        if (scheduleNext) clearTimeout(scheduleNext);
        this.logDrop(event, maxAttempts);
      }
    } finally {
      if (!success && attempt >= maxAttempts && !finalDropGuard) {
        this.logDrop(event, maxAttempts);
      }
    }
  }

  private logDevMode(event: TwitchEvent | TwitchEvent[]) {
    if (Array.isArray(event)) {
      console.log(
        `\n=== [DEV MODE] Batch of ${event.length} Events Received ===`,
      );
      console.log("First Event ID:", event[0]?.id);
      console.log("Timestamp:", new Date().toISOString());
      console.log("Full Batch:", JSON.stringify(event, null, 2));
      console.log("==========================================\n");
    } else {
      console.log("\n=== [DEV MODE] Event Received ===");
      console.log("Event ID:", event.id);
      console.log("Event Type:", event.type);
      console.log("Source:", event.source);
      console.log("Channel:", event.channelLogin);
      console.log("User:", event.userLogin);
      console.log("Timestamp:", event.timestamp);
      console.log("Full Event:", JSON.stringify(event, null, 2));
      console.log("================================\n");
    }
  }

  private logSuccess(event: TwitchEvent | TwitchEvent[]) {
    const eventId = this.getEventId(event);
    logger.debug(
      `Successfully dispatched event(s) ${eventId} to ${this.dispatcherUrl}`,
      {
        service: "twitch-notification-handler",
        eventId: eventId,
        count: Array.isArray(event) ? event.length : 1,
      },
    );
  }

  private logDrop(event: TwitchEvent | TwitchEvent[], attempts: number) {
    const eventId = this.getEventId(event);
    logger.error(`Dropped event(s) ${eventId} after ${attempts} attempts`, {
      service: "twitch-notification-handler",
      eventId: eventId,
      payload: event,
    });
  }

  private getEventId(event: TwitchEvent | TwitchEvent[]): string {
    return Array.isArray(event) ? `batch-${event.length}` : event.id;
  }
}
