import { TwitchEvent } from "../models/event";

interface UserMetrics {
  messages: number;
  follows: number;
  subs: number;
  cheers: number;
  raids: number;
  redemptions: number;
  lastActivityAt?: Date;
}

interface ChannelMetrics {
  users: { [userId: string]: UserMetrics };
  events: number;
}

export class MetricsService {
  private static instance: MetricsService;
  private channelMetrics: Map<string, ChannelMetrics>;

  private constructor() {
    this.channelMetrics = new Map();
  }

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  public static resetInstance(): void {
    MetricsService.instance = undefined as any;
  }

  public async recordEvent(event: TwitchEvent) {
    const channelId = event.channelId || event.channelLogin || "unknown";
    let cMetrics = this.channelMetrics.get(channelId);
    if (!cMetrics) {
      cMetrics = { users: {}, events: 0 };
      this.channelMetrics.set(channelId, cMetrics);
    }
    cMetrics.events++;

    if (event.userId) {
      let uMetrics = cMetrics.users[event.userId];
      if (!uMetrics) {
        uMetrics = {
          messages: 0,
          follows: 0,
          subs: 0,
          cheers: 0,
          raids: 0,
          redemptions: 0,
        };
        cMetrics.users[event.userId] = uMetrics;
      }
      switch (event.type) {
        case "message":
          uMetrics.messages++;
          break;
        case "follow":
          uMetrics.follows++;
          break;
        case "subscribe":
          uMetrics.subs++;
          break;
        case "cheer":
          uMetrics.cheers++;
          break;
        case "raid":
          uMetrics.raids++;
          break;
        case "channel_points_redemption":
          uMetrics.redemptions++;
          break;
        default:
          // Unknown events are simply counted on the channel
          break;
      }
      uMetrics.lastActivityAt = new Date(event.timestamp);
    }
  }

  public getAllMetrics() {
    return Array.from(this.channelMetrics.entries()).map(([id, metrics]) => ({
      channelId: id,
      metrics,
    }));
  }

  public getChannelMetrics(channelId: string): ChannelMetrics {
    return (
      this.channelMetrics.get(channelId) || {
        users: {},
        events: 0,
      }
    );
  }

  public getUserMetrics(channelId: string, userId: string): UserMetrics {
    const channel = this.channelMetrics.get(channelId);
    if (channel) {
      return (
        channel.users[userId] || {
          messages: 0,
          follows: 0,
          subs: 0,
          cheers: 0,
          raids: 0,
          redemptions: 0,
        }
      );
    }
    return {
      messages: 0,
      follows: 0,
      subs: 0,
      cheers: 0,
      raids: 0,
      redemptions: 0,
    };
  }
}
