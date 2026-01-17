import { prisma } from "../db/database.js";
import { verifyChain } from "../core/verify.js";
import { readAnchor } from "../core/anchor-reader.js";
import { verifyAgainstAnchor } from "../core/verify-anchor.js";
import path from "path";

const PROJECT_ID = "attack-proof-proj";
const ANCHOR_DIR = path.resolve("attack-anchors");

async function verifyAttack() {
  console.log("Verifying Attack Results...");

  // 1. Load events
  const prismaEvents = await prisma.auditEvent.findMany({
    where: { projectId: PROJECT_ID },
    orderBy: { sequence: "asc" },
  });

  const events = prismaEvents.map((e) => ({
    ...e,
    payload: JSON.parse(e.payloadJson),
  }));

  console.log(`Loaded ${events.length} events.`);

  // 2. Internal Verification (Should PASS)
  console.log("Step 1: Internal Chain Verification");
  try {
    verifyChain(events);
    console.log("PASS: Internal chain is valid (Attack successful locally).");
  } catch (err) {
    console.error(
      "FAIL: Internal chain is broken. Attack script failed to rewrite correctly."
    );
    console.error(err);
    process.exit(1);
  }

  // 3. Anchor Verification (Should FAIL)
  console.log("Step 2: External Anchor Verification");
  try {
    const anchor = readAnchor(PROJECT_ID, ANCHOR_DIR);
    console.log(`Loaded anchor for sequence ${anchor.lastSequence}`);

    verifyAgainstAnchor(events, anchor);

    console.error("FAIL: Anchor verification passed! Attack was NOT detected.");
    process.exit(1);
  } catch (err: any) {
    if (err.message.includes("Chain hash mismatch")) {
      console.log("PASS: Anchor verification failed as expected.");
      console.log(`   Reason: ${err.message}`);
    } else {
      console.log(
        "PASS? Anchor verification failed, but maybe for wrong reason?"
      );
      console.log(`   Error: ${err.message}`);
    }
  }
}

verifyAttack()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
