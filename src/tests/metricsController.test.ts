import type { Request, Response } from "express";

// Provide a stub instance that controller will capture at import time
let stub: any = {
  getAllMetrics: jest.fn(() => ({ ok: true })),
  getChannelMetrics: jest.fn((id: string) => ({ id })),
  getUserMetrics: jest.fn((c: string, u: string) => ({ c, u })),
};

jest.mock("../services/metricsService", () => ({
  MetricsService: {
    getInstance: () => stub,
  },
}));

import {
  getAllMetrics,
  getChannelMetrics,
  getUserMetrics,
} from "../controllers/metricsController";

const mockRes = () => {
  const res: Partial<Response> = {};
  res.status = jest.fn((code: number) => {
    (res as any).statusCode = code;
    return res as Response;
  }) as any;
  res.json = jest.fn((data: any) => data) as any;
  res.send = jest.fn((data: any) => data) as any;
  return res as Response & { statusCode?: number };
};

describe("metricsController", () => {
  beforeEach(() => {
    stub = {
      getAllMetrics: jest.fn(() => ({ ok: true })),
      getChannelMetrics: jest.fn((id: string) => ({ id })),
      getUserMetrics: jest.fn((c: string, u: string) => ({ c, u })),
    };
  });

  test("getAllMetrics returns json", () => {
    const res = mockRes();
    getAllMetrics({} as Request, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(stub.getAllMetrics).toHaveBeenCalled();
  });

  test("getChannelMetrics validates param", () => {
    const res = mockRes();
    getChannelMetrics({ params: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("getChannelMetrics returns data", () => {
    const res = mockRes();
    getChannelMetrics({ params: { channelId: "123" } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ id: "123" });
  });

  test("getUserMetrics validates params", () => {
    const res = mockRes();
    getUserMetrics(
      { params: { channelId: undefined, userId: undefined } } as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("getUserMetrics returns data", () => {
    const res = mockRes();
    getUserMetrics({ params: { channelId: "c1", userId: "u1" } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ c: "c1", u: "u1" });
  });
});
