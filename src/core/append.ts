import type { AuditPayload, AuditEvent } from "./event.js";
import { AuditPayloadSchema } from "./event.js";
import { hash, canonicalize } from "./hash.js";

export function appendEvent(
  prevChainHash: string,
  sequence: number,
  payload: AuditPayload
): AuditEvent {
  AuditPayloadSchema.parse(payload);

  const payloadHash = hash(canonicalize(payload));
  const chainHash = hash(payloadHash + prevChainHash);

  return {
    sequence,
    payload,
    payloadHash,
    prevChainHash,
    chainHash,
  };
}
