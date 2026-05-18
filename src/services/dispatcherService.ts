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
    if (envConfig.nodeEnv === "local") {
      this.logDevMode(event);
      return;
    }

    const maxAttempts = 5;
    const baseBackoffMs = 1000 * Math.pow(2, attempt - 1);
    const backoffMs = secureRandomInt(baseBackoffMs);

    try {
      await this.sendRequest(event);
      this.logSuccess(event);
    } catch (err) {
      await this.handleDispatchError(
        event,
        attempt,
        maxAttempts,
        err,
        backoffMs,
      );
    }
  }

  private async getGoogleIdToken(): Promise<string | null> {
    if (!process.env.K_SERVICE) return null;
    try {
      const metadataUrl = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${this.dispatcherUrl}`;
      const res = await fetch(metadataUrl, {
        headers: { "Metadata-Flavor": "Google" },
      });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  private async sendRequest(event: TwitchEvent | TwitchEvent[]) {
    const idToken = await this.getGoogleIdToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (idToken) headers["Authorization"] = `Bearer ${idToken}`;

    const response = await fetch(this.dispatcherUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }

  private async handleDispatchError(
    event: TwitchEvent | TwitchEvent[],
    attempt: number,
    maxAttempts: number,
    error: unknown,
    backoffMs: number,
  ) {
    if (
      error instanceof TypeError &&
      (error as any).cause?.code === "ECONNREFUSED"
    ) {
      logger.warn(`Dispatcher service unreachable at ${this.dispatcherUrl}`, {
        service: "twitch-notification-handler",
        eventId: this.getEventId(event),
      });
    } else {
      logger.warn(
        `Failed to dispatch event(s) ${this.getEventId(event)} (attempt ${attempt}/${maxAttempts}): ${error}`,
        {
          service: "twitch-notification-handler",
          eventId: this.getEventId(event),
          error: error,
        },
      );
    }

    if (attempt < maxAttempts) {
      setTimeout(() => {
        void this.dispatch(event, attempt + 1);
      }, backoffMs);
    } else {
      this.logDrop(event, maxAttempts);
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
