/* eslint-disable camelcase */
import { EventSubService } from "../../../../services/twitch/eventsubService";
import { logger } from "../../../../utils/logger";

// Mock dependencies
jest.mock("../../../../config/config", () => ({
  config: {
    channels: [
      {
        twitchUserId: "123",
        listenEventSub: true,
        eventSubTopics: ["channel.follow"],
      },
    ],
  },
}));

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

jest.mock("../../../../utils/logger");

describe("EventSubService revocation handling", () => {
  let svc: EventSubService;

  beforeEach(() => {
    svc = new EventSubService();
    jest.clearAllMocks();
    jest.spyOn(logger, "warn");
    jest.spyOn(logger, "error");
    jest.spyOn(logger, "info");

    // Mock private methods
    (svc as any).subscribeToTopic = jest.fn().mockResolvedValue(undefined);

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ access_token: "mock_token" }),
    });
  });

  afterEach(() => {
    svc.shutdown();
  });

  test("handleRevocation handles notification_failures_exceeded (re-subscribe)", async () => {
    const payload = {
      subscription: {
        id: "sub_1",
        status: "notification_failures_exceeded",
        type: "channel.follow",
        condition: { broadcaster_user_id: "123" },
        version: "2",
      },
    };

    await (svc as any).handleRevocation(payload);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Attempting to re-subscribe"),
      expect.any(Object),
    );
    expect((svc as any).subscribeToTopic).toHaveBeenCalledWith(
      expect.objectContaining({ twitchUserId: "123" }),
      expect.objectContaining({ name: "channel.follow", version: "2" }),
      "test_client_id",
      "mock_token",
      "https://callback.com",
      "secret",
    );
  });

  test("handleRevocation handles authorization_revoked (log error)", async () => {
    const payload = {
      subscription: {
        id: "sub_2",
        status: "authorization_revoked",
        type: "channel.follow",
        condition: { broadcaster_user_id: "123" },
      },
    };

    await (svc as any).handleRevocation(payload);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Critical: Subscription revoked"),
      expect.any(Object),
    );
    expect((svc as any).subscribeToTopic).not.toHaveBeenCalled();
  });

  test("handleRevocation handles user_removed (log error)", async () => {
    const payload = {
      subscription: {
        id: "sub_3",
        status: "user_removed",
        type: "channel.follow",
        condition: { broadcaster_user_id: "123" },
      },
    };

    await (svc as any).handleRevocation(payload);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Critical: Subscription revoked"),
      expect.any(Object),
    );
    expect((svc as any).subscribeToTopic).not.toHaveBeenCalled();
  });

  test("handleRevocation handles unknown channel for re-subscription", async () => {
    const payload = {
      subscription: {
        id: "sub_4",
        status: "notification_failures_exceeded",
        type: "channel.follow",
        condition: { broadcaster_user_id: "999" }, // Unknown channel
      },
    };

    await (svc as any).handleRevocation(payload);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Cannot re-subscribe: Channel 999 not found"),
      expect.any(Object),
    );
    expect((svc as any).subscribeToTopic).not.toHaveBeenCalled();
  });
});
