import EventEmitter from "events";
import { loggerMiddleware } from "../middlewares/loggerMiddleware";

jest.mock("../utils/logger", () => ({
  logger: {
    info: jest.fn(),
  },
}));

import { logger } from "../utils/logger";

describe("loggerMiddleware", () => {
  let hrSpy: jest.SpyInstance<[number, number], [time?: [number, number]]>;

  beforeEach(() => {
    hrSpy = jest
      .spyOn(process, "hrtime")
      .mockImplementation((time?: [number, number]) => {
        // first call returns a start tuple, second call returns a 5ms diff
        if (time) {
          return [0, 5_000_000];
        }
        return [0, 0];
      });
    (logger.info as jest.Mock).mockClear();
  });

  afterEach(() => {
    hrSpy.mockRestore();
  });

  test("logs request details on finish", () => {
    const req: any = { method: "GET", url: "/metrics" };
    const res: any = new EventEmitter();
    res.statusCode = 200;
    const next = jest.fn();

    loggerMiddleware(req as any, res as any, next);
    res.emit("finish");

    expect(next).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("GET /metrics 200 - 5.00 ms"),
    );
  });
});
