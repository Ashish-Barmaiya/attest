import type { AuditEvent } from "./event.js";
import { hash, canonicalize } from "./hash.js";

export function verifyChain(events: readonly AuditEvent[]): void {
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event) {
      throw new Error(`Missing event at index ${i}`);
    }

    const expectedPayloadHash = hash(canonicalize(event.payload));

    if (event.payloadHash !== expectedPayloadHash) {
      throw new Error(`Payload hash mismatch at sequence ${event.sequence}`);
    }

    if (i > 0) {
      const prev = events[i - 1];
      if (!prev) {
        throw new Error(`Missing previous event at index ${i - 1}`);
      }

      if (event.prevChainHash !== prev.chainHash) {
        throw new Error(`Broken prev hash at sequence ${event.sequence}`);
      }

      const expectedChainHash = hash(event.payloadHash + prev.chainHash);

      if (event.chainHash !== expectedChainHash) {
        throw new Error(`Broken chain hash at sequence ${event.sequence}`);
      }
    }
  }
}
