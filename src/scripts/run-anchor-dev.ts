import "dotenv/config";
import { prisma } from "../db/database.js";
import fs from "fs";
import path from "path";

const ANCHOR_DIR = process.env.ANCHOR_DIR;

if (!ANCHOR_DIR) {
  console.error("❌ ANCHOR_DIR environment variable is not set.");
  process.exit(1);
}

let anchorDir = ANCHOR_DIR;

if (!fs.existsSync(anchorDir)) {
  // Resolve relative to CWD if the absolute path doesn't exist
  // This handles the case where ANCHOR_DIR=/anchors (for Docker) but we are running locally
  const relativePath = path.join(
    process.cwd(),
    ANCHOR_DIR.replace(/^[/\\]/, ""),
  );
  if (fs.existsSync(relativePath)) {
    anchorDir = relativePath;
  } else {
    console.error(`❌ ANCHOR_DIR does not exist: ${ANCHOR_DIR}`);
    console.error(`   Also checked: ${relativePath}`);
    process.exit(1);
  }
}

async function runAnchor() {
  console.log(`[${new Date().toISOString()}] Starting anchoring (DEV MODE)`);
  console.warn("⚠️  DEV MODE: Anchors are NOT tamper-proof");

  const run = await prisma.anchorRun.create({
    data: {
      startedAt: new Date(),
      status: "running",
    },
  });

  try {
    const heads = await prisma.chainHead.findMany();

    if (heads.length === 0) {
      console.log("No projects found.");

      await prisma.anchorRun.update({
        where: { id: run.id },
        data: {
          status: "success",
          finishedAt: new Date(),
          projectCount: 0,
        },
      });

      return;
    }

    const timestamp = new Date().toISOString();
    const filename = `${timestamp.slice(0, 13).replace("T", "-")}.json`;
    const filePath = path.join(anchorDir, filename);

    const anchor = {
      mode: "dev",
      timestamp: timestamp,
      anchors: heads.map((h) => ({
        projectId: h.projectId,
        lastSequence: h.lastSequence,
        lastChainHash: h.lastChainHash,
      })),
    };

    fs.writeFileSync(filePath, JSON.stringify(anchor, null, 2));

    console.log(`✅ Anchor written: ${filePath}`);

    await prisma.anchorRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        projectCount: heads.length,
        anchorFile: filename,
      },
    });

    console.log("✅ Dev anchoring completed");
  } catch (err: any) {
    console.error("❌ Anchoring failed:", err.message);

    await prisma.anchorRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: err.message,
      },
    });

    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runAnchor();
