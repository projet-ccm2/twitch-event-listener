import * as fs from "node:fs";
import * as path from "node:path";

jest.mock("node:fs", () => ({
  readFileSync: jest.fn(),
}));

describe("config.ts", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("should load empty channels when NODE_ENV is not local", () => {
    process.env.NODE_ENV = "production";

    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (
        filePath.toString().includes(path.join("production", "channels.json"))
      ) {
        return "[]";
      }
      throw new Error("Wrong path");
    });

    const { config } = require("../../../config/config");
    expect(config.channels).toEqual([]);
  });

  it("should return empty array and warn on fs error", () => {
    process.env.NODE_ENV = "production";
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("Simulated file read error");
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation();

    const { config } = require("../../../config/config");
    expect(config.channels).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });
});
