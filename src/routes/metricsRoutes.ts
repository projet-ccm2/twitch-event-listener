import { Router } from "express";
import {
  getAllMetrics,
  getChannelMetrics,
  getUserMetrics,
} from "../controllers/metricsController";

const router = Router();

router.get("/", getAllMetrics);

router.get("/:channelId", getChannelMetrics);

router.get("/:channelId/users/:userId", getUserMetrics);

export default router;
