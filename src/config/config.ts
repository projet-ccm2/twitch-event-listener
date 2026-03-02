import * as fs from "node:fs";
import * as path from "node:path";
import { ChannelConfig } from "../models/channel";

const env = process.env.NODE_ENV || "local";

const loadChannels = (): ChannelConfig[] => {
  const filePath = path.join(__dirname, env, "channels.json");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content) as ChannelConfig[];
    return parsed;
  } catch (err) {
    console.warn(
      `Could not load channels configuration from ${filePath}: ${err}`,
    );
    return [];
  }
};

export const config = {
  channels: loadChannels(),
  eventFrequencyMs: 5000,
  dispatcherUrl: process.env.DISPATCHER_URL || "http://localhost:4000/events",
  dbServiceUrl: process.env.DB_SERVICE_URL || "http://localhost:5000",
  syncIntervalMs: Number.parseInt(process.env.SYNC_INTERVAL_MS || "60000", 10),
  chatBufferTime: Number.parseInt(process.env.CHAT_BUFFER_TIME || "5000", 10),
  twitch: {
    ircPassword: process.env.TWITCH_IRC_PASSWORD || "SCHMOOPIIE",
    ircNick: process.env.TWITCH_IRC_NICK || "justinfan12345",
  },
};
