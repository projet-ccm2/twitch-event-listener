import { DispatcherService } from "../../../services/dispatcherService";
import { config as envConfig } from "../../../config/environment";
import { logger } from "../../../utils/logger";

// Mock global fetch
global.fetch = jest.fn();

describe("DispatcherService Coverage", () => {
  let svc: DispatcherService;
  const originalNodeEnv = envConfig.nodeEnv;

  beforeEach(() => {
    svc = new DispatcherService("http://test-url");
    jest.clearAllMocks();
    jest.useFakeTimers();
    envConfig.nodeEnv = "test";
  });

  afterEach(() => {
    envConfig.nodeEnv = originalNodeEnv;
    jest.useRealTimers();
  });

  test("logs to console in development mode (single event)", async () => {
    envConfig.nodeEnv = "development";
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();

    await svc.dispatch({
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

  test("logs to console in development mode (batch)", async () => {
    envConfig.nodeEnv = "development";
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();

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
    const promise = svc.dispatch({
      id: "1",
      type: "test",
      source: "test",
      timestamp: "now",
      version: "1",
      payload: {},
    });

    // Fast-forward timers through retries
    for (let i = 0; i < 5; i++) {
      await Promise.resolve(); // Allow async loop to progress
      jest.runAllTimers();
    }

    await promise;

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

    const promise = svc.dispatch([
      {
        id: "1",
        type: "test",
        source: "test",
        timestamp: "now",
        version: "1",
        payload: {},
      },
    ]);

    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      jest.runAllTimers();
    }
    await promise;

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

    const promise = svc.dispatch({
      id: "1",
      type: "test",
      source: "test",
      timestamp: "now",
      version: "1",
      payload: {},
    });

    for (let i = 0; i < 3; i++) {
      await Promise.resolve();
      jest.runAllTimers();
    }
    await promise;

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("Successfully dispatched"),
      expect.anything(),
    );
  });

  test("final drop guard logs error if async logic hangs or fails silently", async () => {
    // We want to simulate a case where we reach max attempts.
    // The code sets a 0ms timeout as a guard.
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Always fail"));
    const errorSpy = jest.spyOn(logger, "error");

    const promise = svc.dispatch({
      id: "guard",
      type: "test",
      source: "test",
      timestamp: "now",
      version: "1",
      payload: {},
    });

    // Run through all attempts
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      jest.runAllTimers();
    }
    await promise;

    // Run timers one last time for the guard
    jest.runAllTimers();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Dropped event(s) guard"),
      expect.anything(),
    );
  });
});
