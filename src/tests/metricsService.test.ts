import { MetricsService } from "../services/metricsService";
import { TwitchEvent } from "../models/event";

describe("MetricsService", () => {
  beforeEach(() => {
    MetricsService.resetInstance();
  });

  test("records events per channel and user", async () => {
    const svc = MetricsService.getInstance();
    const base: Omit<TwitchEvent, "id"> = {
      source: "test",
      type: "message",
      timestamp: new Date().toISOString(),
      version: "1.0",
      payload: {},
      channelId: "123",
      channelLogin: "chan",
      userId: "u1",
      userLogin: "user1",
    } as any;

    await svc.recordEvent({ id: "e1", ...base });
    await svc.recordEvent({ id: "e2", ...base, type: "follow" });

    const channel = svc.getChannelMetrics("123");
    expect(channel.events).toBe(2);
    const user = svc.getUserMetrics("123", "u1");
    expect(user.messages).toBe(1);
    expect(user.follows).toBe(1);
  });

  test("getters return defaults for unknown ids", () => {
    const svc = MetricsService.getInstance();
    expect(svc.getChannelMetrics("nope")).toEqual({ users: {}, events: 0 });
    expect(svc.getUserMetrics("nope", "u")).toEqual({
      messages: 0,
      follows: 0,
      subs: 0,
      cheers: 0,
      raids: 0,
      redemptions: 0,
    });
  });
});
