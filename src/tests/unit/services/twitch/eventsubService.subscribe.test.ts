/* eslint-disable camelcase */
import { EventSubService } from "../../../../services/twitch/eventsubService";
import { config } from "../../../../config/config";
import { config as envConfig } from "../../../../config/environment";
import https from "node:https";
import { EventEmitter } from "events";

jest.mock("node:https");

describe("EventSubService subscription", () => {
  let svc: EventSubService;

  beforeEach(() => {
    svc = new EventSubService();
    jest.clearAllMocks();
  });

  const mockRequest = (statusCode: number, responseBody: string = "") => {
    const req = new EventEmitter() as any;
    req.write = jest.fn();
    req.end = jest.fn();

    (https.request as jest.Mock).mockImplementation((options, callback) => {
      const res = new EventEmitter() as any;
      res.statusCode = statusCode;
      callback(res);
      res.emit("data", responseBody);
      res.emit("end");
      return req;
    });

    return req;
  };

  test("subscribeToTopic handles success (202)", async () => {
    mockRequest(202);
    const channel = config.channels[0];
    await svc.subscribeChannel(channel);
    expect(https.request).toHaveBeenCalled();
  });

  test("subscribeToTopic handles already exists (409)", async () => {
    mockRequest(409);
    const channel = config.channels[0];
    await svc.subscribeChannel(channel);
    expect(https.request).toHaveBeenCalled();
  });

  test("subscribeToTopic handles failure (400)", async () => {
    mockRequest(400, "Bad Request");
    const channel = config.channels[0];
    await svc.subscribeChannel(channel);
    expect(https.request).toHaveBeenCalled();
  });

  test("subscribeToTopic handles network error", async () => {
    const req = new EventEmitter() as any;
    req.write = jest.fn();
    req.end = jest.fn();

    (https.request as jest.Mock).mockImplementation((options, callback) => {
      return req;
    });

    const channel = config.channels[0];
    const promise = svc.subscribeChannel(channel);

    req.emit("error", new Error("Network error"));
    await promise; // Should not throw
  });
});

describe("EventSubService normalizeEvent", () => {
  let svc: EventSubService;

  beforeEach(() => {
    svc = new EventSubService();
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
