import {
  getGoogleIdToken,
  authenticatedFetch,
} from "../../../utils/googleAuth";
import { logger } from "../../../utils/logger";

global.fetch = jest.fn();

describe("googleAuth", () => {
  const originalKService = process.env.K_SERVICE;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.K_SERVICE;
  });

  afterEach(() => {
    if (originalKService !== undefined) {
      process.env.K_SERVICE = originalKService;
    } else {
      delete process.env.K_SERVICE;
    }
  });

  describe("getGoogleIdToken", () => {
    test("returns null when K_SERVICE is not set", async () => {
      const token = await getGoogleIdToken("https://example.com");
      expect(global.fetch).not.toHaveBeenCalled();
      expect(token).toBeNull();
    });

    test("returns token when metadata fetch succeeds", async () => {
      process.env.K_SERVICE = "my-service";
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => "id-token-value",
      });

      const token = await getGoogleIdToken("https://example.com");

      expect(token).toBe("id-token-value");
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain("metadata.google.internal");
      expect(url).toContain(encodeURIComponent("https://example.com"));
      expect(options.headers["Metadata-Flavor"]).toBe("Google");
    });

    test("returns null and warns when metadata fetch returns non-ok", async () => {
      process.env.K_SERVICE = "my-service";
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });
      const warnSpy = jest
        .spyOn(logger, "warn")
        .mockImplementation(() => undefined as any);

      const token = await getGoogleIdToken("https://example.com");

      expect(token).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("500"));
    });

    test("returns null and warns when metadata fetch throws", async () => {
      process.env.K_SERVICE = "my-service";
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error("network error"),
      );
      const warnSpy = jest
        .spyOn(logger, "warn")
        .mockImplementation(() => undefined as any);

      const token = await getGoogleIdToken("https://example.com");

      expect(token).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("metadata server"),
        expect.anything(),
      );
    });
  });

  describe("authenticatedFetch", () => {
    test("adds Authorization header when token is available", async () => {
      process.env.K_SERVICE = "my-service";
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => "id-token-value",
        })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      await authenticatedFetch("https://example.com/api");

      const [url, options] = (global.fetch as jest.Mock).mock.calls[1];
      expect(url).toBe("https://example.com/api");
      expect(options.headers.get("Authorization")).toBe(
        "Bearer id-token-value",
      );
    });

    test("does not add Authorization header when no token", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await authenticatedFetch("https://example.com/api");

      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe("https://example.com/api");
      expect(options.headers.get("Authorization")).toBeNull();
    });

    test("merges existing headers with Authorization", async () => {
      process.env.K_SERVICE = "my-service";
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => "token-abc",
        })
        .mockResolvedValueOnce({ ok: true });

      await authenticatedFetch("https://example.com/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const [, options] = (global.fetch as jest.Mock).mock.calls[1];
      expect(options.headers.get("Content-Type")).toBe("application/json");
      expect(options.headers.get("Authorization")).toBe("Bearer token-abc");
    });
  });
});
