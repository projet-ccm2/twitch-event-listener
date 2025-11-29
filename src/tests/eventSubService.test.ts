/* eslint-disable camelcase */
import crypto from "crypto";

// Mock IngestService so EventSubService will use it
const handleEventMock = jest.fn(async () => {});
jest.mock("../services/ingestService", () => ({
  IngestService: class {
    handleEvent = handleEventMock;
  },
}));

import { EventSubService } from "../services/twitch/eventsubService";
import { config as envConfig } from "../config/environment";

const mockRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe("EventSubService webhook handling", () => {
  beforeEach(() => {
    handleEventMock.mockClear();
    envConfig.twitch.webhookSecret = "secret";
  });

  test("rejects when headers missing", async () => {
    const svc = new EventSubService();
    const req: any = { header: () => undefined, body: {} };
    const res = mockRes();
    await svc.handleWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("verifies signature and processes notification", async () => {
    const svc = new EventSubService();
    const body = {
      subscription: { id: "sub1", type: "channel.follow" },
      event: { id: "e1", broadcaster_user_id: "c1" },
    };
    const bodyStr = JSON.stringify(body);
    const messageId = "mid";
    const timestamp = "123456";
    const hmac = crypto.createHmac("sha256", envConfig.twitch.webhookSecret);
    const sig =
      "sha256=" + hmac.update(messageId + timestamp + bodyStr).digest("hex");

    const req: any = {
      header: (name: string) =>
        (
          ({
            "Twitch-Eventsub-Message-Id": messageId,
            "Twitch-Eventsub-Message-Timestamp": timestamp,
            "Twitch-Eventsub-Message-Signature": sig,
            "Twitch-Eventsub-Message-Type": "notification",
          }) as any
        )[name],
      rawBody: Buffer.from(bodyStr, "utf8"),
    };
    const res = mockRes();
    await svc.handleWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(handleEventMock).toHaveBeenCalled();
  });

  test("verification challenge is returned", async () => {
    const svc = new EventSubService();
    const payload = { challenge: "abc" };
    const bodyStr = JSON.stringify(payload);
    const messageId = "mid2";
    const timestamp = "654321";
    const sig =
      "sha256=" +
      crypto
        .createHmac("sha256", envConfig.twitch.webhookSecret)
        .update(messageId + timestamp + bodyStr)
        .digest("hex");

    const req: any = {
      header: (name: string) =>
        (
          ({
            "Twitch-Eventsub-Message-Id": messageId,
            "Twitch-Eventsub-Message-Timestamp": timestamp,
            "Twitch-Eventsub-Message-Signature": sig,
            "Twitch-Eventsub-Message-Type": "webhook_callback_verification",
          }) as any
        )[name],
      rawBody: Buffer.from(bodyStr, "utf8"),
    };
    const res = mockRes();
    await svc.handleWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith("abc");
  });

  test("revocation returns 200 and does not call ingest", async () => {
    const svc = new EventSubService();
    const bodyStr = JSON.stringify({});
    const messageId = "mid3";
    const timestamp = "111";
    const sig =
      "sha256=" +
      crypto
        .createHmac("sha256", envConfig.twitch.webhookSecret)
        .update(messageId + timestamp + bodyStr)
        .digest("hex");
    const req: any = {
      header: (name: string) =>
        (
          ({
            "Twitch-Eventsub-Message-Id": messageId,
            "Twitch-Eventsub-Message-Timestamp": timestamp,
            "Twitch-Eventsub-Message-Signature": sig,
            "Twitch-Eventsub-Message-Type": "revocation",
          }) as any
        )[name],
      rawBody: Buffer.from(bodyStr, "utf8"),
    };
    const res = mockRes();
    await svc.handleWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(handleEventMock).not.toHaveBeenCalled();
  });

  test("invalid signature returns 403", async () => {
    const svc = new EventSubService();
    const req: any = {
      header: (name: string) =>
        (
          ({
            "Twitch-Eventsub-Message-Id": "a",
            "Twitch-Eventsub-Message-Timestamp": "b",
            "Twitch-Eventsub-Message-Signature": "sha256=deadbeef",
            "Twitch-Eventsub-Message-Type": "notification",
          }) as any
        )[name],
      rawBody: Buffer.from("{}", "utf8"),
    };
    const res = mockRes();
    await svc.handleWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
