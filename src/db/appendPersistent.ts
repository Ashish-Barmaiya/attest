import { prisma } from "./database.js";
import { appendEvent } from "../core/append.js";
import type { AuditPayload, AuditEvent } from "../core/event.js";

export async function appendEventPersistent(
  projectId: string,
  payload: AuditPayload
): Promise<AuditEvent> {
  return prisma.$transaction(async (tx) => {
    const head = await tx.chainHead.findUnique({
      where: { projectId },
    });

    if (!head) {
      throw new Error("Unknown project");
    }

    const nextSequence = head.lastSequence + 1;

    const event = appendEvent(head.lastChainHash, nextSequence, payload);

    await tx.auditEvent.create({
      data: {
        projectId,
        sequence: event.sequence,
        payloadJson: JSON.stringify(event.payload),
        payloadHash: event.payloadHash,
        prevChainHash: event.prevChainHash,
        chainHash: event.chainHash,
        createdAt: BigInt(Date.now()),
      },
    });

    await tx.chainHead.update({
      where: { projectId },
      data: {
        lastSequence: event.sequence,
        lastChainHash: event.chainHash,
      },
    });

    return event;
  });
}
