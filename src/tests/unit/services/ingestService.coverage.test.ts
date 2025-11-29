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

  test("handleEvent logs error when dispatch fails", async () => {
    mockDispatcher.dispatch.mockRejectedValue(new Error("Dispatch failed"));
    const errorSpy = jest.spyOn(logger, "error");

    await svc.handleEvent({ type: "test" });

    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to ingest event",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  test("handleBatch logs error when dispatch fails", async () => {
    mockDispatcher.dispatch.mockRejectedValue(new Error("Dispatch failed"));
    const errorSpy = jest.spyOn(logger, "error");

    await svc.handleBatch([{ type: "test" }]);

    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to ingest batch",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  test("normalizeEvent handles missing ID and timestamp", async () => {
    mockDispatcher.dispatch.mockResolvedValue();

    await svc.handleEvent({ type: "test" });

    expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        timestamp: expect.any(String),
        type: "test",
      }),
    );
  });

  test("normalizeEvent extracts type from subscription", async () => {
    mockDispatcher.dispatch.mockResolvedValue();

    await svc.handleEvent({
      subscription: { type: "channel.follow" },
      event: {},
    });

    expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "channel.follow",
      }),
    );
  });
});
