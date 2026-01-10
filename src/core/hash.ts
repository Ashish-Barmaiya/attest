import { createHash } from "crypto";

export const HASH_ALGO = "sha256-v1";

export function hash(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortObject((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  return value;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortObject(value));
}
