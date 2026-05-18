import {
  getGoogleIdToken,
  authenticatedFetch,
  generateVpcToken,
} from "../../../utils/googleAuth";
import { logger } from "../../../utils/logger";
import jwt from "jsonwebtoken";

global.fetch = jest.fn();

describe("googleAuth", () => {
  const originalKService = process.env.K_SERVICE;
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.K_SERVICE;
    delete process.env.JWT_SECRET;
  });

  afterEach(() => {
    if (originalKService !== undefined) {
      process.env.K_SERVICE = originalKService;
    } else {
      delete process.env.K_SERVICE;
    }
    if (originalJwtSecret !== undefined) {
      process.env.JWT_SECRET = originalJwtSecret;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  describe("generateVpcToken", () => {
    test("returns null when JWT_SECRET is not set", () => {
      expect(generateVpcToken()).toBeNull();
    });

    test("returns a signed JWT with vpc-db-gateway audience", () => {
      process.env.JWT_SECRET = "test-secret";
      const token = generateVpcToken();
      expect(token).not.toBeNull();
      const decoded = jwt.verify(token!, "test-secret") as jwt.JwtPayload;
      expect(decoded.aud).toBe("vpc-db-gateway");
    });
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
      expect(url).not.toContain(encodeURIComponent("/path"));
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
    test("adds Authorization and X-VPC-Token headers when tokens are available", async () => {
      process.env.K_SERVICE = "my-service";
      process.env.JWT_SECRET = "test-secret";
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => "id-token-value",
        })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      await authenticatedFetch("https://example.com/api/users");

      const [metadataUrl] = (global.fetch as jest.Mock).mock.calls[0];
      expect(metadataUrl).toContain(encodeURIComponent("https://example.com"));
      expect(metadataUrl).not.toContain(encodeURIComponent("/api/users"));

      const [url, options] = (global.fetch as jest.Mock).mock.calls[1];
      expect(url).toBe("https://example.com/api/users");
      expect(options.headers.get("Authorization")).toBe("id-token-value");
      expect(options.headers.get("X-VPC-Token")).not.toBeNull();
    });

    test("does not add Authorization or X-VPC-Token when no tokens", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      await authenticatedFetch("https://example.com/api");

      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe("https://example.com/api");
      expect(options.headers.get("Authorization")).toBeNull();
      expect(options.headers.get("X-VPC-Token")).toBeNull();
    });

    test("merges existing headers with auth headers", async () => {
      process.env.K_SERVICE = "my-service";
      process.env.JWT_SECRET = "test-secret";
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
      expect(options.headers.get("Authorization")).toBe("token-abc");
      expect(options.headers.get("X-VPC-Token")).not.toBeNull();
    });
  });
});
