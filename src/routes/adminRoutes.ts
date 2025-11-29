import { Router } from "express";
import express from "express";
import { ChannelConfig } from "../models/channel";
import { config as appConfig } from "../config/config";
import { config as envConfig } from "../config/environment";
import { EventSubService } from "../services/twitch/eventsubService";

export function createAdminRouter(eventSubService: EventSubService) {
  const router = Router();
  router.use(express.json());
  router.post("/admin/channels", async (req, res) => {
    try {
      const body = req.body as Partial<ChannelConfig>;
      if (!body || typeof body !== "object") {
        return res.status(400).json({ error: "Invalid request body" });
      }
      const { twitchUserId, login } = body;
      if (!twitchUserId || !login) {
        return res
          .status(400)
          .json({ error: "twitchUserId and login are required" });
      }
      const newChannel: ChannelConfig = {
        twitchUserId: twitchUserId,
        login: login,
        scopes: body.scopes || [],
        listenEventSub:
          body.listenEventSub !== undefined ? !!body.listenEventSub : true,
        listenChatIrc:
          body.listenChatIrc !== undefined ? !!body.listenChatIrc : false,
        eventSubTopics: body.eventSubTopics || [],
      };
      appConfig.channels.push(newChannel);
      if (!envConfig.useMock && newChannel.listenEventSub) {
        await eventSubService.subscribeChannel(newChannel);
      }
      return res.status(201).json({ status: "channel added" });
    } catch (err) {
      console.error("Error adding channel", err);
      return res.status(500).json({ error: "Failed to add channel" });
    }
  });
  return router;
}

export default createAdminRouter;
