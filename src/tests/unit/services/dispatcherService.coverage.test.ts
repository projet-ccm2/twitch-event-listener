import { DispatcherService } from "../../../services/dispatcherService";
import { logger } from "../../../utils/logger";
import * as googleAuth from "../../../utils/googleAuth";

// Mock global fetch
global.fetch = jest.fn();

jest.mock("../../../utils/googleAuth", () => ({
  getGoogleIdToken: jest.fn().mockResolvedValue(null),
  authenticatedFetch: jest.fn(),
}));

describe("DispatcherService Coverage", () => {
  let svc: DispatcherService;
  const originalNodeEnv = process.env.NODE_ENV;

  const loadDispatcher = async () => {
    jest.resetModules();
    const { DispatcherService } = await import(
      "../../../services/dispatcherService"
    );
    return DispatcherService;
  };

  beforeEach(() => {
    svc = new DispatcherService("http://test-url");
    jest.clearAllMocks();
    jest.useFakeTimers();
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.useRealTimers();
  });

  test("logs to console in local mode (single event)", async () => {
    process.env.NODE_ENV = "local";
    // Reload service to pick up env change
    const DS = await loadDispatcher();
    const localSvc = new DS("http://test-url");
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();

    await localSvc.dispatch({
      id: "1",
      type: "test",
      source: "test",
      timestamp: "now",
      version: "1",
      payload: {},
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[DEV MODE] Event Received"),
    );
    consoleSpy.mockRestore();
  });

  test("logs to console in local mode (batch)", async () => {
    process.env.NODE_ENV = "local";
    const DS = await loadDispatcher();
    const localSvc = new DS("http://test-url");
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();

    await localSvc.dispatch([
      {
        id: "1",
        type: "test",
        source: "test",
        timestamp: "now",
        version: "1",
        payload: {},
      },
    ]);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[DEV MODE] Batch"),
    );
    consoleSpy.mockRestore();
  });

  test("handles ECONNREFUSED specifically", async () => {
    const error = new TypeError("fetch failed");
    (error as any).cause = { code: "ECONNREFUSED" };
    (global.fetch as jest.Mock).mockRejectedValue(error);

    // Spy on logger
    const warnSpy = jest.spyOn(logger, "warn");
    const errorSpy = jest.spyOn(logger, "error");

    // We need to wait for retries
    await svc.dispatch({
      id: "1",
      type: "test",
      source: "test",
      timestamp: "now",
      version: "1",
      payload: {},
    });

    // Fast-forward timers through retries
    await jest.runAllTimersAsync();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Dispatcher service unreachable"),
      expect.anything(),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Dropped event"),
      expect.anything(),
    );
  });

  test("logs error when batch dispatch fails", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Generic error"));
    const warnSpy = jest.spyOn(logger, "warn");

    await svc.dispatch([
      {
        id: "1",
        type: "test",
        source: "test",
        timestamp: "now",
        version: "1",
        payload: {},
      },
    ]);

    await jest.runAllTimersAsync();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to dispatch event(s) batch-1"),
      expect.anything(),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to dispatch event(s) batch-1"),
      expect.anything(),
    );
  });

  test("dispatches successfully after retries", async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error("Fail 1"))
      .mockRejectedValueOnce(new Error("Fail 2"))
      .mockResolvedValue({ ok: true });

    const warnSpy = jest.spyOn(logger, "warn");
    const debugSpy = jest.spyOn(logger, "debug");

    await svc.dispatch({
      id: "1",
      type: "test",
      source: "test",
      timestamp: "now",
      version: "1",
      payload: {},
    });

    await jest.runAllTimersAsync();

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("Successfully dispatched"),
      expect.anything(),
    );
  });

  test("sendRequest: includes Authorization header when getGoogleIdToken returns a token", async () => {
    (googleAuth.getGoogleIdToken as jest.Mock).mockResolvedValueOnce(
      "google-id-token",
    );
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
    jest
      .spyOn(logger, "debug")
      .mockImplementation(() => undefined as any);

    await svc.dispatch({
      id: "token-test",
      type: "test",
      source: "test",
      timestamp: "now",
      version: "1",
      payload: {},
    });

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers["Authorization"]).toBe("Bearer google-id-token");
  });

  test("sendRequest: omits Authorization header when getGoogleIdToken returns null", async () => {
    (googleAuth.getGoogleIdToken as jest.Mock).mockResolvedValueOnce(null);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
    jest.spyOn(logger, "debug").mockImplementation(() => undefined as any);

    await svc.dispatch({
      id: "no-token-test",
      type: "test",
      source: "test",
      timestamp: "now",
      version: "1",
      payload: {},
    });

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers["Authorization"]).toBeUndefined();
  });

  test("final drop guard logs error if async logic hangs or fails silently", async () => {
    // We want to simulate a case where we reach max attempts.
    // The code sets a 0ms timeout as a guard.
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Always fail"));
    const errorSpy = jest.spyOn(logger, "error");

    await svc.dispatch({
      id: "guard",
      type: "test",
      source: "test",
      timestamp: "now",
      version: "1",
      payload: {},
    });

    // Run through all attempts
    await jest.runAllTimersAsync();

    // Run timers one last time for the guard
    await jest.runAllTimersAsync();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Dropped event(s) guard"),
      expect.anything(),
    );
  });
});
