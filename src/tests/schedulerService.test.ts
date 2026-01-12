import { SchedulerService } from "../services/schedulerService";
import { ChannelConfig } from "../models/channel";
import { config } from "../config/config";

class MockEventSub {
  subscribeAll = jest.fn(async () => {});
}

class MockIrc {
  updateSubscriptions = jest.fn(() => {});
}

describe("SchedulerService", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("start schedules sync and calls services on success", async () => {
    const channels: ChannelConfig[] = [
      {
        twitchUserId: "1",
        login: "chan1",
        scopes: [],
        listenEventSub: true,
        listenChatIrc: true,
        eventSubTopics: ["stream.online"],
      },
    ];
    fetchMock.mockResolvedValue({ ok: true, json: async () => channels });

    const es = new MockEventSub() as any;
    const irc = new MockIrc() as any;
    const svc = new SchedulerService(es, irc);
    await svc.start();

    // first immediate sync
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(es.subscribeAll).toHaveBeenCalledTimes(1);
    expect(irc.updateSubscriptions).toHaveBeenCalledTimes(1);

    // next interval sync
    jest.advanceTimersByTime(config.syncIntervalMs);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    svc.stop();
  });

  test("error path logs and does not throw", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const es = new MockEventSub() as any;
    const irc = new MockIrc() as any;
    const svc = new SchedulerService(es, irc);
    await svc.start();
    // ensure we didn't call deps due to failure
    expect(es.subscribeAll).not.toHaveBeenCalled();
    expect(irc.updateSubscriptions).not.toHaveBeenCalled();
    svc.stop();
  });
});
