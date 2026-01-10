import { withDb } from "./database.js";
import { appendEvent } from "../core/append.js";
import type { AuditPayload, AuditEvent } from "../core/event.js";

/**
 * Shape of the single row in chain_head.
 * This is a hard contract with the database.
 */
type ChainHeadRow = {
  last_sequence: number;
  last_chain_hash: string;
};

export function appendEventPersistent(payload: AuditPayload): AuditEvent {
  return withDb((db) => {
    const txn = db.transaction(() => {
      const head = db
        .prepare(
          `SELECT last_sequence, last_chain_hash
           FROM chain_head
           WHERE id = 1`
        )
        .get() as ChainHeadRow | undefined;

      if (!head) {
        throw new Error("Chain head missing");
      }

      const sequence = head.last_sequence + 1;
      const prevHash = head.last_chain_hash;

      const event = appendEvent(prevHash, sequence, payload);

      db.prepare(
        `INSERT INTO audit_events
         (sequence, payload_json, payload_hash, prev_chain_hash, chain_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        event.sequence,
        JSON.stringify(event.payload),
        event.payloadHash,
        event.prevChainHash,
        event.chainHash,
        Date.now()
      );

      db.prepare(
        `UPDATE chain_head
         SET last_sequence = ?, last_chain_hash = ?
         WHERE id = 1`
      ).run(event.sequence, event.chainHash);

      return event;
    });

    return txn();
  });
}
