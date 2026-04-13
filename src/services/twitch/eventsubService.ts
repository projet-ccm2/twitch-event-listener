import { config } from "../../config/config";
import { config as envConfig } from "../../config/environment";
import { ChannelConfig } from "../../models/channel";
/* eslint-disable camelcase */
import { logger } from "../../utils/logger";
import { IngestService } from "../ingestService";
import crypto from "node:crypto";

import { Request, Response } from "express";
import { TwitchEvent } from "../../models/event";
export class EventSubService {
  private readonly ingestService: IngestService;
  private appAccessToken: string | null = null;
  private readonly subscribedTopics: Set<string> = new Set();
  private existingSubscriptionsLoaded = false;

  constructor() {
    this.ingestService = new IngestService();
  }

  public async subscribeAll() {
    await this.loadExistingSubscriptions();
    const channels = config.channels;
    for (const channel of channels) {
      if (channel.listenEventSub) {
        await this.subscribeChannel(channel);
      }
    }
  }

  public async subscribeChannel(channel: ChannelConfig) {
    const token = await this.getAppAccessToken();
    if (!token) {
      logger.error(
        `Skipping subscriptions for channel ${channel.login} due to missing App Access Token`,
        { service: "twitch-eventsub" },
      );
      return;
    }

    await this.loadExistingSubscriptions(token);

    const topics = channel.eventSubTopics || [];
    for (const topicConfig of topics) {
      await this.subscribeToTopic(
        channel,
        topicConfig,
        envConfig.twitch.clientId,
        token,
        envConfig.twitch.publicCallback,
        envConfig.twitch.webhookSecret,
      );
    }
  }

  private async getAppAccessToken(): Promise<string | null> {
    if (this.appAccessToken) return this.appAccessToken;

    try {
      const { clientId, clientSecret } = envConfig.twitch;
      if (!clientId || !clientSecret) {
        logger.error(
          "Cannot generate Twitch App Access Token: Missing Client ID or Client Secret",
          { service: "twitch-eventsub" },
        );
        return null;
      }

      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      });

