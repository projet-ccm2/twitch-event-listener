import { TwitchEvent } from "../models/event";

// Helper to (re)load DispatcherService with a fresh environment
const loadDispatcher = async () => {
  jest.resetModules();
  return await import("../services/dispatcherService");
};

describe("DispatcherService", () => {
  const originalEnv = process.env.NODE_ENV;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env.NODE_ENV = originalEnv;
    jest.resetModules();
  });

  test("local mode: prints to console and does not call fetch", async () => {
    process.env.NODE_ENV = "local";
    const { DispatcherService } = await loadDispatcher();

    const ds = new DispatcherService("http://example.com");
    const event: TwitchEvent = {
      id: "1",
      source: "test",
      type: "x",
      timestamp: new Date().toISOString(),
      version: "1.0",
      payload: {},
    };

    const logSpy = jest.spyOn(console, "log");
    await ds.dispatch(event);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
  });

  test("prod: success path posts JSON", async () => {
    process.env.NODE_ENV = "production";
    const { DispatcherService } = await loadDispatcher();
    const { logger } = await import("../utils/logger");
    jest.spyOn(logger, "debug").mockImplementation(() => undefined as any);

    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const ds = new DispatcherService("http://api/dispatch");
    const evt: TwitchEvent = {
      id: "abc",
      source: "test",
      type: "y",
      timestamp: new Date().toISOString(),
      version: "1.0",
      payload: { a: 1 },
    };

    await ds.dispatch(evt);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api/dispatch");
    expect(options.method).toBe("POST");
    expect(options.headers.get("Content-Type")).toBe("application/json");
    expect(options.body).toBe(JSON.stringify(evt));
  });

  test("prod: retries with backoff and drops after max attempts", async () => {
    process.env.NODE_ENV = "production";
    const { DispatcherService } = await loadDispatcher();
    const { logger } = await import("../utils/logger");
    jest.spyOn(logger, "warn").mockImplementation(() => undefined as any);
    const errSpy = jest
      .spyOn(logger, "error")
      .mockImplementation(() => undefined as any);

    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const ds = new DispatcherService("http://api/dispatch");
    const evt: TwitchEvent = {
      id: "drop-me",
      source: "test",
      type: "z",
      timestamp: new Date().toISOString(),
      version: "1.0",
      payload: {},
    };

    await ds.dispatch(evt);

    // Use runAllTimersAsync to execute all pending timers and their async callbacks
    await jest.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(errSpy).toHaveBeenCalled();
  });
});
