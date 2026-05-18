import jwt from "jsonwebtoken";
import { logger } from "./logger";

const VPC_AUDIENCE = "vpc-db-gateway";

export function generateVpcToken(): string | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return jwt.sign(
    { aud: VPC_AUDIENCE, iat: Math.floor(Date.now() / 1000) },
    secret,
    {
      expiresIn: 3600,
    },
  );
}

export async function getGoogleIdToken(
  audience: string,
): Promise<string | null> {
  if (!process.env.K_SERVICE) return null;
  try {
    const metadataUrl = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`;
    const res = await fetch(metadataUrl, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn(
        `Failed to fetch Google ID token from metadata server: ${res.status} ${res.statusText}`,
      );
      return null;
    }
    return await res.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? (error as any).cause : undefined;
    logger.warn(
      `Failed to fetch Google ID token from metadata server: ${message}${cause ? ` (cause: ${String(cause)})` : ""}`,
    );
    return null;
  }
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const audience = new URL(url).origin;
  const idToken = await getGoogleIdToken(audience);
  const vpcToken = generateVpcToken();
  const headers = new Headers(options.headers);
  if (idToken) headers.set("Authorization", `Bearer ${idToken}`);
  if (vpcToken) headers.set("X-VPC-Token", vpcToken);
  return fetch(url, { ...options, headers });
}
