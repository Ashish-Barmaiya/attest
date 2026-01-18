import { prisma } from "../src/db/database.js";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { hash, canonicalize } from "../src/core/hash.js";

const ANCHOR_DIR = path.resolve("temp-anchors");

// Ensure anchor dir exists
if (!fs.existsSync(ANCHOR_DIR)) {
  fs.mkdirSync(ANCHOR_DIR);
}

process.env.ANCHOR_DIR = ANCHOR_DIR;

async function runCommand(cmd: string) {
  try {
    execSync(cmd, { stdio: "pipe", env: process.env });
    return { success: true, output: "" };
  } catch (e: any) {
    return {
      success: false,
      output:
        e.message +
        (e.stdout ? e.stdout.toString() : "") +
        (e.stderr ? e.stderr.toString() : ""),
    };
  }
}

async function createProject(projectId: string) {
  await prisma.project.create({
    data: {
      id: projectId,
      name: projectId,
      createdAt: Date.now(),
    },
  });

  // Initialize chain head
  await prisma.chainHead.create({
    data: {
      projectId,
      lastSequence: 0,
      lastChainHash: "",
    },
  });
}

async function addEvent(
  projectId: string,
  sequence: number,
  payload: any,
  prevChainHash: string
) {
  const payloadJson = JSON.stringify(payload);
  const payloadHash = hash(canonicalize(payload));
  const chainHash = hash(payloadHash + prevChainHash);

  await prisma.auditEvent.create({
    data: {
      projectId,
      sequence,
      payloadJson,
      payloadHash,
      prevChainHash,
      chainHash,
      createdAt: Date.now(),
    },
  });

  await prisma.chainHead.update({
    where: { projectId },
    data: {
      lastSequence: sequence,
      lastChainHash: chainHash,
    },
  });

  return chainHash;
}

