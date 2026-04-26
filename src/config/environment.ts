import dotenv from "dotenv";
dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || "local",
  port: Number.parseInt(process.env.PORT || "3000", 10),
  useMock: process.env.USE_MOCK === "true",
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID || "",
    clientSecret:
      process.env.TWITCH_CLIENT_SECRET ||
      process.env.TWITCH_APP_ACCESS_TOKEN ||
      "",
    webhookSecret: process.env.TWITCH_WEBHOOK_SECRET || "",
    publicCallback: process.env.PUBLIC_EVENTSUB_CALLBACK || "",
    ircNick: process.env.TWITCH_IRC_NICK || "justinfan12345",
    ircPassword: process.env.TWITCH_IRC_PASSWORD || "SCHMOOPIIE",
    ircRefreshToken: process.env.TWITCH_IRC_REFRESH_TOKEN || "",
    // Credentials of the app used to generate the IRC token (fallback to main app)
    ircClientId:
      process.env.TWITCH_IRC_CLIENT_ID || process.env.TWITCH_CLIENT_ID || "",
    ircClientSecret:
      process.env.TWITCH_IRC_CLIENT_SECRET ||
      process.env.TWITCH_CLIENT_SECRET ||
      "",
  },
  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || "*")
      .split(",")
      .map((o) => o.trim()),
  },
  chatApiKey: process.env.CHAT_API_KEY || "",
  dispatcherApiUrl:
    process.env.DISPATCHER_URL || "http://localhost:4000/events",
  chatBufferTime: Number.parseInt(process.env.CHAT_BUFFER_TIME || "5000", 10),
  batchIntervalMs: Number.parseInt(
    process.env.BATCH_INTERVAL_MS || "300000",
    10,
  ),
};
