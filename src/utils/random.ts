import crypto from "crypto";

// Cryptographically secure unique ID
export function secureId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString("hex");
}

// Cryptographically secure random integer in [0, max)
export function secureRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) throw new Error("maxExclusive must be > 0");
  return crypto.randomInt(0, maxExclusive);
}

// Cryptographically secure random integer in [min, max)
export function secureRandomIntRange(
  minInclusive: number,
  maxExclusive: number,
): number {
  if (maxExclusive <= minInclusive) throw new Error("Invalid range");
  return crypto.randomInt(minInclusive, maxExclusive);
}
