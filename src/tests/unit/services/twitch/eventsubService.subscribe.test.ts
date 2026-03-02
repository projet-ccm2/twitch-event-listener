/* eslint-disable camelcase */
import { EventSubService } from "../../../../services/twitch/eventsubService";

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
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ access_token: "mock_token" }),
      })
      .mockResolvedValueOnce({
        status: statusCode,
        text: jest.fn().mockResolvedValue(responseBody),
      });
  };

  const mockChannel = {
    login: "testuser",
    twitchUserId: "12345",
    listenEventSub: true,
    listenChatIrc: true,
    eventSubTopics: ["channel.follow"],
    scopes: [],
  };

  test("subscribeToTopic handles success (202)", async () => {
    mockRequest(202);
    await svc.subscribeChannel(mockChannel);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  test("subscribeToTopic handles already exists (409)", async () => {
    mockRequest(409);
    await svc.subscribeChannel(mockChannel);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  test("subscribeToTopic handles failure (400)", async () => {
    mockRequest(400, "Bad Request");
    await svc.subscribeChannel(mockChannel);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  test("subscribeToTopic handles network error", async () => {
    (globalThis.fetch as jest.Mock).mockRejectedValue(
      new Error("Network error"),
    );

    const promise = svc.subscribeChannel(mockChannel);

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
