import { IrcService } from "../services/twitch/ircService";
import { config } from "../config/config";

describe("IrcService", () => {
  test("updateSubscriptions joins channels that enable IRC", () => {
    // Arrange channels
    const original = [...config.channels];
    config.channels = [
      {
        twitch_user_id: "1",
        login: "joinme",
        scopes: [],
        listen_eventsub: false,
        listen_chat_irc: true,
        eventsub_topics: [],
      },
      {
        twitch_user_id: "2",
        login: "skipme",
        scopes: [],
        listen_eventsub: false,
        listen_chat_irc: false,
        eventsub_topics: [],
      },
    ] as any;

    const svc = new IrcService();
    const fakeWs: any = {
      readyState: 1, // OPEN
      send: jest.fn(),
    };
    // Inject fake ws
    (svc as any).ws = fakeWs;

    // Act
    svc.updateSubscriptions();

    // Assert
    expect(fakeWs.send).toHaveBeenCalledWith("JOIN #joinme");
    // restore
    config.channels = original;
  });
});

describe("IrcService message buffering", () => {
  const handleBatchMock = jest.fn(async (_batch: any[]) => {});

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
      },
    }));

    const { IrcService: IrcSvc } = await import(
      "../services/twitch/ircService"
    );
    const { config: cfg } = await import("../config/config");
    (cfg as any).chatBufferTime = 10;

    const svc = new IrcSvc();
    // Inject fake ws only to satisfy potential usage
    (svc as any).ws = { readyState: 1, send: jest.fn() };

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
  });
});
