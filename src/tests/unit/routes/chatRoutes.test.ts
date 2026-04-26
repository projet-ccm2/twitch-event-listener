import express from "express";
import request from "supertest";
import { createChatRouter } from "../../../routes/chatRoutes";
import { config as envConfig } from "../../../config/environment";

const VALID_KEY = "test-api-key";

function buildApp(ircService: any) {
  const app = express();
  app.use("/chat", createChatRouter(ircService));
  return app;
}

describe("POST /chat/message", () => {
  let originalKey: string;

  beforeEach(() => {
    originalKey = envConfig.chatApiKey;
    (envConfig as any).chatApiKey = VALID_KEY;
  });

  afterEach(() => {
    (envConfig as any).chatApiKey = originalKey;
  });

  test("returns 401 when API key is missing", async () => {
    const app = buildApp({});
    const res = await request(app).post("/chat/message").send({});
    expect(res.status).toBe(401);
  });

  test("returns 401 when API key is wrong", async () => {
    const app = buildApp({});
    const res = await request(app)
      .post("/chat/message")
      .set("x-api-key", "wrong")
      .send({});
    expect(res.status).toBe(401);
  });

  test("returns 503 when chatApiKey is not configured", async () => {
    (envConfig as any).chatApiKey = "";
    const app = buildApp({});
    const res = await request(app)
      .post("/chat/message")
      .set("x-api-key", VALID_KEY)
      .send({});
    expect(res.status).toBe(503);
  });

  test("returns 400 when channelLogin is missing", async () => {
    const app = buildApp({});
    const res = await request(app)
      .post("/chat/message")
      .set("x-api-key", VALID_KEY)
      .send({ message: "hello" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/channelLogin/);
  });

  test("returns 400 when message is missing", async () => {
    const app = buildApp({});
    const res = await request(app)
      .post("/chat/message")
      .set("x-api-key", VALID_KEY)
      .send({ channelLogin: "chan" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/message/);
  });

  test("returns 400 when message exceeds 500 characters", async () => {
    const app = buildApp({});
    const res = await request(app)
      .post("/chat/message")
      .set("x-api-key", VALID_KEY)
      .send({ channelLogin: "chan", message: "a".repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/500/);
  });

  test("returns 200 on success", async () => {
    const mockIrc = { sendMessage: jest.fn() };
    const app = buildApp(mockIrc);
    const res = await request(app)
      .post("/chat/message")
      .set("x-api-key", VALID_KEY)
      .send({ channelLogin: "chan", message: "hello" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockIrc.sendMessage).toHaveBeenCalledWith("chan", "hello");
  });

  test("returns 503 when IRC throws", async () => {
    const mockIrc = {
      sendMessage: jest.fn().mockImplementation(() => {
        throw new Error("IRC not connected");
      }),
    };
    const app = buildApp(mockIrc);
    const res = await request(app)
      .post("/chat/message")
      .set("x-api-key", VALID_KEY)
      .send({ channelLogin: "chan", message: "hello" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/IRC not connected/);
  });
});
