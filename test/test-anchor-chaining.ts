import { prisma } from "../src/db/database.js";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const ANCHOR_DIR = path.resolve("temp-anchors-chaining");

// Ensure anchor dir exists
if (fs.existsSync(ANCHOR_DIR)) {
  fs.rmSync(ANCHOR_DIR, { recursive: true, force: true });
}
fs.mkdirSync(ANCHOR_DIR);

process.env.ANCHOR_DIR = ANCHOR_DIR;
// Mock git env vars
process.env.ANCHOR_GIT_AUTHOR_NAME = "Test User";
process.env.ANCHOR_GIT_AUTHOR_EMAIL = "test@example.com";

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

  await prisma.chainHead.create({
    data: {
      projectId,
      lastSequence: 0,
      lastChainHash: "",
    },
  });
}

async function testAnchorChaining() {
  console.log("Starting Anchor Chaining Tests...\n");

  // Initialize git repo in ANCHOR_DIR
  execSync("git init", { cwd: ANCHOR_DIR });

  const projectId = `test-chain-${randomUUID()}`;
  await createProject(projectId);

  // 1. First Anchor Run
  console.log("Run 1: Initial Anchor");
  const res1 = await runCommand("npx tsx src/scripts/run-anchor.ts");
  if (!res1.success) {
    console.error("Run 1 failed:", res1.output);
    process.exit(1);
  }

  // Verify DB record
  const run1 = await prisma.anchorRun.findFirst({
    orderBy: { startedAt: "desc" },
  });
  if (!run1 || !run1.anchorCommit) {
    console.error("Run 1: No anchor commit in DB");
    process.exit(1);
  }
  console.log(`Run 1 Commit: ${run1.anchorCommit}`);
  console.log(`Run 1 Previous: ${run1.previousAnchorCommit}`); // Should be null or empty

  // Verify File Content
  const file1 = fs.readFileSync(
    path.join(ANCHOR_DIR, run1.anchorFile!),
    "utf-8"
  );
  const json1 = JSON.parse(file1);
  if (
    json1.previousAnchorCommit !== null &&
    json1.previousAnchorCommit !== ""
  ) {
    if (run1.previousAnchorCommit !== null) {
      console.warn(
        "Run 1: Expected previousAnchorCommit to be null, got " +
          run1.previousAnchorCommit
      );
    }
  }

  // 2. Second Anchor Run
  console.log("\nRun 2: Second Anchor (Should chain)");
  const res2 = await runCommand("npx tsx src/scripts/run-anchor.ts");
  if (!res2.success) {
    console.error("Run 2 failed:", res2.output);
    process.exit(1);
  }

  const run2 = await prisma.anchorRun.findFirst({
    orderBy: { startedAt: "desc" },
  });
  console.log(`Run 2 Commit: ${run2!.anchorCommit}`);
  console.log(`Run 2 Previous: ${run2!.previousAnchorCommit}`);

  if (run2!.previousAnchorCommit !== run1.anchorCommit) {
    console.error(
      `Run 2 Failed: Previous commit mismatch. Expected ${
        run1.anchorCommit
      }, got ${run2!.previousAnchorCommit}`
    );
    process.exit(1);
  }

  // Verify File Content
  const file2 = fs.readFileSync(
    path.join(ANCHOR_DIR, run2!.anchorFile!),
    "utf-8"
  );
  const json2 = JSON.parse(file2);
  if (json2.previousAnchorCommit !== run1.anchorCommit) {
    console.error(
      `Run 2 File Failed: Previous commit mismatch. Expected ${run1.anchorCommit}, got ${json2.previousAnchorCommit}`
    );
    process.exit(1);
  }

  console.log("✔ Anchor chaining verified successfully.");

  // 3. Tamper Test (Rewriting History)
  console.log("\nTest 3: Tamper with Git History");
  // Reset git to run1
  execSync(`git reset --hard ${run1.anchorCommit}`, { cwd: ANCHOR_DIR });
  const res3 = await runCommand("npx tsx src/scripts/run-anchor.ts");
  if (!res3.success) {
    console.error("Run 3 failed:", res3.output);
    process.exit(1);
  }
  const run3 = await prisma.anchorRun.findFirst({
    orderBy: { startedAt: "desc" },
  });
  console.log(`Run 3 Previous: ${run3!.previousAnchorCommit}`);
  if (run3!.previousAnchorCommit !== run1.anchorCommit) {
    console.error("Run 3: Expected parent to be Run 1");
    process.exit(1);
  }
  console.log("✔ Detected correct HEAD after reset.");

  console.log("\nAll tests passed!");
}

testAnchorChaining()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    fs.rmSync(ANCHOR_DIR, { recursive: true, force: true });
  });
