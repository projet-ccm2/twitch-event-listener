import WebSocket from "ws";
import { config } from "../../config/config";
import { config as envConfig } from "../../config/environment";
import { IngestService } from "../ingestService";
import { logger } from "../../utils/logger";
import { secureId } from "../../utils/random";

export class IrcService {
  private ws: WebSocket | null = null;
  private readonly ingestService: IngestService;
  private readonly joinedChannels: Set<string> = new Set();

  private messageBuffer: any[] = [];
  private bufferTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.ingestService = new IngestService();
  }

  public connect() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    logger.info("Connecting to Twitch IRC...", { service: "twitch-irc" });
    this.ws = this.createSocket("wss://irc-ws.chat.twitch.tv:443");

    this.ws.on("open", () => {
      logger.info("Connected to Twitch IRC", { service: "twitch-irc" });
      // Use envConfig.twitch.ircPassword and envConfig.twitch.ircNick
      // For anonymous, read-only access, password should be 'SCHMOOPIIE' and nick 'justinfan12345'
      // For authenticated access, password should be 'oauth:<token>' and nick your Twitch username
      const ircPassword = envConfig.twitch.ircPassword;
      const ircNick = envConfig.twitch.ircNick;
      this.ws?.send("CAP REQ :twitch.tv/tags");
      this.ws?.send(`PASS ${ircPassword}`);
      this.ws?.send(`NICK ${ircNick}`);
      this.updateSubscriptions();
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      let message: string;
      if (Buffer.isBuffer(data)) {
        message = data.toString("utf8");
      } else if (Array.isArray(data)) {
        message = Buffer.concat(data).toString("utf8");
      } else if (data instanceof ArrayBuffer) {
        message = Buffer.from(data).toString("utf8");
      } else {
        message = data.toString();
      }
      this.handleMessage(message.trim());
    });

    this.ws.on("close", () => {
      logger.warn("Twitch IRC connection closed. Reconnecting in 5s...", {
        service: "twitch-irc",
      });
      this.joinedChannels.clear();
      this.flushBuffer(); // Flush any remaining messages
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on("error", (err) => {
      logger.error("Twitch IRC connection error", {
        service: "twitch-irc",
        error: err,
      });
    });
  }

  public updateSubscriptions() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const channels = config.channels;
    for (const channel of channels) {
      if (channel.listenChatIrc && !this.joinedChannels.has(channel.login)) {
        this.ws.send(`JOIN #${channel.login}`);
        this.joinedChannels.add(channel.login);
        logger.info(`Joined IRC channel #${channel.login}`, {
          service: "twitch-irc",
        });
      }
    }
  }

  private handleMessage(rawMessage: string) {
    const lines = rawMessage.split("\r\n");
    for (const line of lines) {
      if (!line) continue;

      if (line.startsWith("PING")) {
        this.ws?.send("PONG :tmi.twitch.tv");
        continue;
      }

      if (line.includes("PRIVMSG")) {
        const { tags, message } = this.parseTaggedMessage(line);
        // Example without tags: :user!user@user.tmi.twitch.tv PRIVMSG #channel :message content here
        // Example with tags: @room-id=1;user-id=2 :user!user@user.tmi.twitch.tv PRIVMSG #channel :hello
        const match = /^:([^!]+)![^ ]+ PRIVMSG #([^ ]+) :(.*)$/.exec(message);
        if (match) {
          const userLogin = match[1];
          const channel = match[2];
          const messageContent = match[3];
          const channelConfig = config.channels.find(
            (configuredChannel) => configuredChannel.login === channel,
          );

          const event = {
            id: secureId(),
            source: "irc",
            type: "message",
            channelId: tags["room-id"] || channelConfig?.twitchUserId,
            channelLogin: channel,
            userId: tags["user-id"] || undefined,
            userLogin: userLogin,
            timestamp: new Date().toISOString(),
            version: "1.0",
            payload: {
              message: messageContent,
              raw: line,
            },
          };

          this.bufferMessage(event);
        }
      }
    }
  }

  private parseTaggedMessage(line: string): {
    tags: Record<string, string>;
    message: string;
  } {
    if (!line.startsWith("@")) {
      return { tags: {}, message: line };
    }

    const firstSpaceIndex = line.indexOf(" ");
    if (firstSpaceIndex === -1) {
      return { tags: {}, message: line };
    }

    const rawTags = line.slice(1, firstSpaceIndex);
    const tags = rawTags
      .split(";")
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, rawTag) => {
        const separatorIndex = rawTag.indexOf("=");
        if (separatorIndex === -1) {
          acc[rawTag] = "";
          return acc;
        }

        const key = rawTag.slice(0, separatorIndex);
        const value = rawTag.slice(separatorIndex + 1);
        acc[key] = value;
        return acc;
      }, {});

    return {
      tags,
      message: line.slice(firstSpaceIndex + 1),
    };
  }

  private bufferMessage(event: any) {
    this.messageBuffer.push(event);

    this.bufferTimer ??= setTimeout(() => {
      this.flushBuffer();
    }, config.chatBufferTime);
  }

  private flushBuffer() {
    if (this.messageBuffer.length > 0) {
      const batch = [...this.messageBuffer];
      this.messageBuffer = [];
      this.ingestService.handleBatch(batch);
    }

    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.bufferTimer = null;
    }
  }
  public shutdown() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.bufferTimer = null;
    }
    this.ingestService.shutdown();
  }

  protected createSocket(url: string): WebSocket {
    return new WebSocket(url);
  }
}
