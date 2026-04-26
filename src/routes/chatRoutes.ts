import express from "express";
import { IrcService } from "../services/twitch/ircService";
import { apiKeyMiddleware } from "../middlewares/apiKeyMiddleware";
import { logger } from "../utils/logger";

export function createChatRouter(ircService: IrcService) {
  const router = express.Router();

  router.post("/message", apiKeyMiddleware, express.json(), (req, res) => {
    const { channelLogin, message } = req.body as {
      channelLogin?: unknown;
      message?: unknown;
    };

    if (typeof channelLogin !== "string" || !channelLogin.trim()) {
      res
        .status(400)
        .json({ error: "channelLogin must be a non-empty string" });
      return;
    }
    if (typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "message must be a non-empty string" });
      return;
    }
    if (message.length > 500) {
      res.status(400).json({ error: "message exceeds 500 characters" });
      return;
    }

    try {
      ircService.sendMessage(channelLogin.trim(), message);
      res.status(200).json({ ok: true });
    } catch (err) {
      logger.error("Failed to send chat message", {
        service: "chat-route",
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(503).json({
        error: err instanceof Error ? err.message : "Failed to send message",
      });
    }
  });

  return router;
}

export default createChatRouter;
