import { config } from "../../config/config";
import { config as envConfig } from "../../config/environment";
import { ChannelConfig } from "../../models/channel";
import { logger } from "../../utils/logger";
import { IngestService } from "../ingestService";
import crypto from "crypto";
import https from "https";
import { Request, Response } from "express";

export class EventSubService {
  private ingestService: IngestService;

  constructor() {
    this.ingestService = new IngestService();
  }

  public async subscribeAll() {
    const channels = config.channels;
    for (const channel of channels) {
      if (channel.listen_eventsub) {
        await this.subscribeChannel(channel);
      }
    }
  }

  public async subscribeChannel(channel: ChannelConfig) {
    const topics = channel.eventsub_topics || [];
    for (const topicConfig of topics) {
      await this.subscribeToTopic(
        channel,
        topicConfig,
        envConfig.twitch.clientId,
        envConfig.twitch.appAccessToken,
        envConfig.twitch.publicCallback,
        envConfig.twitch.webhookSecret,
      );
    }
  }

  public async handleWebhook(req: Request, res: Response) {
    const messageId = req.header("Twitch-Eventsub-Message-Id");
    const timestamp = req.header("Twitch-Eventsub-Message-Timestamp");
    const signature = req.header("Twitch-Eventsub-Message-Signature");
    const messageType = req.header("Twitch-Eventsub-Message-Type");

    if (!messageId || !timestamp || !signature || !messageType) {
      res.status(403).send("Missing headers");
      return;
    }

    const rawBody = (req as any).rawBody || req.body;
    const bodyString = Buffer.isBuffer(rawBody)
      ? rawBody.toString("utf8")
      : JSON.stringify(rawBody);

    if (
      !this.verifySignature(
        signature,
        messageId,
        timestamp,
        bodyString,
        envConfig.twitch.webhookSecret,
      )
    ) {
      res.status(403).send("Invalid signature");
      return;
    }

    if (messageType === "webhook_callback_verification") {
      const challenge = JSON.parse(bodyString).challenge;
      res.status(200).send(challenge);
      return;
    }

    if (messageType === "notification") {
      const payload = JSON.parse(bodyString);
      res.status(202).send();
      const event = this.normalizeEvent(payload);
      await this.ingestService.handleEvent(event);
      return;
    }

    if (messageType === "revocation") {
      res.status(200).send();
      logger.warn("Subscription revoked", { payload: bodyString });
      return;
    }

    res.status(200).send();
  }

  private normalizeEvent(
    payload: any,
  ): import("../../models/event").TwitchEvent {
    const subscription = payload.subscription || {};
    const event = payload.event || {};
    const id = `${subscription.id || ""}:${event.id || Date.now()}`;
    const type = subscription.type || "unknown";
    const channelId =
      event.broadcaster_user_id ||
      subscription.condition?.broadcaster_user_id ||
      "unknown";
    const channelLogin = event.broadcaster_user_login || "unknown";
    const userId = event.user_id || undefined;
    const userLogin = event.user_login || undefined;

    return {
      id,
      source: "eventsub",
      type,
      timestamp: new Date().toISOString(),
      version: "1.0",
      payload,
      channelId,
      channelLogin,
      userId,
      userLogin,
    };
  }

  private verifySignature(
    signature: string,
    messageId: string,
    timestamp: string,
    body: string,
    secret: string,
  ): boolean {
    const message = messageId + timestamp + body;
    const hmac = crypto.createHmac("sha256", secret);
    const expectedSignature = "sha256=" + hmac.update(message).digest("hex");
    // Avoid RangeError from timingSafeEqual when lengths differ
    if (signature.length !== expectedSignature.length) {
      return false;
    }
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  private async subscribeToTopic(
    channel: ChannelConfig,
    topicConfig:
      | string
      | { name: string; version?: string; condition?: Record<string, string> },
    clientId: string,
    appAccessToken: string,
    publicCallback: string,
    webhookSecret: string,
  ): Promise<void> {
    let topicName: string;
    let version = "1";
    let condition: Record<string, string> = {};

    if (typeof topicConfig === "string") {
      topicName = topicConfig;
      /* eslint-disable camelcase */
      if (topicName === "channel.follow") {
        version = "2";
        condition = {
          broadcaster_user_id: channel.twitch_user_id,
          moderator_user_id: channel.twitch_user_id,
        };
      } else if (topicName === "channel.subscribe") {
        condition = { broadcaster_user_id: channel.twitch_user_id };
      } else {
        condition = { broadcaster_user_id: channel.twitch_user_id };
      }
    } else {
      topicName = topicConfig.name;
      version = topicConfig.version || "1";
      condition = topicConfig.condition || {
        broadcaster_user_id: channel.twitch_user_id,
      };
      /* eslint-enable camelcase */
    }

    const payload = {
      type: topicName,
      version: version,
      condition: condition,
      transport: {
        method: "webhook",
        callback: publicCallback + "/eventsub/callback",
        secret: webhookSecret,
      },
    };

    const options = {
      hostname: "api.twitch.tv",
      path: "/helix/eventsub/subscriptions",
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${appAccessToken}`,
        "Content-Type": "application/json",
      },
    };

    try {
      await new Promise<void>((resolve) => {
        const req = https.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            if (
              res.statusCode &&
              res.statusCode >= 200 &&
              res.statusCode < 300
            ) {
              logger.info(`Subscribed to ${topicName} for ${channel.login}`, {
                service: "twitch-eventsub",
              });
            } else if (res.statusCode === 409) {
              logger.info(
                `Subscription already exists for ${topicName} on ${channel.login}`,
                { service: "twitch-eventsub" },
              );
            } else {
              logger.warn(
                `Failed to subscribe to ${topicName}: ${res.statusCode} ${data}`,
                { service: "twitch-eventsub" },
              );
            }
            resolve();
          });
        });
        req.on("error", (e) => {
          logger.error(`Request error for ${topicName}`, { error: e });
          resolve();
        });
        req.write(JSON.stringify(payload));
        req.end();
      });
    } catch (err) {
      logger.error(`Exception subscribing to ${topicName}`, { error: err });
    }
  }
}
