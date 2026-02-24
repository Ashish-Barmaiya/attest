import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
const prisma = new PrismaClient();

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

async function run() {
  const projectId = "my-app-prod";
  const head = await prisma.chainHead.findUnique({ where: { projectId } });
  if (!head) {
    console.error(`Project ${projectId} not found.`);
    process.exit(1);
  }
  const targetSeq = Math.max(1, head.lastSequence - 10); // Target sequence 49990

  console.log("> Dropping last 10 events...");

  // 1. Delete the last 11 events (49990 to 50000)
  await prisma.$executeRaw`DELETE FROM audit_events WHERE "projectId" = ${projectId} AND sequence >= ${targetSeq}`;

  // 2. Fetch the new "tail" to get the prevChainHash
  const tail = await prisma.auditEvent.findFirst({
    where: { projectId },
    orderBy: { sequence: "desc" },
  });

  console.log("> Inserting 10 forged events...");

  let currentPrevHash = tail ? tail.chainHash : "GENESIS";
  let currentSeq = tail ? tail.sequence : 0;

  // 3. Generate 11 forged events and manually do the crypto chaining to restore head to 50000
  for (let i = 1; i <= 11; i++) {
    currentSeq++;
    const fakePayload = JSON.stringify({
      action: "delete_logs",
      file: `trace_${i}.log`,
    });
    const payloadHash = sha256(fakePayload);
    // Mimic the exact hashing of the core system (payloadHash + prevChainHash inside sha256)
    const chainHash = sha256(payloadHash + currentPrevHash);

    // Some timestamp
    const nowBigInt = BigInt(Date.now());

    await prisma.auditEvent.create({
      data: {
        projectId,
        sequence: currentSeq,
        payloadJson: fakePayload,
        payloadHash,
        prevChainHash: currentPrevHash,
        chainHash,
        createdAt: nowBigInt,
      },
    });
    currentPrevHash = chainHash;
  }

  // 4. Update the chain_head so the internal DB looks perfectly healthy
  await prisma.chainHead.update({
    where: { projectId },
    data: { lastSequence: currentSeq, lastChainHash: currentPrevHash },
  });

  console.log(
    "> Recomputing all internal hashes and updating chain_head... Done.",
  );
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
