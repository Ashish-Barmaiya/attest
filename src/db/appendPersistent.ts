import { prisma } from "./database.js";
import { appendEvent } from "../core/append.js";
import type { AuditPayload, AuditEvent } from "../core/event.js";

export async function appendEventPersistent(
  payload: AuditPayload
): Promise<AuditEvent> {
  return await prisma.$transaction(async (tx: any) => {
    const head = await tx.chainHead.findUnique({
      where: { id: 1 },
    });

    if (!head) {
      throw new Error("Chain head missing");
    }

    const sequence = head.lastSequence + 1;
    const prevHash = head.lastChainHash;

    const event = appendEvent(prevHash, sequence, payload);

    await tx.auditEvent.create({
      data: {
        sequence: event.sequence,
        payloadJson: JSON.stringify(event.payload),
        payloadHash: event.payloadHash,
        prevChainHash: event.prevChainHash,
        chainHash: event.chainHash,
        createdAt: BigInt(Date.now()), // Prisma BigInt expects BigInt or number
      },
    });

    await tx.chainHead.update({
      where: { id: 1 },
      data: {
        lastSequence: event.sequence,
        lastChainHash: event.chainHash,
      },
    });

    return event;
  });
}
