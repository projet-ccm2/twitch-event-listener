import { IrcService } from "../services/twitch/ircService";
import { config } from "../config/config";

describe("IrcService", () => {
  test("updateSubscriptions joins channels that enable IRC", () => {
    // Arrange channels
    const original = [...config.channels];
    config.channels = [
      {
        twitchUserId: "1",
        login: "joinme",
        scopes: [],
        listenEventSub: false,
        listenChatIrc: true,
        eventSubTopics: [],
      },
      {
        twitchUserId: "2",
        login: "skipme",
        scopes: [],
        listenEventSub: false,
        listenChatIrc: false,
        eventSubTopics: [],
      },
    ] as any;

    const svc = new IrcService();
    const fakeWs: any = {
      readyState: 1, // OPEN
      send: jest.fn(),
      close: jest.fn(),
    };
    // Inject fake ws
    (svc as any).ws = fakeWs;

    // Act
    svc.updateSubscriptions();

    // Assert
    expect(fakeWs.send).toHaveBeenCalledWith("JOIN #joinme");
    // restore
    config.channels = original;
    svc.shutdown();
  });

  test("updateSubscriptions does not join if already joined", () => {
    const original = [...config.channels];
    config.channels = [
      {
        twitchUserId: "1",
        login: "joined",
        scopes: [],
        listenEventSub: false,
        listenChatIrc: true,
        eventSubTopics: [],
      },
    ] as any;

    const svc = new IrcService();
    const fakeWs: any = { readyState: 1, send: jest.fn(), close: jest.fn() };
    (svc as any).ws = fakeWs;
    (svc as any).joinedChannels.add("joined");

    svc.updateSubscriptions();

    expect(fakeWs.send).not.toHaveBeenCalled();
    config.channels = original;
    svc.shutdown();
  });
});

describe("IrcService message buffering", () => {
  const handleBatchMock = jest.fn(async (_batch: any[]) => { });

  beforeEach(() => {
    jest.useFakeTimers();
    handleBatchMock.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("buffers PRIVMSG and flushes after chatBufferTime", async () => {
    jest.resetModules();
    // Mock IngestService used by IrcService
    jest.doMock("../services/ingestService", () => ({
      IngestService: class {
        handleBatch = handleBatchMock;
        shutdown = jest.fn();
      },
    }));

    const { IrcService: IrcSvc } = await import(
      "../services/twitch/ircService"
    );
    const { config: cfg } = await import("../config/config");
    (cfg as any).chatBufferTime = 10;

    const svc = new IrcSvc();
    // Inject fake ws only to satisfy potential usage
    (svc as any).ws = { readyState: 1, send: jest.fn(), close: jest.fn() };

    // Simulate incoming PRIVMSG
    (svc as any).handleMessage(":user!u@h PRIVMSG #chan :hello world\r\n");

    // Not flushed immediately
    expect(handleBatchMock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(11);
    expect(handleBatchMock).toHaveBeenCalledTimes(1);
    const [batch] = handleBatchMock.mock.calls[0];
    expect(Array.isArray(batch)).toBe(true);
    expect(batch.length).toBe(1);
    expect(batch[0].payload.message).toBe("hello world");
    svc.shutdown();
  });
});

describe("IrcService connection and handling", () => {
  let svc: IrcService;
  let fakeWs: any;

  beforeEach(() => {
    svc = new IrcService();
    fakeWs = {
      on: jest.fn(),
      send: jest.fn(),
      readyState: 0, // CONNECTING
      close: jest.fn(),
      terminate: jest.fn(),
    };
    // Mock createSocket to return our fake WS
    jest.spyOn(svc as any, "createSocket").mockReturnValue(fakeWs);
  });

  afterEach(() => {
    if (svc) {
      svc.shutdown();
    }
  });

  test("connect creates websocket and sets up listeners", () => {
    svc.connect();
    expect((svc as any).createSocket).toHaveBeenCalled();
    expect(fakeWs.on).toHaveBeenCalledWith("open", expect.any(Function));
    expect(fakeWs.on).toHaveBeenCalledWith("message", expect.any(Function));
    expect(fakeWs.on).toHaveBeenCalledWith("close", expect.any(Function));
    expect(fakeWs.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  test("does not connect if already connected", () => {
    (svc as any).ws = { readyState: 1, close: jest.fn() }; // OPEN
    svc.connect();
    expect((svc as any).createSocket).not.toHaveBeenCalled();
  });

  test("responds to PING with PONG", () => {
    svc.connect();
    // Get the message handler
    const messageHandler = fakeWs.on.mock.calls.find(
      (call: any) => call[0] === "message",
    )[1];

    messageHandler("PING :tmi.twitch.tv");
    expect(fakeWs.send).toHaveBeenCalledWith("PONG :tmi.twitch.tv");
  });

  test("handles connection error", () => {
    svc.connect();
    const errorHandler = fakeWs.on.mock.calls.find(
      (call: any) => call[0] === "error",
    )[1];

    // Should just log error, not crash
    expect(() => errorHandler(new Error("fail"))).not.toThrow();
  });

  test("handles open event (sends auth and updates subscriptions)", () => {
    svc.connect();
    const openHandler = fakeWs.on.mock.calls.find(
      (call: any) => call[0] === "open",
    )[1];

    const updateSpy = jest
      .spyOn(svc, "updateSubscriptions")
      .mockImplementation();

    openHandler();

    expect(fakeWs.send).toHaveBeenCalledWith(expect.stringContaining("PASS"));
    expect(fakeWs.send).toHaveBeenCalledWith(expect.stringContaining("NICK"));
    expect(updateSpy).toHaveBeenCalled();
  });

  test("handles close event (reconnects)", () => {
    jest.useFakeTimers();
    svc.connect();
    const closeHandler = fakeWs.on.mock.calls.find(
      (call: any) => call[0] === "close",
    )[1];

    const connectSpy = jest.spyOn(svc, "connect");
    (svc as any).ws = { readyState: 3, close: jest.fn() }; // CLOSED

    closeHandler();

    expect(connectSpy).not.toHaveBeenCalled(); // Not yet
    jest.advanceTimersByTime(5000);
    expect(connectSpy).toHaveBeenCalledTimes(1); // Reconnect only
    jest.useRealTimers();
  });
});
