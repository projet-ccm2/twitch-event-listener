/* eslint-disable camelcase */
import { TokenRefreshService } from "../../../services/tokenRefreshService";
import { config as envConfig } from "../../../config/environment";

const VALID_TOKEN = "validtoken123";
const REFRESH_TOKEN = "refresh456";

function mockFetch(responses: Array<{ ok: boolean; body: object }>) {
  let call = 0;
  return jest.fn().mockImplementation(() => {
    const r = responses[call] ?? responses[responses.length - 1];
    call++;
    return Promise.resolve({
      ok: r.ok,
      status: r.ok ? 200 : 401,
      text: () => Promise.resolve(JSON.stringify(r.body)),
      json: () => Promise.resolve(r.body),
    });
  });
}

describe("TokenRefreshService", () => {
  let svc: TokenRefreshService;
  let originalPassword: string;
  let originalRefreshToken: string;

  beforeEach(() => {
    jest.useFakeTimers();
    originalPassword = envConfig.twitch.ircPassword;
    originalRefreshToken = envConfig.twitch.ircRefreshToken;
    svc = new TokenRefreshService();
  });

  afterEach(() => {
    svc.stop();
    envConfig.twitch.ircPassword = originalPassword;
    envConfig.twitch.ircRefreshToken = originalRefreshToken;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("isEnabled()", () => {
    test("returns false when refresh token is missing", () => {
      envConfig.twitch.ircRefreshToken = "";
      expect(svc.isEnabled()).toBe(false);
    });

    test("returns true when all credentials are set", () => {
      envConfig.twitch.ircRefreshToken = REFRESH_TOKEN;
      envConfig.twitch.ircClientId = "cid";
      envConfig.twitch.ircClientSecret = "csec";
      expect(svc.isEnabled()).toBe(true);
    });
  });

  describe("start()", () => {
    test("does nothing when disabled", async () => {
      envConfig.twitch.ircRefreshToken = "";
      const fetchSpy = jest.spyOn(global, "fetch" as any);
      await svc.start();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("validates token and schedules refresh before expiry", async () => {
      envConfig.twitch.ircRefreshToken = REFRESH_TOKEN;
      envConfig.twitch.ircClientId = "cid";
      envConfig.twitch.ircClientSecret = "csec";
      envConfig.twitch.ircPassword = `oauth:${VALID_TOKEN}`;

      global.fetch = mockFetch([
        {
          ok: true,
          body: { expires_in: 600, login: "mybot", scopes: ["chat:edit"] },
        },
      ]) as any;

      await svc.start();
      // expires_in=600, REFRESH_BEFORE_EXPIRY_S=300 → timer at 300s
      expect(global.fetch).toHaveBeenCalledWith(
        "https://id.twitch.tv/oauth2/validate",
        expect.objectContaining({
          headers: { Authorization: `OAuth ${VALID_TOKEN}` },
        }),
      );
    });

    test("refreshes immediately when token validation fails", async () => {
      envConfig.twitch.ircRefreshToken = REFRESH_TOKEN;
      envConfig.twitch.ircClientId = "cid";
      envConfig.twitch.ircClientSecret = "csec";
      envConfig.twitch.ircPassword = `oauth:${VALID_TOKEN}`;

      global.fetch = mockFetch([
        { ok: false, body: { status: 401, message: "invalid token" } },
        {
          ok: true,
          body: {
            access_token: "newtoken",
            refresh_token: "newrefresh",
            expires_in: 14400,
          },
        },
      ]) as any;

      await svc.start();
      // Validation fails → scheduleRefresh(0) → fire that one timer only
      await jest.runOnlyPendingTimersAsync();

      expect(envConfig.twitch.ircPassword).toBe("oauth:newtoken");
      expect(envConfig.twitch.ircRefreshToken).toBe("newrefresh");
    });
  });

  describe("refresh flow", () => {
    test("updates envConfig after successful refresh", async () => {
      envConfig.twitch.ircRefreshToken = REFRESH_TOKEN;
      envConfig.twitch.ircClientId = "cid";
      envConfig.twitch.ircClientSecret = "csec";
      envConfig.twitch.ircPassword = `oauth:${VALID_TOKEN}`;

      global.fetch = mockFetch([
        // validate → expires in 0 → refresh immediately
        { ok: true, body: { expires_in: 0, login: "bot", scopes: [] } },
        {
          ok: true,
          body: {
            access_token: "freshtoken",
            refresh_token: "freshrefresh",
            expires_in: 14400,
          },
        },
      ]) as any;

      await svc.start();
      // expires_in=0 → delay=0 → fire the immediate refresh timer only
      await jest.runOnlyPendingTimersAsync();

      expect(envConfig.twitch.ircPassword).toBe("oauth:freshtoken");
      expect(envConfig.twitch.ircRefreshToken).toBe("freshrefresh");
    });

    test("retries after 30s on failed refresh", async () => {
      envConfig.twitch.ircRefreshToken = REFRESH_TOKEN;
      envConfig.twitch.ircClientId = "cid";
      envConfig.twitch.ircClientSecret = "csec";
      envConfig.twitch.ircPassword = `oauth:${VALID_TOKEN}`;

      global.fetch = mockFetch([
        { ok: true, body: { expires_in: 0, login: "bot", scopes: [] } },
        { ok: false, body: { status: 400, message: "bad refresh token" } },
        {
          ok: true,
          body: {
            access_token: "retried",
            refresh_token: "newref",
            expires_in: 14400,
          },
        },
      ]) as any;

      await svc.start();
      await jest.runOnlyPendingTimersAsync(); // fires refresh → fails → schedules 30s retry
      await jest.runOnlyPendingTimersAsync(); // fires 30s retry → succeeds

      expect(envConfig.twitch.ircPassword).toBe("oauth:retried");
    });
  });

  describe("stop()", () => {
    test("cancels pending timer", async () => {
      envConfig.twitch.ircRefreshToken = REFRESH_TOKEN;
      envConfig.twitch.ircClientId = "cid";
      envConfig.twitch.ircClientSecret = "csec";
      envConfig.twitch.ircPassword = `oauth:${VALID_TOKEN}`;

      global.fetch = mockFetch([
        { ok: true, body: { expires_in: 14400, login: "bot", scopes: [] } },
      ]) as any;

      await svc.start();
      svc.stop();

      const fetchCallsBefore = (global.fetch as jest.Mock).mock.calls.length;
      await jest.runOnlyPendingTimersAsync();
      // No additional fetch calls after stop
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(
        fetchCallsBefore,
      );
    });
  });
});
