import { createHash } from "crypto";

export const HASH_ALGO = "sha256-v1";

export function hash(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export function canonicalize(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as any).sort());
}
