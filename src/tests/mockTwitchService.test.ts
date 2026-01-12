const mockHandleEvent = jest.fn();

jest.mock("../services/ingestService", () => ({
  IngestService: class {
    handleEvent = mockHandleEvent;
    shutdown = jest.fn();
  },
}));

import { TwitchService } from "../services/twitch/mockTwitchService";
import { config } from "../config/config";

describe("TwitchService mock generator", () => {
  const originalChannels = [...config.channels];
  const originalFreq = config.eventFrequencyMs;

  beforeEach(() => {
    jest.useFakeTimers();
    mockHandleEvent.mockClear();
    config.channels = [
      {
        twitchUserId: "abc",
        login: "chan",
        scopes: [],
        listenEventSub: true,
        listenChatIrc: true,
        eventSubTopics: ["stream.online"],
      },
    ] as any;
    (config as any).eventFrequencyMs = 5;
  });

  afterEach(() => {
    jest.useRealTimers();
    config.channels = [...originalChannels];
    (config as any).eventFrequencyMs = originalFreq;
  });

  test("start schedules events and stop clears interval", () => {
    const svc = new TwitchService();
    svc.start();
    jest.advanceTimersByTime(6);
    expect(mockHandleEvent).toHaveBeenCalled();
    svc.stop();
    const calls = mockHandleEvent.mock.calls.length;
    jest.advanceTimersByTime(50);
    expect(mockHandleEvent.mock.calls.length).toBe(calls);
  });

  test("start is idempotent", () => {
    const svc = new TwitchService();
    svc.start();
    svc.start();
    jest.advanceTimersByTime(6);
    expect(mockHandleEvent).toHaveBeenCalledTimes(1);
    svc.stop();
  });
});
