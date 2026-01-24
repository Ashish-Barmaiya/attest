import { app } from "../src/http/server.js";
import { prisma } from "../src/db/database.js";
import { execSync, exec } from "child_process";
import util from "util";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Server } from "http";

const execAsync = util.promisify(exec);

const ANCHOR_DIR = path.resolve("temp-anchors-chaining");

// Ensure anchor dir exists
if (fs.existsSync(ANCHOR_DIR)) {
  fs.rmSync(ANCHOR_DIR, { recursive: true, force: true });
}
fs.mkdirSync(ANCHOR_DIR);

process.env.ANCHOR_DIR = ANCHOR_DIR;
process.env.ANCHOR_GIT_AUTHOR_NAME = "Test User";
process.env.ANCHOR_GIT_AUTHOR_EMAIL = "test@example.com";
process.env.ANCHOR_GIT_REMOTE = ""; // Disable push
process.env.ATTEST_ADMIN_TOKEN = "test-token";

let server: Server;
let port: number;

async function startServer() {
  return new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      // @ts-ignore
      port = server.address().port;
      process.env.ATTEST_API_URL = `http://localhost:${port}`;
      console.log(`Test server running on port ${port}`);
      resolve();
    });
  });
}

async function runCommand(cmd: string) {
  try {
    const { stdout, stderr } = await execAsync(cmd, { env: process.env });
    return { success: true, output: stdout + stderr };
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
      lastChainHash: "GENESIS",
    },
  });
}

async function testAnchorChaining() {
  console.log("Starting Anchor Chaining Tests (PROD MODE)...\n");

  await startServer();

  // Initialize git repo in ANCHOR_DIR
  execSync("git init", { cwd: ANCHOR_DIR });

  const projectId = `test-chain-${randomUUID()}`;
  await createProject(projectId);

  // 1. First Anchor Run
  console.log("Run 1: Initial Anchor");
  const res1 = await runCommand("npx tsx src/scripts/run-anchor-prod.ts");
  if (!res1.success) {
    console.error("Run 1 failed:", res1.output);
    process.exit(1);
  }

  // Verify DB record
  const run1 = await prisma.anchorReport.findFirst({
    orderBy: { time: "desc" },
  });
  if (!run1 || !run1.gitCommit) {
    console.error("Run 1: No anchor commit in DB");
    process.exit(1);
  }
  console.log(`Run 1 Commit: ${run1.gitCommit}`);

  // Verify File Content
  const file1 = fs.readFileSync(
    path.join(ANCHOR_DIR, run1.anchorFile!),
    "utf-8",
  );
  const json1 = JSON.parse(file1);
  if (
    json1.previousAnchorCommit !== null &&
    json1.previousAnchorCommit !== ""
  ) {
    console.warn(
      "Run 1: Expected previousAnchorCommit to be null, got " +
        json1.previousAnchorCommit,
    );
  }

  // 2. Second Anchor Run
  console.log("\nRun 2: Second Anchor (Should chain)");
  const res2 = await runCommand("npx tsx src/scripts/run-anchor-prod.ts");
  if (!res2.success) {
    console.error("Run 2 failed:", res2.output);
    process.exit(1);
  }

  const run2 = await prisma.anchorReport.findFirst({
    orderBy: { time: "desc" },
  });
  console.log(`Run 2 Commit: ${run2!.gitCommit}`);

  // Verify File Content
  const file2 = fs.readFileSync(
    path.join(ANCHOR_DIR, run2!.anchorFile!),
    "utf-8",
  );
  const json2 = JSON.parse(file2);
  if (json2.previousAnchorCommit !== run1.gitCommit) {
    console.error(
      `Run 2 File Failed: Previous commit mismatch. Expected ${run1.gitCommit}, got ${json2.previousAnchorCommit}`,
    );
    process.exit(1);
  }

  console.log("✔ Anchor chaining verified successfully.");

  // 3. Tamper Test (Rewriting History)
  console.log("\nTest 3: Tamper with Git History");
  // Reset git to run1
  execSync(`git reset --hard ${run1.gitCommit}`, { cwd: ANCHOR_DIR });
  const res3 = await runCommand("npx tsx src/scripts/run-anchor-prod.ts");
  if (!res3.success) {
    console.error("Run 3 failed:", res3.output);
    process.exit(1);
  }
  const run3 = await prisma.anchorReport.findFirst({
    orderBy: { time: "desc" },
  });

  // Check file content for run3 to verify it picked up the reset HEAD
  const file3 = fs.readFileSync(
    path.join(ANCHOR_DIR, run3!.anchorFile!),
    "utf-8",
  );
  const json3 = JSON.parse(file3);
  console.log(`Run 3 Previous (File): ${json3.previousAnchorCommit}`);

  if (json3.previousAnchorCommit !== run1.gitCommit) {
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
    if (server) server.close();
    await prisma.$disconnect();
    fs.rmSync(ANCHOR_DIR, { recursive: true, force: true });
  });
