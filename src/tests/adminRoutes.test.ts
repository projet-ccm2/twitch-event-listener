import { createAdminRouter } from "../routes/adminRoutes";
import { config } from "../config/config";
import { config as envConfig } from "../config/environment";

const mockRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const getPostHandler = (router: any) => {
  const layer = router.stack.find(
    (l: any) => l.route?.path === "/admin/channels",
  );
  return layer.route.stack[0].handle;
};

describe("createAdminRouter", () => {
  const originalChannels = [...config.channels];
  const originalUseMock = envConfig.useMock;

  afterEach(() => {
    config.channels = [...originalChannels];
    envConfig.useMock = originalUseMock;
  });

  test("rejects malformed payloads", async () => {
    const router = createAdminRouter({ subscribeChannel: jest.fn() } as any);
    const handler = getPostHandler(router);
    const res = mockRes();
    await handler({ body: null } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("adds channel and calls EventSub when enabled", async () => {
    envConfig.useMock = false;
    const subscribeChannel = jest.fn(async () => {});
    const router = createAdminRouter({ subscribeChannel } as any);
    const handler = getPostHandler(router);
    const res = mockRes();

    await handler(
      {
        body: {
          twitchUserId: "123",
          login: "newchan",
          listenEventSub: true,
          listenChatIrc: false,
        },
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(config.channels.some((c) => c.login === "newchan")).toBe(true);
    expect(subscribeChannel).toHaveBeenCalled();
  });

  test("skips subscribe when listen_eventsub is false", async () => {
    envConfig.useMock = false;
    const subscribeChannel = jest.fn(async () => {});
    const router = createAdminRouter({ subscribeChannel } as any);
    const handler = getPostHandler(router);
    const res = mockRes();

    await handler(
      {
        body: {
          twitchUserId: "999",
          login: "nosub",
          listenEventSub: false,
          listenChatIrc: true,
        },
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(subscribeChannel).not.toHaveBeenCalled();
  });
});
