import { prisma } from "../db/database.js";
import { hash, canonicalize } from "../core/hash.js";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ANCHOR_DIR = path.resolve("attack-anchors");
const PROJECT_ID = "attack-proof-proj";

async function runCommand(cmd: string, cwd?: string) {
  execSync(cmd, { stdio: "inherit", cwd });
}

async function setup() {
  console.log("🛠️  Setting up attack environment...");

  // 1. Clean up previous run
  if (fs.existsSync(ANCHOR_DIR)) {
    fs.rmSync(ANCHOR_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(ANCHOR_DIR);

  // Initialize Git in anchor dir
  await runCommand("git init", ANCHOR_DIR);
  await runCommand("git config user.name 'Attest Bot'", ANCHOR_DIR);
  await runCommand("git config user.email 'bot@attest.com'", ANCHOR_DIR);

  // Clean DB project
  await prisma.auditEvent.deleteMany({ where: { projectId: PROJECT_ID } });
  await prisma.chainHead.deleteMany({ where: { projectId: PROJECT_ID } });
  await prisma.project.deleteMany({ where: { id: PROJECT_ID } });

  // 2. Create Project
  await prisma.project.create({
    data: { id: PROJECT_ID, createdAt: Date.now() },
  });

  // 3. Create Events
  let lastHash = "";
  for (let i = 1; i <= 5; i++) {
    const payload = { action: "create", item: i, value: i * 100 };
    const payloadJson = JSON.stringify(payload);
    const payloadHash = hash(canonicalize(payload));
    const chainHash = hash(payloadHash + lastHash);

    await prisma.auditEvent.create({
      data: {
        projectId: PROJECT_ID,
        sequence: i,
        payloadJson,
        payloadHash,
        prevChainHash: lastHash,
        chainHash,
        createdAt: Date.now(),
      },
    });

    lastHash = chainHash;
  }

  // 4. Update Chain Head
  await prisma.chainHead.create({
    data: {
      projectId: PROJECT_ID,
      lastSequence: 5,
      lastChainHash: lastHash,
    },
  });

  console.log("✅ Project and events created.");

  // 5. Write Anchor
  const anchorPayload = {
    projectId: PROJECT_ID,
    lastSequence: 5,
    lastChainHash: lastHash,
    anchoredAt: Date.now(),
  };

  const anchorPath = path.join(ANCHOR_DIR, `project-${PROJECT_ID}.json`);
  fs.writeFileSync(anchorPath, JSON.stringify(anchorPayload, null, 2));

  // 6. Commit Anchor
  await runCommand("git add .", ANCHOR_DIR);
  await runCommand('git commit -m "Initial anchor"', ANCHOR_DIR);

  console.log(`✅ Anchor written and committed to ${ANCHOR_DIR}`);
}

setup()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
