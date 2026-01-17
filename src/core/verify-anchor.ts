import type { AuditEvent } from "./event.js";
import type { AnchorPayload } from "./anchor-reader.js";

export function verifyAgainstAnchor(
  events: readonly AuditEvent[],
  anchor: AnchorPayload
): void {
  // 1. Check if history covers the anchor sequence

  if (events.length === 0) {
    if (anchor.lastSequence === 0) {
      // If anchor exists, we expect events.
      throw new Error(
        `Verification failed: History is empty but anchor exists at sequence ${anchor.lastSequence}`
      );
    }
    throw new Error(
      `Verification failed: History is empty but anchor exists at sequence ${anchor.lastSequence}`
    );
  }

  const lastEvent = events[events.length - 1];
  if (!lastEvent) {
    throw new Error("Unexpected empty history");
  }

  // If the history is shorter than the anchor, data is missing (truncation/rollback).
  if (lastEvent.sequence < anchor.lastSequence) {
    throw new Error(
      `Verification failed: History ends at sequence ${lastEvent.sequence}, but anchor requires ${anchor.lastSequence}`
    );
  }

  // Find the event corresponding to the anchor
  const anchorEvent = events.find((e) => e.sequence === anchor.lastSequence);

  if (!anchorEvent) {
    // This case happens if there are gaps or if the history starts AFTER the anchor (which shouldn't happen for full verification).
    // Or if there are events up to N, but somehow missed K where K < N.
    throw new Error(
      `Verification failed: Event at anchor sequence ${anchor.lastSequence} is missing from history`
    );
  }

  // 2. Verify chain hash at anchor sequence matches
  if (anchorEvent.chainHash !== anchor.lastChainHash) {
    throw new Error(
      `Verification failed: Chain hash mismatch at sequence ${anchor.lastSequence}. ` +
        `Anchor: ${anchor.lastChainHash}, History: ${anchorEvent.chainHash}`
    );
  }

  // 3. Allows history that extends beyond the anchor
  // (Implicitly allowed since we only check that we HAVE the anchor event and it matches)
}
