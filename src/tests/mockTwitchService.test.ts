const handleEventMock = jest.fn();

jest.mock("../services/ingestService", () => ({
  IngestService: class {
    handleEvent = handleEventMock;
  },
}));

import { TwitchService } from "../services/twitch/mockTwitchService";
import { config } from "../config/config";

describe("TwitchService mock generator", () => {
  const originalChannels = [...config.channels];
  const originalFreq = config.eventFrequencyMs;

  beforeEach(() => {
    jest.useFakeTimers();
    handleEventMock.mockClear();
    config.channels = [
      {
        twitch_user_id: "abc",
        login: "chan",
        scopes: [],
        listen_eventsub: true,
        listen_chat_irc: true,
        eventsub_topics: ["stream.online"],
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
    expect(handleEventMock).toHaveBeenCalled();
    svc.stop();
    const calls = handleEventMock.mock.calls.length;
    jest.advanceTimersByTime(50);
    expect(handleEventMock.mock.calls.length).toBe(calls);
  });

  test("start is idempotent", () => {
    const svc = new TwitchService();
    svc.start();
    svc.start();
    jest.advanceTimersByTime(6);
    expect(handleEventMock).toHaveBeenCalledTimes(1);
  });
});
