import { logger } from "./logger";

export async function getGoogleIdToken(
  audience: string,
): Promise<string | null> {
  if (!process.env.K_SERVICE) return null;
  try {
    const metadataUrl = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`;
    const res = await fetch(metadataUrl, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      logger.warn(
        `Failed to fetch Google ID token from metadata server: ${res.status} ${res.statusText}`,
      );
      return null;
    }
    return await res.text();
  } catch (error) {
    logger.warn("Failed to fetch Google ID token from metadata server", {
      error,
    });
    return null;
  }
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const idToken = await getGoogleIdToken(url);
  const headers = new Headers(options.headers);
  if (idToken) headers.set("Authorization", `Bearer ${idToken}`);
  return fetch(url, { ...options, headers });
}
