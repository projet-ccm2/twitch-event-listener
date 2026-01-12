import { IngestService } from "../../../services/ingestService";
import { DispatcherService } from "../../../services/dispatcherService";
import { logger } from "../../../utils/logger";

jest.mock("../../../services/dispatcherService");

describe("IngestService Coverage", () => {
  let svc: IngestService;
  let mockDispatcher: jest.Mocked<DispatcherService>;

  beforeEach(() => {
    mockDispatcher = new DispatcherService() as any;
    svc = new IngestService(mockDispatcher);
    jest.clearAllMocks();
  });

  afterEach(() => {
    svc.shutdown();
  });

  test("handleEvent logs error when buffer fails", async () => {
    // Tests the buffer step failure, not dispatch failure
    // However, handleEvent handles the buffer step.
    // If I want to test dispatch fail, I must call flush()
    // BUT checking the implementation: handleEvent logs "Failed to buffer event" on catch.
    // flush() logs "Failed to dispatch global batch".
    // The previous test verified "Failed to ingest event" which was inside handleEvent.
    // Now handleEvent pushes to array. That is synchronous and unlikely to fail unless normalize throws.
    // To replicate the original test intent (log on error), we can force normalizeEvent to throw or spy on a failure.
    // BUT the test setup `mockDispatcher.dispatch.mockRejectedValue` suggests we wanted to test DISPATCH failure.
    // Dispatch now happens in flush().

    mockDispatcher.dispatch.mockRejectedValue(new Error("Dispatch failed"));
    const errorSpy = jest.spyOn(logger, "error");

    await svc.handleEvent({ type: "test" });
    await svc.flush();

    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to dispatch global batch",
      expect.objectContaining({ error: expect.any(Error) })
    );
  });

  test("handleBatch logs error when dispatch fails", async () => {
    mockDispatcher.dispatch.mockRejectedValue(new Error("Dispatch failed"));
    const errorSpy = jest.spyOn(logger, "error");

    await svc.handleBatch([{ type: "test" }]);
    await svc.flush();

    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to dispatch global batch",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  test("normalizeEvent handles missing ID and timestamp", async () => {
    mockDispatcher.dispatch.mockResolvedValue();

    await svc.handleEvent({ type: "test" });
    await svc.flush();

    expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          timestamp: expect.any(String),
          type: "test",
        })
      ])
    );
  });

  test("normalizeEvent extracts type from subscription", async () => {
    mockDispatcher.dispatch.mockResolvedValue();

    await svc.handleEvent({
      subscription: { type: "channel.follow" },
      event: {},
    });
    await svc.flush();

    expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: "channel.follow",
        }),
      ])
    );
  });
});
