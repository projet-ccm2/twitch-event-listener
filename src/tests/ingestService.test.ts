import { IngestService } from "../services/ingestService";
import { DispatcherService } from "../services/dispatcherService";

describe("IngestService", () => {
  test("handleEvent normalizes and dispatches", async () => {
    const dispatched: any[] = [];
    const fakeDispatcher: Pick<DispatcherService, "dispatch"> = {
      dispatch: jest.fn(async (e) => {
        dispatched.push(e);
      }),
    };

    const svc = new IngestService(fakeDispatcher as DispatcherService);
    await svc.handleEvent({
      id: "evt1",
      timestamp: "2020-01-01T00:00:00.000Z",
      source: "eventsub",
      subscription: { type: "channel.follow" },
      event: { foo: "bar" },
    });

    await svc.flush();

    expect(dispatched).toHaveLength(1);
    const batch = dispatched[0];
    expect(Array.isArray(batch)).toBe(true);
    expect(batch).toHaveLength(1);
    const e = batch[0];
    expect(e.id).toBe("evt1");
    expect(e.type).toBe("channel.follow");
    expect(e.type).toBe("channel.follow");
    expect(e.payload).toEqual({ foo: "bar" });
    svc.shutdown();
  });

  test("handleBatch normalizes and dispatches array", async () => {
    const fakeDispatcher: Pick<DispatcherService, "dispatch"> = {
      dispatch: jest.fn(async () => { }),
    };
    const svc = new IngestService(fakeDispatcher as DispatcherService);

    await svc.handleBatch([
      { id: "a", event: { a: 1 } },
      { id: "b", event: { b: 2 } },
    ]);

    await svc.flush();

    expect(fakeDispatcher.dispatch).toHaveBeenCalledTimes(1);
    const [arg] = (fakeDispatcher.dispatch as jest.Mock).mock.calls[0];
    expect(Array.isArray(arg)).toBe(true);
    expect(arg).toHaveLength(2);
    expect(arg[0].id).toBe("a");
    expect(arg[1].id).toBe("b");
    svc.shutdown();
  });

  test("errors are logged when dispatch throws", async () => {
    const { logger } = await import("../utils/logger");
    const errSpy = jest
      .spyOn(logger, "error")
      .mockImplementation(() => undefined as any);
    const fakeDispatcher: Pick<DispatcherService, "dispatch"> = {
      dispatch: jest.fn(async () => {
        throw new Error("boom");
      }),
    };
    const svc = new IngestService(fakeDispatcher as DispatcherService);

    await svc.handleEvent({ id: "x" });
    await svc.flush();
    expect(errSpy).toHaveBeenCalled();
    svc.shutdown();
  });
});
