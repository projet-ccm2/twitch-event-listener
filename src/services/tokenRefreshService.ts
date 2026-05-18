import { config as envConfig } from "../config/environment";
import { logger } from "../utils/logger";

const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";

/** Seconds before expiry at which we proactively refresh. */
const REFRESH_BEFORE_EXPIRY_S = 5 * 60;

/** Retry delay (ms) after a failed refresh attempt. */
const RETRY_DELAY_MS = 30_000;

interface ValidateResponse {
  expires_in: number; // seconds remaining
  login: string;
  scopes: string[];
}

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export class TokenRefreshService {
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Returns true if the service is configured and should run. */
  public isEnabled(): boolean {
    return (
      !!envConfig.twitch.ircRefreshToken &&
      !!envConfig.twitch.ircClientId &&
      !!envConfig.twitch.ircClientSecret
    );
  }

  public async start(): Promise<void> {
    if (!this.isEnabled()) {
      logger.info(
        "TokenRefreshService disabled (no TWITCH_IRC_REFRESH_TOKEN configured)",
        { service: "token-refresh" },
      );
      return;
    }

    logger.info("TokenRefreshService starting", { service: "token-refresh" });
    await this.validateAndSchedule();
  }

  public stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Validates the current access token to get its remaining lifetime,
   * then schedules the next refresh accordingly.
   */
  private async validateAndSchedule(): Promise<void> {
    const currentToken = this.extractBearerToken(envConfig.twitch.ircPassword);
    if (!currentToken) {
      logger.warn(
        "No valid OAuth token found in TWITCH_IRC_PASSWORD, skipping validation",
        { service: "token-refresh" },
      );
      this.scheduleRefresh(0);
      return;
    }

    try {
      const res = await fetch(TWITCH_VALIDATE_URL, {
        headers: { Authorization: `OAuth ${currentToken}` },
      });

      if (!res.ok) {
        logger.warn(
          `Token validation returned ${res.status}, refreshing immediately`,
          { service: "token-refresh" },
        );
        this.scheduleRefresh(0);
        return;
      }

      const data = (await res.json()) as ValidateResponse;
      const delayS = Math.max(0, data.expires_in - REFRESH_BEFORE_EXPIRY_S);

      logger.info(
        `Token valid for ${data.expires_in}s (login: ${data.login}), next refresh in ${delayS}s`,
        { service: "token-refresh" },
      );

      this.scheduleRefresh(delayS * 1000);
    } catch (err) {
      logger.error("Failed to validate token, retrying in 30s", {
        service: "token-refresh",
        error: err instanceof Error ? err.message : String(err),
      });
      this.scheduleRefresh(RETRY_DELAY_MS);
    }
  }

  private scheduleRefresh(delayMs: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      void this.refresh();
    }, delayMs);
  }

  private async refresh(): Promise<void> {
    logger.info("Refreshing IRC OAuth token", { service: "token-refresh" });

    /* eslint-disable camelcase */
    const body = new URLSearchParams({
      client_id: envConfig.twitch.ircClientId,
      client_secret: envConfig.twitch.ircClientSecret,
      refresh_token: envConfig.twitch.ircRefreshToken,
      grant_type: "refresh_token",
    });
    /* eslint-enable camelcase */

    try {
      const res = await fetch(TWITCH_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const data = (await res.json()) as RefreshResponse;

      // Update in-memory config so IrcService uses the new token on next reconnect
      envConfig.twitch.ircPassword = `oauth:${data.access_token}`;
      envConfig.twitch.ircRefreshToken = data.refresh_token;

      logger.info(
        `Token refreshed successfully, next expiry in ${data.expires_in}s`,
        { service: "token-refresh" },
      );

      const delayS = Math.max(0, data.expires_in - REFRESH_BEFORE_EXPIRY_S);
      this.scheduleRefresh(delayS * 1000);
    } catch (err) {
      logger.error(
        `Token refresh failed, retrying in ${RETRY_DELAY_MS / 1000}s`,
        {
          service: "token-refresh",
          error: err instanceof Error ? err.message : String(err),
        },
      );
      this.scheduleRefresh(RETRY_DELAY_MS);
    }
  }

  /** Extracts the raw token from "oauth:<token>" or returns null. */
  private extractBearerToken(ircPassword: string): string | null {
    if (ircPassword.startsWith("oauth:")) {
      return ircPassword.slice(6);
    }
    return null;
  }
}
