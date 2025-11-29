import { MetricsService } from "../../../services/metricsService";
import { TwitchEvent } from "../../../models/event";

describe("MetricsService Coverage", () => {
  let svc: MetricsService;

  beforeEach(() => {
    MetricsService.resetInstance();
    svc = MetricsService.getInstance();
  });

  const createEvent = (
    type: string,
    userId: string = "u1",
    channelId: string = "c1",
  ): TwitchEvent => ({
    id: "1",
    type,
    source: "test",
    timestamp: new Date().toISOString(),
    version: "1",
    channelLogin: channelId,
    userId,
    payload: {},
  });

  test("records all event types correctly", async () => {
    const types = [
      "message",
      "follow",
      "subscribe",
      "cheer",
      "raid",
      "channel_points_redemption",
      "unknown_type",
    ];

    for (const type of types) {
      await svc.recordEvent(createEvent(type));
    }

    const metrics = svc.getUserMetrics("c1", "u1");
    expect(metrics.messages).toBe(1);
    expect(metrics.follows).toBe(1);
    expect(metrics.subs).toBe(1);
    expect(metrics.cheers).toBe(1);
    expect(metrics.raids).toBe(1);
    expect(metrics.redemptions).toBe(1);
  });

  test("handles new channel and user creation", async () => {
    await svc.recordEvent(createEvent("message", "new_user", "new_channel"));

    const channelMetrics = svc.getChannelMetrics("new_channel");
    expect(channelMetrics.events).toBe(1);
    expect(channelMetrics.users["new_user"]).toBeDefined();
  });

  test("getChannelMetrics returns default for unknown channel", () => {
    const metrics = svc.getChannelMetrics("unknown");
    expect(metrics.events).toBe(0);
    expect(metrics.users).toEqual({});
  });

  test("getUserMetrics returns default for unknown channel", () => {
    const metrics = svc.getUserMetrics("unknown", "u1");
    expect(metrics.messages).toBe(0);
  });

  test("getUserMetrics returns default for unknown user in existing channel", async () => {
    await svc.recordEvent(createEvent("message", "u1", "c1"));
    const metrics = svc.getUserMetrics("c1", "unknown_user");
    expect(metrics.messages).toBe(0);
  });

  test("getAllMetrics returns all metrics", async () => {
    await svc.recordEvent(createEvent("message", "u1", "c1"));
    const all = svc.getAllMetrics();
    expect(all).toHaveLength(1);
    expect(all[0].channelId).toBe("c1");
  });

  test("singleton instance works", () => {
    const instance1 = MetricsService.getInstance();
    const instance2 = MetricsService.getInstance();
    expect(instance1).toBe(instance2);
  });
});
