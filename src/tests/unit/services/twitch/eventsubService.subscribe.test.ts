/* eslint-disable camelcase */
import { EventSubService } from "../../../../services/twitch/eventsubService";

jest.mock("../../../../config/environment", () => ({
  config: {
    twitch: {
      clientId: "test_client_id",
      clientSecret: "test_secret",
      publicCallback: "https://callback.com",
      webhookSecret: "secret",
    },
  },
}));

// Mock globalThis fetch
globalThis.fetch = jest.fn();

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
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ access_token: "mock_token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
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
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ access_token: "mock_token" }),
      })
      .mockRejectedValueOnce(new Error("Network error"));

    await expect(svc.subscribeChannel(mockChannel)).resolves.not.toThrow();
  });

  test("subscribeToTopic skips already cached topics", async () => {
    // Force the first request to succeed, caching it
    mockRequest(202);
    await svc.subscribeChannel(mockChannel);

    // Reset mock
    jest.clearAllMocks();

    // Second call should be fully skipped thanks to the in-memory cache
    await svc.subscribeChannel(mockChannel);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test("subscribeChannel skips Twitch POST when subscription already exists remotely", async () => {
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ access_token: "mock_token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [
            {
              type: "channel.follow",
              condition: {
                broadcaster_user_id: "12345",
                moderator_user_id: "12345",
              },
            },
          ],
          pagination: {},
        }),
      });

    await svc.subscribeChannel(mockChannel);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect((globalThis.fetch as jest.Mock).mock.calls[1][0].toString()).toBe(
      "https://api.twitch.tv/helix/eventsub/subscriptions",
    );
  });

  test("subscribeChannel skips if token generation fails", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: jest.fn().mockResolvedValue("Unauthorized"),
    });

    await svc.subscribeChannel(mockChannel);

    // Only the token request should happen, not the subscription request
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test("subscribeChannel fails gracefully if token fetch throws", async () => {
    (globalThis.fetch as jest.Mock).mockRejectedValueOnce(
      new Error("Token Fetch Boom"),
    );

    await svc.subscribeChannel(mockChannel);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test("subscribeToTopic handles different topic types (channel.subscribe)", async () => {
    mockRequest(202);
    await svc.subscribeChannel({
      ...mockChannel,
      eventSubTopics: ["channel.subscribe"],
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  test("subscribeToTopic handles different topic types (other strings)", async () => {
    mockRequest(202);
    await svc.subscribeChannel({
      ...mockChannel,
      eventSubTopics: ["stream.online"],
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  test("subscribeToTopic handles object topic configs", async () => {
    mockRequest(202);
    await svc.subscribeChannel({
      ...mockChannel,
      eventSubTopics: [{ name: "channel.follow", version: "2" }] as any,
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  test("subscribeAll triggers on true listenEventSub", async () => {
    mockRequest(202);
    const mockDbConfig = require("../../../../config/config").config;
    mockDbConfig.channels = [
      mockChannel,
      { ...mockChannel, listenEventSub: false },
    ];

    await svc.subscribeAll();
    // Token fetch + load existing + subscribe POST
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  test("subscribeChannel bails if clientId or clientSecret is missing", async () => {
    const mockEnv = require("../../../../config/environment").config;
    const originalClientId = mockEnv.twitch.clientId;
    mockEnv.twitch.clientId = ""; // Remove the ID

    await svc.subscribeChannel(mockChannel);

    // No fetch should happen because it fails the check before `fetch`
    expect(globalThis.fetch).toHaveBeenCalledTimes(0);

    // Restore it
    mockEnv.twitch.clientId = originalClientId;
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
