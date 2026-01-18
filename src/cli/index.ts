#!/usr/bin/env node
import "dotenv/config";
import { verifyChain } from "../core/verify.js";
import { readAnchor } from "../core/anchor-reader.js";
import { verifyAgainstAnchor } from "../core/verify-anchor.js";

const ADMIN_TOKEN = process.env.ATTEST_ADMIN_TOKEN;
const API_URL = process.env.ATTEST_API_URL || "http://localhost:3000";

if (!ADMIN_TOKEN) {
  console.error("Error: ATTEST_ADMIN_TOKEN environment variable is required.");
  process.exit(1);
}

async function request(path: string, options: RequestInit = {}) {
  const url = `${API_URL}/admin${path}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });

  if (res.status === 204) return null;

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Unknown error");
  }

  return data;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];

  if (!command) {
    printHelp();
    return;
  }

  try {
    switch (command) {
      case "project":
        if (subcommand === "create") {
          const name = args[2];
          if (!name) throw new Error("Name is required");
          const project = await request("/projects", {
            method: "POST",
            body: JSON.stringify({ name }),
          });
          console.log(JSON.stringify(project, null, 2));
        } else if (subcommand === "list") {
          const projects = await request("/projects");
          console.log(JSON.stringify(projects, null, 2));
        } else if (subcommand === "tombstone") {
          const projectId = args[2];
          const confirmFlag = args[3];
          if (!projectId) throw new Error("Project ID is required");

          if (confirmFlag !== "--confirm") {
            console.warn(
              "WARNING: This action is irreversible. The project will be permanently closed."
            );
            console.warn(
              `To proceed, run: attest project tombstone ${projectId} --confirm`
            );
            process.exit(1);
          }

          const result = await request(`/projects/${projectId}/tombstone`, {
            method: "POST",
          });
          console.log(JSON.stringify(result, null, 2));
        } else {
          printHelp();
        }
        break;

      case "key":
        if (subcommand === "create") {
          const projectId = args[2];
          if (!projectId) throw new Error("Project ID is required");
          const key = await request(`/projects/${projectId}/keys`, {
            method: "POST",
          });
          console.log(JSON.stringify(key, null, 2));
        } else if (subcommand === "rotate") {
          const projectId = args[2];
          if (!projectId) throw new Error("Project ID is required");

          const key = await request(`/projects/${projectId}/keys`, {
            method: "POST",
          });

          const output = {
            ...key,
            note: "Deploy this key before revoking old keys",
          };
          console.log(JSON.stringify(output, null, 2));
        } else if (subcommand === "revoke") {
          const keyId = args[2];
          if (!keyId) throw new Error("Key ID is required");
          await request(`/keys/${keyId}`, {
            method: "DELETE",
          });
          console.log("Key revoked successfully.");
        } else {
          printHelp();
        }
        break;

      case "anchor":
        if (subcommand === "logs") {
          const limit = args[2] ? parseInt(args[2]) : 20;
          const logs = await request(`/anchor/logs?limit=${limit}`);
          printAnchorLogs(logs);
        } else {
          printHelp();
        }
        break;

      case "verify":
        const projectId = args[1];
        // Support optional --anchors flag, but it's not strictly required if we just want internal verification?
        // Requirement says "Unified Verification Command".
        // "Load latest anchor" -> implies we need to know WHERE anchors are.
        // So --anchors is still needed unless we fetch it from somewhere else?
        // The requirement says: "attest verify <projectId>"
        // It doesn't mention --anchors flag in the requirement example "attest verify <projectId>".
        // BUT, the anchor is external. The CLI needs to know where it is.
        // Unless... the CLI fetches the anchor from the remote git repo directly?
        // "Load latest anchor" -> "Verify anchor hash".
        // If the user runs this locally, they might have the anchor repo cloned.
        // Let's keep --anchors flag for now as it's the safest way to find the file.
        // Or maybe we can default to ANCHOR_DIR env var?

        const anchorFlagIndex = args.indexOf("--anchors");
        const anchorPath =
          anchorFlagIndex !== -1
            ? args[anchorFlagIndex + 1]
            : process.env.ANCHOR_DIR;

        if (!projectId) throw new Error("Project ID is required");

        await verifyProject(projectId, anchorPath);
        break;

      default:
        printHelp();
    }
  } catch (err: any) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

function printAnchorLogs(logs: any[]) {
  console.log(
    "TIME".padEnd(25) +
      "STATUS".padEnd(10) +
      "PROJECTS".padEnd(10) +
      "COMMIT".padEnd(15) +
      "ERROR"
  );
  logs.forEach((log) => {
    const time = new Date(log.startedAt)
      .toISOString()
      .slice(0, 16)
      .replace("T", " ");
    const status = log.status;
    const projects = log.projectCount !== null ? String(log.projectCount) : "-";
    const commit = log.gitCommit ? log.gitCommit.slice(0, 7) : "";
    const error = log.error ? log.error.slice(0, 30) : "";

    console.log(
      time.padEnd(25) +
        status.padEnd(10) +
        projects.padEnd(10) +
        commit.padEnd(15) +
        error
    );
  });
}

async function verifyProject(projectId: string, anchorDir: string | undefined) {
  console.log(`Verifying project ${projectId}...`);

  // 1. Fetch events from server
  console.log("Fetching events from server...");
  const eventsRaw = await request(`/projects/${projectId}/events`);

  // Parse payloadJson
  const events = eventsRaw.map((e: any) => ({
    ...e,
    payload: JSON.parse(e.payloadJson),
  }));

  console.log(`Loaded ${events.length} events.`);

  // 2. Verify Chain Integrity
  process.stdout.write("Verifying internal chain integrity... ");
  try {
    verifyChain(events);
    console.log("✔ Internal chain valid");
  } catch (err) {
    console.log("✖ Failed");
    console.error("Chain integrity verification failed:", err);
    process.exit(1);
  }

  // 3. Verify Against Anchor
  if (anchorDir) {
    process.stdout.write("Verifying against anchor... ");
    try {
      const anchor = readAnchor(projectId, anchorDir);
      verifyAgainstAnchor(events, anchor);
      console.log(
        `✔ Anchor verified (${new Date(anchor.anchoredAt).toISOString()})`
      );
      console.log("✔ No tampering detected");
      console.log(`\nEvents verified: ${events.length}`);
      console.log(`Last anchor: ${new Date(anchor.anchoredAt).toISOString()}`);
    } catch (err: any) {
      console.log("✖ Failed");
      if (err.message && err.message.includes("Anchor file not found")) {
        console.warn(
          "No anchor file found in provided directory. Skipping anchor verification."
        );
      } else {
        console.error("Anchor verification failed:", err.message);
        process.exit(1);
      }
    }
  } else {
    console.warn(
      "No anchor directory provided (use --anchors or ANCHOR_DIR). Skipping anchor verification."
    );
  }
}

function printHelp() {
  console.log(`
Usage: attest <command> <subcommand> [args]

Commands:
  project create <name>
  project list
  project tombstone <projectId> [--confirm]
  key create <projectId>
  key rotate <projectId>
  key revoke <keyId>
  anchor logs [limit]
  verify <projectId> [--anchors <path>]
`);
}

main();
