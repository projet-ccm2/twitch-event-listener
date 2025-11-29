import { Router } from "express";
import express from "express";
import { EventSubService } from "../services/twitch/eventsubService";

export function createWebhookRouter(eventSubService: EventSubService) {
  const router = Router();
  router.post(
    "/eventsub/callback",
    express.raw({ type: "application/json" }),
    (req, res) => eventSubService.handleWebhook(req, res),
  );
  return router;
}

export default createWebhookRouter;
