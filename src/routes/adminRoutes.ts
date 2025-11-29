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
      /* eslint-disable camelcase */
      const { twitch_user_id, login } = body;
      if (!twitch_user_id || !login) {
        return res
          .status(400)
          .json({ error: "twitch_user_id and login are required" });
      }
      const newChannel: ChannelConfig = {
        twitch_user_id: twitch_user_id,
        login: login,
        scopes: body.scopes || [],
        listen_eventsub:
          body.listen_eventsub !== undefined ? !!body.listen_eventsub : true,
        listen_chat_irc:
          body.listen_chat_irc !== undefined ? !!body.listen_chat_irc : false,
        eventsub_topics: body.eventsub_topics || [],
      };
      /* eslint-enable camelcase */
      appConfig.channels.push(newChannel);
      if (!envConfig.useMock && newChannel.listen_eventsub) {
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
