import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

async function run() {
  const projectId = "my-app-prod";

  console.log(`Setting up project: ${projectId}`);
  await prisma.project.upsert({
    where: { id: projectId },
    create: {
      id: projectId,
      name: "My App Prod",
      createdAt: BigInt(Date.now()),
    },
    update: {},
  });

  console.log("Clearing existing events...");
  await prisma.$executeRaw`DELETE FROM audit_events WHERE "projectId" = ${projectId}`;
  await prisma.$executeRaw`DELETE FROM chain_head WHERE "projectId" = ${projectId}`;

  let currentPrevHash = "GENESIS";
  let events = [];

  console.log("Generating 50,000 events...");
  const now = BigInt(Date.now());

  // Use a transaction and chunks for massive speed
  for (let i = 1; i <= 50000; i++) {
    // Exact canonical format used by actual core (just minimal JSON)
    const payload = JSON.stringify({ action: "log", sequence: i });
    // Exactly matching the system canonicalize:
    const canonicalPayload = JSON.stringify(JSON.parse(payload));
    const payloadHash = sha256(canonicalPayload);
    const chainHash = sha256(payloadHash + currentPrevHash);

    events.push({
      projectId,
      sequence: i,
      payloadJson: payload,
      payloadHash,
      prevChainHash: currentPrevHash,
      chainHash,
      createdAt: now,
    });

    currentPrevHash = chainHash;

    if (events.length === 5000) {
      await prisma.auditEvent.createMany({ data: events });
      process.stdout.write(`Inserted ${i}...\n`);
      events = [];
    }
  }

  await prisma.chainHead.upsert({
    where: { projectId },
    create: { projectId, lastSequence: 50000, lastChainHash: currentPrevHash },
    update: { lastSequence: 50000, lastChainHash: currentPrevHash },
  });

  console.log(
    `\nSuccessfully seeded 50,000 events for project '${projectId}'!`,
  );
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
