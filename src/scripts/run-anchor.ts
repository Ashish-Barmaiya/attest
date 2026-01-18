import { prisma } from "../db/database.js";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const ANCHOR_DIR = process.env.ANCHOR_DIR;
const GIT_REMOTE = process.env.ANCHOR_GIT_REMOTE;
const GIT_BRANCH = process.env.ANCHOR_GIT_BRANCH || "main";
const GIT_AUTHOR_NAME = process.env.ANCHOR_GIT_AUTHOR_NAME;
const GIT_AUTHOR_EMAIL = process.env.ANCHOR_GIT_AUTHOR_EMAIL;

if (!ANCHOR_DIR) {
  console.error("Error: ANCHOR_DIR environment variable is not set.");
  process.exit(1);
}

if (!fs.existsSync(ANCHOR_DIR)) {
  console.error(`Error: ANCHOR_DIR (${ANCHOR_DIR}) does not exist.`);
  process.exit(1);
}

async function runAnchor() {
  console.log(`[${new Date().toISOString()}] Starting anchoring process...`);

  // 1. Create AnchorRun record
  const run = await prisma.anchorRun.create({
    data: {
      startedAt: new Date(),
      status: "running",
    },
  });

  let previousAnchorCommit: string | null = null;
  try {
    // Try to get the current HEAD commit hash
    try {
      previousAnchorCommit = execSync("git rev-parse HEAD", {
        cwd: ANCHOR_DIR,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"], // Ignore stderr to avoid noise if no commits yet
      }).trim();
    } catch (e) {
      // It's possible there are no commits yet (empty repo)
      console.log("No previous commit found (repository might be empty).");
    }
    // 2. Load all chain heads
    const heads = await prisma.chainHead.findMany();
    console.log(`Found ${heads.length} projects to anchor.`);

    if (heads.length === 0) {
      console.log("No projects found. Exiting.");
      await prisma.anchorRun.update({
        where: { id: run.id },
        data: {
          status: "success",
          finishedAt: new Date(),
          projectCount: 0,
          error: "No projects to anchor",
        },
      });
      return;
    }

    // 3. Prepare Anchor Data
    const now = new Date();
    const timestamp = now.toISOString();
    const filename = `${now.toISOString().slice(0, 13).replace("T", "-")}.json`; // YYYY-MM-DD-HH.json
    const filePath = path.join(ANCHOR_DIR!, filename);

    const anchorData = {
      timestamp,
      anchorCommit: null, // Placeholder, actual commit hash is generated after this file is committed
      previousAnchorCommit,
      anchors: heads.map((h) => ({
        projectId: h.projectId,
        lastSequence: h.lastSequence,
        lastChainHash: h.lastChainHash,
      })),
    };

    // 4. Write Anchor File
    fs.writeFileSync(filePath, JSON.stringify(anchorData, null, 2));
    console.log(`Wrote anchor file: ${filePath}`);

    // 5. Git Operations
    console.log("Committing to Git...");

    // Configure git user if provided
    if (GIT_AUTHOR_NAME) {
      execSync(`git config user.name "${GIT_AUTHOR_NAME}"`, {
        cwd: ANCHOR_DIR,
      });
    }
    if (GIT_AUTHOR_EMAIL) {
      execSync(`git config user.email "${GIT_AUTHOR_EMAIL}"`, {
        cwd: ANCHOR_DIR,
      });
    }

    execSync("git add .", { cwd: ANCHOR_DIR, stdio: "inherit" });

    const commitMsg = `anchor: ${timestamp}`;
    execSync(`git commit -m "${commitMsg}"`, {
      cwd: ANCHOR_DIR,
      stdio: "inherit",
    });

    // Get commit hash
    const commitHash = execSync("git rev-parse HEAD", {
      cwd: ANCHOR_DIR,
      encoding: "utf-8",
    }).trim();
    console.log(`Git commit successful: ${commitHash}`);

    // Push to remote if configured
    if (GIT_REMOTE) {
      console.log(`Pushing to remote ${GIT_REMOTE}/${GIT_BRANCH}...`);
      execSync(`git push ${GIT_REMOTE} ${GIT_BRANCH}`, {
        cwd: ANCHOR_DIR,
        stdio: "inherit",
      });
      console.log("Git push successful.");
    }

    // 6. Update AnchorRun (Success)
    await prisma.anchorRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        projectCount: heads.length,
        anchorFile: filename,
        gitCommit: commitHash,
        anchorCommit: commitHash,
        previousAnchorCommit: previousAnchorCommit,
      },
    });

    console.log("Anchoring completed successfully.");
  } catch (err: any) {
    console.error("Anchoring failed:", err.message);

    // 7. Update AnchorRun (Failure)
    await prisma.anchorRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: err.message,
      },
    });
  } finally {
    await prisma.$disconnect();
    process.exit(1);
  }
}

runAnchor();
