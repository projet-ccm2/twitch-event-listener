/* eslint-disable camelcase */
import { EventSubService } from "../../../../services/twitch/eventsubService";
import { config } from "../../../../config/config";

// Mock global fetch
global.fetch = jest.fn();

describe("EventSubService subscription", () => {
  let svc: EventSubService;

  beforeEach(() => {
    svc = new EventSubService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    svc.shutdown();
  });

  const mockRequest = (statusCode: number, responseBody: string = "") => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: statusCode,
      text: jest.fn().mockResolvedValue(responseBody),
    });
  };

  test("subscribeToTopic handles success (202)", async () => {
    mockRequest(202);
    const channel = config.channels[0];
    await svc.subscribeChannel(channel);
    expect(global.fetch).toHaveBeenCalled();
  });

  test("subscribeToTopic handles already exists (409)", async () => {
    mockRequest(409);
    const channel = config.channels[0];
    await svc.subscribeChannel(channel);
    expect(global.fetch).toHaveBeenCalled();
  });

  test("subscribeToTopic handles failure (400)", async () => {
    mockRequest(400, "Bad Request");
    const channel = config.channels[0];
    await svc.subscribeChannel(channel);
    expect(global.fetch).toHaveBeenCalled();
  });

  test("subscribeToTopic handles network error", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

    const channel = config.channels[0];
    const promise = svc.subscribeChannel(channel);

    await promise; // Should not throw
  });
});

describe("EventSubService normalizeEvent", () => {
  let svc: EventSubService;

  beforeEach(() => {
    svc = new EventSubService();
  });

  afterEach(() => {
    svc.shutdown();
  });

  test("normalizes event with missing fields", () => {
    const payload = {};
    const event = (svc as any).normalizeEvent(payload);

    expect(event.source).toBe("eventsub");
    expect(event.type).toBe("unknown");
    expect(event.channelId).toBeUndefined();
  });

  test("normalizes event with subscription condition", () => {
    const payload = {
      subscription: {
        type: "channel.follow",
        condition: { broadcaster_user_id: "123" },
      },
    };
    const event = (svc as any).normalizeEvent(payload);

    expect(event.channelId).toBe("123");
  });
});
