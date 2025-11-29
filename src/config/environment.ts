import dotenv from "dotenv";
dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  useMock: process.env.USE_MOCK === "true",
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID || "",
    appAccessToken: process.env.TWITCH_APP_ACCESS_TOKEN || "",
    webhookSecret: process.env.TWITCH_WEBHOOK_SECRET || "",
    publicCallback: process.env.PUBLIC_EVENTSUB_CALLBACK || "",
  },
  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || "*")
      .split(",")
      .map((o) => o.trim()),
  },
  dispatcherApiUrl:
    process.env.DISPATCHER_API_URL || "http://localhost:4000/events",
  chatBufferTime: parseInt(process.env.CHAT_BUFFER_TIME || "5000", 10),
};
