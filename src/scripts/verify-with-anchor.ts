import { prisma } from "../db/database.js";
import { verifyChain } from "../core/verify.js";
import { readAnchor } from "../core/anchor-reader.js";
import { verifyAgainstAnchor } from "../core/verify-anchor.js";
import fs from "fs";

// const prisma = new PrismaClient(); // Removed

async function main() {
  const projectId = process.argv[2];
  const anchorDir = process.env.ANCHOR_DIR;

  if (!projectId) {
    console.error(
      "Usage: npx tsx src/scripts/verify-with-anchor.ts <projectId>"
    );
    process.exit(1);
  }

  if (!anchorDir) {
    console.error("ANCHOR_DIR env var is not set");
    process.exit(1);
  }

  console.log(`Verifying project ${projectId}...`);

  // 1. Load events
  console.log("Loading events from DB...");
  const prismaEvents = await prisma.auditEvent.findMany({
    where: { projectId },
    orderBy: { sequence: "asc" },
  });

  const events = prismaEvents.map((e) => ({
    ...e,
    payload: JSON.parse(e.payloadJson),
  }));

  if (events.length === 0) {
    console.log("No events found for project.");
    // If there's an anchor, this is a failure (unless anchor is for seq 0, which we handled in verifyAgainstAnchor)
    // But let's see if anchor exists first.
  } else {
    console.log(`Loaded ${events.length} events.`);
  }

  // 2. Verify Chain Integrity (Existing logic)
  console.log("Verifying chain integrity...");
  try {
    verifyChain(events);
    console.log("✅ Chain integrity verified.");
  } catch (err) {
    console.error("❌ Chain integrity verification failed:", err);
    process.exit(1);
  }

  // 3. Verify Against Anchor
  console.log("Checking for anchor...");
  try {
    const anchor = readAnchor(projectId, anchorDir);
    console.log(
      `Found anchor for sequence ${anchor.lastSequence} (at ${new Date(
        anchor.anchoredAt
      ).toISOString()})`
    );

    verifyAgainstAnchor(events, anchor);
    console.log("✅ Anchor verification passed.");
  } catch (err: any) {
    // If file not found, we might warn or fail depending on strictness.
    // Requirement says "Integrate anchoring into verification flow (opt-in)".
    // If the script is explicitly "verify-with-anchor", missing anchor might be a failure or just a "no anchor found" message.
    // But `readAnchor` throws if file missing.
    // Let's assume if we run this script, we EXPECT an anchor.

    if (err.message && err.message.includes("Anchor file not found")) {
      console.warn("⚠️  No anchor file found. Skipping anchor verification.");
    } else {
      console.error("❌ Anchor verification failed:", err.message);
      process.exit(1);
    }
  }

  console.log("Verification complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