      const response = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        body: params,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          `Failed to generate App Access Token: ${response.status} ${errorText}`,
          {
            service: "twitch-eventsub",
          },
        );
        return null;
      }

      const data = await response.json();
      this.appAccessToken = data.access_token;
      logger.info("Successfully generated Twitch App Access Token", {
        service: "twitch-eventsub",
      });
      return this.appAccessToken;
    } catch (err) {
      logger.error("Exception generating Twitch App Access Token", {
        error: err,
      });
      return null;
    }
  }

  private async loadExistingSubscriptions(
    tokenOverride?: string,
  ): Promise<void> {
    if (this.existingSubscriptionsLoaded) {
      return;
    }

    const token = tokenOverride || (await this.getAppAccessToken());
    if (!token) {
      return;
    }

    let cursor: string | undefined;

    try {
      do {
        const url = new URL(
          "https://api.twitch.tv/helix/eventsub/subscriptions",
        );
        if (cursor) {
          url.searchParams.set("after", cursor);
        }

        const response = await fetch(url, {
          headers: {
            "Client-ID": envConfig.twitch.clientId,
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.warn(
            `Failed to load existing EventSub subscriptions: ${response.status} ${errorText}`,
            { service: "twitch-eventsub" },
          );
          return;
        }

        const data = await response.json();
        const subscriptions = Array.isArray(data.data) ? data.data : [];

        for (const subscription of subscriptions) {
          const cacheKey = this.getCacheKeyFromCondition(
            subscription.type,
            subscription.condition,
          );
          if (cacheKey) {
            this.subscribedTopics.add(cacheKey);
          }
        }

        cursor =
          typeof data.pagination?.cursor === "string"
            ? data.pagination.cursor
            : undefined;
      } while (cursor);

      this.existingSubscriptionsLoaded = true;
      logger.info("Loaded existing Twitch EventSub subscriptions", {
        service: "twitch-eventsub",
        count: this.subscribedTopics.size,
      });
    } catch (err) {
      logger.error("Exception while loading existing EventSub subscriptions", {
        service: "twitch-eventsub",
        error: err,
      });
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
      const parsedBody = JSON.parse(bodyString);
      const challenge = parsedBody.challenge;
      const subscriptionType = parsedBody.subscription?.type || "unknown";

      logger.info(
        `✅ Twitch successfully verified webhook challenge for ${subscriptionType}`,
        {
          service: "twitch-eventsub",
        },
      );
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
      const payload = JSON.parse(bodyString);
      await this.handleRevocation(payload);
      return;
    }

    res.status(200).send();
  }

  private async handleRevocation(payload: any) {
    const subscription = payload.subscription;
    const { status, type, condition } = subscription;
    const channelId = condition.broadcaster_user_id;

    const cacheKey = `${channelId}:${type}`;

    logger.warn(
      `Subscription revoked: ${type} for channel ${channelId}. Status: ${status}`,
      { service: "twitch-eventsub", payload },
    );

    this.subscribedTopics.delete(cacheKey);

    if (status === "notification_failures_exceeded") {
      logger.info(`Attempting to re-subscribe to ${type} for ${channelId}`, {
        service: "twitch-eventsub",
      });

      const channel = config.channels.find((c) => c.twitchUserId === channelId);
      if (!channel) {
        logger.warn(
          `Cannot re-subscribe: Channel ${channelId} not found in config`,
          { service: "twitch-eventsub" },
        );
        return;
      }

      const token = await this.getAppAccessToken();
      if (!token) return;

      await this.subscribeToTopic(
        channel,
        {
          name: type,
          version: subscription.version,
          condition: condition,
        },
        envConfig.twitch.clientId,
        token,
        envConfig.twitch.publicCallback,
        envConfig.twitch.webhookSecret,
      );
    } else if (
      status === "authorization_revoked" ||
      status === "user_removed"
    ) {
      logger.error(
        `Critical: Subscription revoked for ${type} on ${channelId} due to ${status}. Manual intervention required.`,
        { service: "twitch-eventsub" },
      );
    }
  }

  private getCacheKeyFromCondition(
    topicName: string,
    condition?: Record<string, string>,
  ): string | null {
    const channelId =
      condition?.broadcaster_user_id ||
      condition?.to_broadcaster_user_id ||
      condition?.from_broadcaster_user_id;

    if (!channelId) {
      return null;
    }

    return `${channelId}:${topicName}`;
  }

  private normalizeEvent(payload: any): TwitchEvent {
    const subscription = payload.subscription || {};
    const event = payload.event || {};
    const id = `${subscription.id || ""}:${event.id || Date.now()}`;
    const type = subscription.type || "unknown";
    const channelId =
      event.broadcaster_user_id ||
      subscription.condition?.broadcaster_user_id ||
      undefined;
    const channelLogin = event.broadcaster_user_login || undefined;
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
      if (topicName === "channel.follow") {
        version = "2";
        condition = {
          broadcaster_user_id: channel.twitchUserId,
          moderator_user_id: channel.twitchUserId,
        };
      } else if (topicName === "channel.subscribe") {
        condition = { broadcaster_user_id: channel.twitchUserId };
      } else {
        condition = { broadcaster_user_id: channel.twitchUserId };
      }
    } else {
      topicName = topicConfig.name;
      version = topicConfig.version || "1";
      condition = topicConfig.condition || {
        broadcaster_user_id: channel.twitchUserId,
      };
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

    const cacheKey =
      this.getCacheKeyFromCondition(topicName, condition) ||
      `${channel.twitchUserId}:${topicName}`;
    if (this.subscribedTopics.has(cacheKey)) {
      // Silently return to prevent log spam and API rate-limiting
      return;
    }

    try {
      const response = await fetch(
        "https://api.twitch.tv/helix/eventsub/subscriptions",
        {
          method: "POST",
          headers: {
            "Client-ID": clientId,
            Authorization: `Bearer ${appAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (response.status >= 200 && response.status < 300) {
        this.subscribedTopics.add(cacheKey);
        logger.info(`Subscribed to ${topicName} for ${channel.login}`, {
          service: "twitch-eventsub",
        });
      } else if (response.status === 409) {
        this.subscribedTopics.add(cacheKey);
        logger.info(
          `Subscription already exists for ${topicName} on ${channel.login}`,
          { service: "twitch-eventsub" },
        );
      } else {
        const data = await response.text();
        logger.warn(
          `Failed to subscribe to ${topicName}: ${response.status} ${data}`,
          { service: "twitch-eventsub" },
        );
      }
    } catch (err) {
      logger.error(`Exception subscribing to ${topicName}`, { error: err });
    }
  }

  public shutdown() {
    this.ingestService.shutdown();
  }
}
