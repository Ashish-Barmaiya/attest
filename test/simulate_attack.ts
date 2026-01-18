import { prisma } from "../src/db/database.js";
import { hash, canonicalize } from "../src/core/hash.js";

const PROJECT_ID = "attack-proof-proj";

async function attack() {
  console.log("Starting Attack Simulation...");

  // 1. Load all events
  const events = await prisma.auditEvent.findMany({
    where: { projectId: PROJECT_ID },
    orderBy: { sequence: "asc" },
  });

  if (events.length === 0) {
    throw new Error("No events found. Run setup first.");
  }

  console.log(`Loaded ${events.length} events.`);

  // 2. Modify Event 3
  const targetIndex = 2; // Sequence 3
  const targetEvent = events[targetIndex]!;

  if (targetEvent.sequence !== 3) {
    throw new Error(
      `Expected sequence 3 at index 2, got ${targetEvent.sequence}`
    );
  }

  const originalPayload = JSON.parse(targetEvent.payloadJson);
  const maliciousPayload = { ...originalPayload, value: 999999 }; // Malicious change

  console.log(`Modifying sequence 3:`);
  console.log(`  Original: ${JSON.stringify(originalPayload)}`);
  console.log(`  Malicious: ${JSON.stringify(maliciousPayload)}`);

  // 3. Recompute Chain
  let prevChainHash = targetEvent.prevChainHash; // Start from 3's prev

  // Need to update events starting from targetIndex
  const updates: any[] = [];

  for (let i = targetIndex; i < events.length; i++) {
    const event = events[i]!;

    // For the target event, use new payload. For others, keep existing.
    const payload =
      i === targetIndex ? maliciousPayload : JSON.parse(event.payloadJson);
    const payloadJson = JSON.stringify(payload);
    const payloadHash = hash(canonicalize(payload));
    const chainHash = hash(payloadHash + prevChainHash);

    updates.push({
      sequence: event.sequence,
      payloadJson,
      payloadHash,
      prevChainHash,
      chainHash,
    });

    console.log(
      `  Recomputed seq ${event.sequence}: ChainHash ${chainHash.substring(
        0,
        8
      )}...`
    );

    prevChainHash = chainHash;
  }

  // 4. Write to DB
  console.log("Writing changes to DB...");

  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.auditEvent.update({
        where: {
          projectId_sequence: {
            projectId: PROJECT_ID,
            sequence: update.sequence,
          },
        },
        data: {
          payloadJson: update.payloadJson,
          payloadHash: update.payloadHash,
          prevChainHash: update.prevChainHash,
          chainHash: update.chainHash,
        },
      });
    }

    // Update Chain Head
    const lastUpdate = updates[updates.length - 1];
    await tx.chainHead.update({
      where: { projectId: PROJECT_ID },
      data: {
        lastSequence: lastUpdate.sequence,
        lastChainHash: lastUpdate.chainHash,
      },
    });
  });

  console.log("Attack complete. History rewritten.");
}

attack()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
