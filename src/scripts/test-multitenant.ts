import { prisma } from "../db/database.js";
import { appendEventPersistent } from "../db/appendPersistent.js";
import { loadAllEvents } from "../db/loadAll.js";
import { verifyChain } from "../core/verify.js";

const PROJECT_A = "project-a";
const PROJECT_B = "project-b";

async function resetDb() {
  console.log("Cleaning up database...");
  await prisma.auditEvent.deleteMany({
    where: { projectId: { in: [PROJECT_A, PROJECT_B] } },
  });
  await prisma.chainHead.deleteMany({
    where: { projectId: { in: [PROJECT_A, PROJECT_B] } },
  });

  // Initialize heads
  await prisma.chainHead.create({
    data: { projectId: PROJECT_A, lastSequence: 0, lastChainHash: "GENESIS_A" },
  });
  await prisma.chainHead.create({
    data: { projectId: PROJECT_B, lastSequence: 0, lastChainHash: "GENESIS_B" },
  });
}

async function runTest() {
  try {
    await resetDb();

    console.log("\n--- Phase 1: Interleaved Appends ---");

    console.log(`Appending to ${PROJECT_A}...`);
    await appendEventPersistent(PROJECT_A, {
      action: "login",
      actor: { type: "user", id: "alice" },
      resource: { type: "app", id: "dashboard" },
    });

    console.log(`Appending to ${PROJECT_B}...`);
    await appendEventPersistent(PROJECT_B, {
      action: "login",
      actor: { type: "user", id: "bob" },
      resource: { type: "app", id: "dashboard" },
    });

    console.log(`Appending to ${PROJECT_A}...`);
    await appendEventPersistent(PROJECT_A, {
      action: "logout",
      actor: { type: "user", id: "alice" },
      resource: { type: "app", id: "dashboard" },
    });

    console.log("\n--- Phase 2: Independent Verification ---");

    const eventsA = await loadAllEvents(PROJECT_A);
    console.log(`Loaded ${eventsA.length} events for ${PROJECT_A}`);
    try {
      verifyChain(eventsA);
      console.log(`${PROJECT_A} verification: PASS`);
    } catch (e) {
      console.log(`${PROJECT_A} verification: FAIL`, e);
    }

    const eventsB = await loadAllEvents(PROJECT_B);
    console.log(`Loaded ${eventsB.length} events for ${PROJECT_B}`);
    try {
      verifyChain(eventsB);
      console.log(`${PROJECT_B} verification: PASS`);
    } catch (e) {
      console.log(`${PROJECT_B} verification: FAIL`, e);
    }

    console.log("\n--- Phase 3: Cross-Tenant Attacks ---");

    // Attack 1: Load events for A using B's ID (should be empty or different)
    console.log("Attack 1: Leakage Check");
    const leakedEvents = await loadAllEvents(PROJECT_B);
    const leakedFromA = leakedEvents.find(
      (e) => e.payload.actor.id === "alice"
    );
    if (leakedFromA) {
      console.error(
        "CRITICAL FAILURE: Found Project A event in Project B load!"
      );
    } else {
      console.log("PASS: No cross-project leakage detected in load.");
    }

    // Attack 2: Append to A using B's head (Simulation)
    console.log("Attack 2: Sequence Collision Check");
    const seqA = eventsA.map((e) => e.sequence);
    const seqB = eventsB.map((e) => e.sequence);
    console.log(`${PROJECT_A} sequences:`, seqA);
    console.log(`${PROJECT_B} sequences:`, seqB);

    if (seqA.includes(1) && seqB.includes(1)) {
      console.log(
        "INFO: Both projects have sequence 1 (Expected behavior for isolation)."
      );
    } else {
      console.warn("WARNING: Sequences might be shared globally!");
    }

    // Attack 3: Append to non-existent project
    console.log("Attack 3: Append to invalid project");
    try {
      await appendEventPersistent("INVALID_PROJECT", {
        action: "hack",
        actor: { type: "hacker", id: "eve" },
        resource: { type: "system", id: "root" },
      });
      console.error("FAILURE: Appended to invalid project!");
    } catch (e) {
      console.log("PASS: Prevented append to invalid project.");
    }
  } catch (err) {
    console.error("Test failed with unexpected error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
