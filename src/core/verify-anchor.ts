import type { AuditEvent } from "./event.js";
import type { AnchorPayload } from "./anchor-reader.js";

export function verifyAgainstAnchor(
  events: readonly AuditEvent[],
  anchor: AnchorPayload
): void {
  // 1. Check if history covers the anchor sequence
  // The events array is assumed to be ordered by sequence.
  // We need to find the event with sequence === anchor.lastSequence.

  if (events.length === 0) {
    if (anchor.lastSequence === 0) {
      // If anchor says sequence 0 (maybe initial state?) but we have no events.
      // But usually sequence starts at 1.
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

  // If the history is shorter than the anchor, we are missing data (truncation/rollback).
  if (lastEvent.sequence < anchor.lastSequence) {
    throw new Error(
      `Verification failed: History ends at sequence ${lastEvent.sequence}, but anchor requires ${anchor.lastSequence}`
    );
  }

  // Find the event corresponding to the anchor
  // Since events are ordered, we can try to look it up directly if sequences are contiguous 1-based indices.
  // But to be safe and generic, let's search or use a map if needed.
  // Assuming events are sorted by sequence as per `verifyChain` expectation.

  // Optimization: if events[0].sequence is 1, then index = sequence - 1.
  // But we might be verifying a slice? The requirement says "ordered audit events for a project".
  // Let's assume it's the full history or at least contains the anchor point.

  const anchorEvent = events.find((e) => e.sequence === anchor.lastSequence);

  if (!anchorEvent) {
    // This case happens if we have gaps or if the history starts AFTER the anchor (which shouldn't happen for full verification).
    // Or if we have events up to N, but somehow missed K where K < N.
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
  // (Implicitly allowed since we only checked that we HAVE the anchor event and it matches)
}
