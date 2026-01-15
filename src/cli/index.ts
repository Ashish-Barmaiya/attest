#!/usr/bin/env node
import "dotenv/config";
import { verifyChain } from "../core/verify.js";
import { readAnchor } from "../core/anchor-reader.js";
import { verifyAgainstAnchor } from "../core/verify-anchor.js";
import fs from "fs";
import path from "path";

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

      case "verify":
        const projectId = args[1];
        const anchorFlagIndex = args.indexOf("--anchors");
        const anchorPath =
          anchorFlagIndex !== -1 ? args[anchorFlagIndex + 1] : null;

        if (!projectId) throw new Error("Project ID is required");
        if (!anchorPath) throw new Error("--anchors <path> is required");

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

async function verifyProject(projectId: string, anchorDir: string) {
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
  console.log("Verifying chain integrity...");
  try {
    verifyChain(events);
    console.log("Chain integrity verified.");
  } catch (err) {
    console.error("Chain integrity verification failed:", err);
    process.exit(1);
  }

  // 3. Verify Against Anchor
  console.log("Checking for anchor...");
  try {
    const anchor = readAnchor(projectId, anchorDir);
    console.log(
      `Found anchor for sequence ${anchor.lastSequence} (at ${new Date(
        anchor.anchoredAt
      ).toISOString()})`
    );

    verifyAgainstAnchor(events, anchor);
    console.log("Anchor verification passed.");
  } catch (err: any) {
    if (err.message && err.message.includes("Anchor file not found")) {
      console.warn("No anchor file found. Skipping anchor verification.");
    } else {
      console.error("Anchor verification failed:", err.message);
      process.exit(1);
    }
  }
}

function printHelp() {
  console.log(`
Usage: attest <command> <subcommand> [args]

Commands:
  project create <name>
  project list
  key create <projectId>
  key revoke <keyId>
  verify <projectId> --anchors <path>
`);
}

main();