async function testAnchoring() {
  console.log("Starting Adversarial Anchoring Tests...\n");

  const projectId = `test-anchor-${randomUUID()}`;
  console.log(`Creating project ${projectId}...`);
  await createProject(projectId);

  // 1. Create initial history
  console.log("Generating audit history...");
  let lastHash = "";
  for (let i = 1; i <= 5; i++) {
    lastHash = await addEvent(
      projectId,
      i,
      { action: "create", item: i },
      lastHash
    );
  }

  // 2. Write Anchor
  console.log("Writing anchor...");
  const writerRes = await runCommand("npx tsx src/scripts/anchor-writer.ts");
  if (!writerRes.success) {
    console.error("Failed to write anchor:", writerRes.output);
    process.exit(1);
  }

  // 3. Verify Valid Case
  console.log("Test 1: Valid chain + matching anchor -> SHOULD PASS");
  const verifyRes1 = await runCommand(
    `npx tsx src/scripts/verify-with-anchor.ts ${projectId}`
  );
  if (verifyRes1.success) {
    console.log("Passed");
  } else {
    console.error("Failed (Unexpected):", verifyRes1.output);
    process.exit(1);
  }

  // 4. Extend chain beyond anchor
  console.log("Test 2: Chain extended beyond anchor -> SHOULD PASS");
  await addEvent(projectId, 6, { action: "update", item: 6 }, lastHash);
  const verifyRes2 = await runCommand(
    `npx tsx src/scripts/verify-with-anchor.ts ${projectId}`
  );
  if (verifyRes2.success) {
    console.log("Passed");
  } else {
    console.error("Failed (Unexpected):", verifyRes2.output);
    process.exit(1);
  }

  // 5. Attack: Rollback (Delete recent events)
  console.log(
    "Test 3: DB Rollback (delete event 6) -> SHOULD FAIL (if anchor was at 6, but anchor is at 5)"
  );
  // Anchor is at 5. If it deletes 6, it is back to 5. This is actually VALID with respect to anchor at 5.
  // To test rollback failure, anchor needs to be at 6, then delete 6.

  // Update anchor to 6
  await runCommand("npx tsx src/scripts/anchor-writer.ts");

  // Now delete 6
  await prisma.auditEvent.delete({
    where: { projectId_sequence: { projectId, sequence: 6 } },
  });
  // Reset head to 5 to simulate clean rollback
  const event5 = await prisma.auditEvent.findUnique({
    where: { projectId_sequence: { projectId, sequence: 5 } },
  });
  await prisma.chainHead.update({
    where: { projectId },
    data: { lastSequence: 5, lastChainHash: event5!.chainHash },
  });

  const verifyRes3 = await runCommand(
    `npx tsx src/scripts/verify-with-anchor.ts ${projectId}`
  );
  if (
    !verifyRes3.success &&
    verifyRes3.output.includes(
      "History ends at sequence 5, but anchor requires 6"
    )
  ) {
    console.log("Passed (Detected rollback)");
  } else {
    console.error("Failed (Undetected or wrong error):", verifyRes3.output);
    process.exit(1);
  }

  // 6. Attack: Tamper before anchor
  console.log("Test 4: Payload tampering before anchor -> SHOULD FAIL");
  const p2 = `test-tamper-${randomUUID()}`;
  await createProject(p2);
  let h2 = "";
  for (let i = 1; i <= 3; i++) h2 = await addEvent(p2, i, { data: i }, h2);
  await runCommand("npx tsx src/scripts/anchor-writer.ts"); // Anchor at 3

  // Tamper with event 2
  await prisma.auditEvent.update({
    where: { projectId_sequence: { projectId: p2, sequence: 2 } },
    data: { payloadJson: JSON.stringify({ data: 999 }) }, // Hash mismatch
  });

  const verifyRes4 = await runCommand(
    `npx tsx src/scripts/verify-with-anchor.ts ${p2}`
  );
  if (
    !verifyRes4.success &&
    verifyRes4.output.includes("Payload hash mismatch")
  ) {
    console.log("Passed (Detected tampering via chain verify)");
  } else {
    console.error("Failed (Undetected):", verifyRes4.output);
    process.exit(1);
  }

  // 7. Attack: Chain Fork (Rewrite history to be valid internally, but mismatch anchor)
  console.log("Test 5: Chain fork (rewrite history) -> SHOULD FAIL");
  const p3 = `test-fork-${randomUUID()}`;
  await createProject(p3);
  let h3 = "";
  for (let i = 1; i <= 3; i++) h3 = await addEvent(p3, i, { data: i }, h3);
  await runCommand("npx tsx src/scripts/anchor-writer.ts"); // Anchor at 3

  // Rewrite event 3 completely (valid hash, but different content -> different chain hash)
  // Need to delete 3 and insert a new 3
  await prisma.auditEvent.delete({
    where: { projectId_sequence: { projectId: p3, sequence: 3 } },
  });

  // Get event 2 hash
  const e2 = await prisma.auditEvent.findUnique({
    where: { projectId_sequence: { projectId: p3, sequence: 2 } },
  });

  // Insert new 3
  const newPayload = { data: 999 };
  const newPayloadHash = hash(canonicalize(newPayload));
  const newChainHash = hash(newPayloadHash + e2!.chainHash);

  await prisma.auditEvent.create({
    data: {
      projectId: p3,
      sequence: 3,
      payloadJson: JSON.stringify(newPayload),
      payloadHash: newPayloadHash,
      prevChainHash: e2!.chainHash,
      chainHash: newChainHash,
      createdAt: Date.now(),
    },
  });

  // Update head
  await prisma.chainHead.update({
    where: { projectId: p3 },
    data: { lastChainHash: newChainHash },
  });

  const verifyRes5 = await runCommand(
    `npx tsx src/scripts/verify-with-anchor.ts ${p3}`
  );
  if (
    !verifyRes5.success &&
    verifyRes5.output.includes("Chain hash mismatch at sequence 3")
  ) {
    console.log("Passed (Detected fork vs anchor)");
  } else {
    console.error("Failed (Undetected):", verifyRes5.output);
    process.exit(1);
  }

  // 8. Attack: Truncation (Missing events)
  console.log("Test 6: Truncation (delete all events) -> SHOULD FAIL");
  const p4 = `test-trunc-${randomUUID()}`;
  await createProject(p4);
  let h4 = "";
  for (let i = 1; i <= 3; i++) h4 = await addEvent(p4, i, { data: i }, h4);
  await runCommand("npx tsx src/scripts/anchor-writer.ts"); // Anchor at 3

  // Delete all events
  await prisma.auditEvent.deleteMany({ where: { projectId: p4 } });

  const verifyRes6 = await runCommand(
    `npx tsx src/scripts/verify-with-anchor.ts ${p4}`
  );
  if (
    !verifyRes6.success &&
    (verifyRes6.output.includes("History is empty") ||
      verifyRes6.output.includes("Missing event"))
  ) {
    console.log("Passed (Detected truncation)");
  } else {
    console.error("Failed (Undetected):", verifyRes6.output);
    process.exit(1);
  }

  console.log("\nAll adversarial tests passed!");

  // Cleanup
  fs.rmSync(ANCHOR_DIR, { recursive: true, force: true });
}

testAnchoring()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
