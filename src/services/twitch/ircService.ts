import WebSocket from "ws";
import { config } from "../../config/config";
import { IngestService } from "../ingestService";
import { logger } from "../../utils/logger";
import { secureId } from "../../utils/random";

export class IrcService {
  private ws: WebSocket | null = null;
  private readonly ingestService: IngestService;
  private readonly joinedChannels: Set<string> = new Set();

  private messageBuffer: any[] = [];
  private bufferTimer: NodeJS.Timeout | null = null;

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
      // Use config.twitch.ircPassword and config.twitch.ircNick if provided, else default to anonymous
      // For anonymous, read-only access, password should be 'SCHMOOPIIE' and nick 'justinfan12345'
      // For authenticated access, password should be 'oauth:<token>' and nick your Twitch username
      const ircPassword = config.twitch?.ircPassword || "SCHMOOPIIE";
      const ircNick = config.twitch?.ircNick || "justinfan12345";
      this.ws?.send(`PASS ${ircPassword}`);
      this.ws?.send(`NICK ${ircNick}`);
      this.updateSubscriptions();
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      const message = data.toString().trim();
      this.handleMessage(message);
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
        // Example: :user!user@user.tmi.twitch.tv PRIVMSG #channel :message content here
        const match = line.match(/^:([^!]+)![^ ]+ PRIVMSG #([^ ]+) :(.*)$/);
        if (match) {
          const userLogin = match[1];
          const channel = match[2];
          const messageContent = match[3];

          const event = {
            id: secureId(),
            source: "irc",
            type: "message",
            channelLogin: channel,
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

  private bufferMessage(event: any) {
    this.messageBuffer.push(event);

    if (!this.bufferTimer) {
      this.bufferTimer = setTimeout(() => {
        this.flushBuffer();
      }, config.chatBufferTime);
    }
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
  protected createSocket(url: string): WebSocket {
    return new WebSocket(url);
  }
}
