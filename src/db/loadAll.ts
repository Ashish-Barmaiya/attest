import { withDb } from "./database.js";
import type { AuditEvent } from "../core/event.js";

/**
 * Shape of a row returned from audit_events.
 * This is a hard contract with the database.
 */
type AuditEventRow = {
  sequence: number;
  payload_json: string;
  payload_hash: string;
  prev_chain_hash: string;
  chain_hash: string;
};

export function loadAllEvents(): AuditEvent[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT
           sequence,
           payload_json,
           payload_hash,
           prev_chain_hash,
           chain_hash
         FROM audit_events
         ORDER BY sequence ASC`
      )
      .all() as AuditEventRow[];

    return rows.map((row) => ({
      sequence: row.sequence,
      payload: JSON.parse(row.payload_json),
      payloadHash: row.payload_hash,
      prevChainHash: row.prev_chain_hash,
      chainHash: row.chain_hash,
    }));
  });
}
