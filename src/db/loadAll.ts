import { prisma } from "./database.js";
import type { AuditEvent } from "../core/event.js";

// Shape of a row returned from audit_events.
type AuditEventRow = {
  sequence: number;
  payload_json: string;
  payload_hash: string;
  prev_chain_hash: string;
  chain_hash: string;
};

export async function loadAllEvents(projectId: string): Promise<AuditEvent[]> {
  const rows = await prisma.auditEvent.findMany({
    where: { projectId },
    orderBy: { sequence: "asc" },
  });

  return rows.map((row) => ({
    sequence: row.sequence,
    payload: JSON.parse(row.payloadJson),
    payloadHash: row.payloadHash,
    prevChainHash: row.prevChainHash,
    chainHash: row.chainHash,
  }));
}
