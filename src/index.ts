import "./utils/loadEnv";
import express from "express";
import { config as envConfig } from "./config/environment";
import { config } from "./config/config";
import metricsRouter from "./routes/metricsRoutes";
import { TwitchService } from "./services/twitch/mockTwitchService";
import { EventSubService } from "./services/twitch/eventsubService";
import { IrcService } from "./services/twitch/ircService";

import { SchedulerService } from "./services/schedulerService";
import createWebhookRouter from "./routes/webhooksRoutes";
import createAdminRouter from "./routes/adminRoutes";
import { loggerMiddleware } from "./middlewares/loggerMiddleware";
import { logger } from "./utils/logger";

const app = express();

app.disable("x-powered-by");

// Helper to validate that the origin is a well-formed URL with http(s) protocol
function isValidOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  const allowedOrigins = envConfig.cors.allowedOrigins;
  if (allowedOrigins.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (
    origin &&
    allowedOrigins.includes(origin) &&
    isValidOrigin(origin)
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept",
  );
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(loggerMiddleware);

app.use("/metrics", metricsRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: envConfig.nodeEnv,
  });
});

const useMock = envConfig.useMock;
let mockService: TwitchService | undefined;
let eventSubService: EventSubService | undefined;

if (useMock) {
  logger.info("Starting in MOCK mode", {
    environment: envConfig.nodeEnv,
    service: "twitch-notification-handler",
  });
  mockService = new TwitchService();
  if (envConfig.nodeEnv !== "test") {
    mockService.start();
  }
} else {
  logger.info("Starting in REAL EventSub mode", {
    environment: envConfig.nodeEnv,
    service: "twitch-notification-handler",
  });
  eventSubService = new EventSubService();

  const ircService = new IrcService();

  if (envConfig.nodeEnv !== "test") {
    ircService.connect();
  }

  if (envConfig.nodeEnv === "production") {
    const schedulerService = new SchedulerService(eventSubService, ircService);
    void schedulerService.start();
  }

  app.use(createWebhookRouter(eventSubService));
  app.use(createAdminRouter(eventSubService));
}

if (envConfig.nodeEnv !== "test") {
  const server = app.listen(envConfig.port, () => {
    logger.info(`Server started on port ${envConfig.port}`, {
      environment: envConfig.nodeEnv,
      port: envConfig.port,
      service: "twitch-notification-handler",
    });
    if (eventSubService) {
      eventSubService
        .subscribeAll()
        .then(() => {
          logger.info("Twitch EventSub subscriptions created", {
            service: "twitch-notification-handler",
          });
        })
        .catch((err) => {
          logger.error("Failed to create Twitch EventSub subscriptions", {
            error: err instanceof Error ? err.message : String(err),
            service: "twitch-notification-handler",
          });
        });
    }
  });

  const shutdown = (signal: string) => {
    return () => {
      logger.info(`${signal} received, shutting down gracefully`, {
        service: "twitch-notification-handler",
      });
      if (mockService) {
        mockService.stop();
      }
      server.close(() => {
        logger.info("Server closed", {
          service: "twitch-notification-handler",
        });
        process.exit(0);
      });
    };
  };
  process.on("SIGTERM", shutdown("SIGTERM"));
  process.on("SIGINT", shutdown("SIGINT"));
}

export default app;
