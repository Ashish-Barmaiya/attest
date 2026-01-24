import "dotenv/config";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const ANCHOR_DIR = process.env.ANCHOR_DIR;
const GIT_REMOTE = process.env.ANCHOR_GIT_REMOTE;
const GIT_BRANCH = process.env.ANCHOR_GIT_BRANCH || "main";
const GIT_AUTHOR_NAME = process.env.ANCHOR_GIT_AUTHOR_NAME;
const GIT_AUTHOR_EMAIL = process.env.ANCHOR_GIT_AUTHOR_EMAIL;
const ATTEST_API_URL = process.env.ATTEST_API_URL;
const ATTEST_ADMIN_TOKEN = process.env.ATTEST_ADMIN_TOKEN;

if (!ANCHOR_DIR) {
  console.error("Error: ANCHOR_DIR environment variable is not set.");
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
    console.error(`Error: ANCHOR_DIR (${ANCHOR_DIR}) does not exist.`);
    console.error(`       Also checked: ${relativePath}`);
    process.exit(1);
  }
}

const gitDir = path.join(anchorDir, ".git");
if (!fs.existsSync(gitDir)) {
  console.error(
    `Error: ANCHOR_DIR (${ANCHOR_DIR}) is not a Git repository. Run 'git init' first.`,
  );
  process.exit(1);
}

if (!ATTEST_API_URL) {
  console.error("Error: ATTEST_API_URL environment variable is not set.");
  process.exit(1);
}

if (!ATTEST_ADMIN_TOKEN) {
  console.error("Error: ATTEST_ADMIN_TOKEN environment variable is not set.");
  process.exit(1);
}

async function fetchJson(path: string) {
  const url = `${ATTEST_API_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${ATTEST_ADMIN_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

async function reportAnchorResult(payload: {
  status: "success" | "failed";
  projectCount?: number;
  anchorFile?: string;
  gitCommit?: string;
  error?: string;
}) {
  try {
    const url = `${ATTEST_API_URL}/admin/anchor-report`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ATTEST_ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(
        `⚠️ Failed to report anchor result: ${res.status} ${res.statusText}`,
      );
    } else {
      console.log("✅ Anchor result reported to API.");
    }
  } catch (err) {
    console.error("⚠️ Failed to report anchor result:", err);
  }
}

async function runAnchor() {
  console.log(
    `[${new Date().toISOString()}] Starting anchoring process (PROD MODE)...`,
  );

  let previousAnchorCommit: string | null = null;
  try {
    // Get the current HEAD commit hash
    try {
      previousAnchorCommit = execSync("git rev-parse HEAD", {
        cwd: anchorDir,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch (e) {
      console.log("No previous commit found (repository might be empty).");
    }

    // 1. Fetch all projects
    console.log("Fetching projects...");
    const projects = (await fetchJson("/admin/projects")) as any[];
    console.log(`Found ${projects.length} projects.`);

    if (projects.length === 0) {
      console.log("No projects found. Exiting.");
      return;
    }

    // 2. Fetch chain head for each project
    const anchors = [];
    for (const project of projects) {
      try {
        const head = (await fetchJson(
          `/admin/projects/${project.projectId}/head`,
        )) as any;
        anchors.push({
          projectId: head.projectId,
          lastSequence: head.lastSequence,
          lastChainHash: head.lastChainHash,
        });
      } catch (err) {
        console.warn(
          `Failed to fetch head for project ${project.projectId}, skipping.`,
          err,
        );
      }
    }

    if (anchors.length === 0) {
      console.log("No valid project heads found. Exiting.");
      return;
    }

    // 3. Prepare Anchor Data
    const now = new Date();
    const timestamp = now.toISOString();
    const filename = `${now.toISOString().slice(0, 13).replace("T", "-")}.json`;
    const filePath = path.join(anchorDir!, filename);

    const anchorData = {
      mode: "prod",
      timestamp,
      anchorCommit: null as string | null,
      previousAnchorCommit,
      anchors,
    };

    // 4. Write Anchor File
    fs.writeFileSync(filePath, JSON.stringify(anchorData, null, 2));
    console.log(`Wrote anchor file: ${filePath}`);

    // 5. Git Operations
    console.log("Committing to Git...");

    if (GIT_AUTHOR_NAME) {
      execSync(`git config user.name "${GIT_AUTHOR_NAME}"`, {
        cwd: anchorDir,
      });
    }
    if (GIT_AUTHOR_EMAIL) {
      execSync(`git config user.email "${GIT_AUTHOR_EMAIL}"`, {
        cwd: anchorDir,
      });
    }

    execSync("git add .", { cwd: anchorDir, stdio: "inherit" });

    const commitMsg = `anchor: ${timestamp}`;
    execSync(`git commit -m "${commitMsg}"`, {
      cwd: anchorDir,
      stdio: "inherit",
    });

    const commitHash = execSync("git rev-parse HEAD", {
      cwd: anchorDir,
      encoding: "utf-8",
    }).trim();
    console.log(`✅ Git commit successful: ${commitHash}`);

    // Push to remote
    if (GIT_REMOTE) {
      console.log(`Pushing to remote ${GIT_REMOTE}/${GIT_BRANCH}...`);
      execSync(`git push ${GIT_REMOTE} ${GIT_BRANCH}`, {
        cwd: anchorDir,
        stdio: "inherit",
      });
      console.log("✅ Git push successful.");
    }

    console.log("✅ Anchoring completed successfully.");

    await reportAnchorResult({
      status: "success",
      projectCount: projects.length,
      anchorFile: filename,
      gitCommit: commitHash,
    });
  } catch (err: any) {
    console.error("❌ Anchoring failed:", err.message);

    await reportAnchorResult({
      status: "failed",
      error: err.message,
    });

    process.exit(1);
  }
}

runAnchor();
