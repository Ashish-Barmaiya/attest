import { prisma } from "../src/db/database.js";
import { exec } from "child_process";
import util from "util";
import fs from "fs";
import path from "path";
import { app } from "../src/http/app.js";
import http from "http";
import { randomUUID } from "node:crypto";

const execAsync = util.promisify(exec);

describe("Git Anchoring Integrations", () => {
  jest.setTimeout(30000);

  const PROJECT_ID = randomUUID();
  const ANCHOR_DIR = path.resolve("temp-jest-anchors");
  let server: http.Server;

  beforeAll(async () => {
    // 1. Start a real HTTP server on a dynamic port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        process.env.ATTEST_API_URL = `http://localhost:${port}`;
        resolve();
      });
    });

    process.env.ANCHOR_DIR = ANCHOR_DIR;
    process.env.ANCHOR_GIT_AUTHOR_NAME = "Jest Anchor";
    process.env.ANCHOR_GIT_AUTHOR_EMAIL = "jest@test.com";
    process.env.ANCHOR_GIT_REMOTE = "";
    process.env.ATTEST_ADMIN_TOKEN = "test-token";

    if (fs.existsSync(ANCHOR_DIR)) {
      fs.rmSync(ANCHOR_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(ANCHOR_DIR);
    await execAsync("git init", { cwd: ANCHOR_DIR });

    // 2. Setup the DB state (wipe everything)
    await prisma.anchorReport.deleteMany({});
    await prisma.project.deleteMany({ where: { id: PROJECT_ID } });

    await prisma.project.create({
      data: {
        id: PROJECT_ID,
        name: "Anchor Target",
        createdAt: BigInt(Date.now()),
      },
    });

    await prisma.chainHead.create({
      data: {
        projectId: PROJECT_ID,
        lastSequence: 0,
        lastChainHash: "GENESIS",
      },
    });
  });

  afterAll(async () => {
    // 3. Close the server socket to prevent open handle hangs
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    fs.rmSync(ANCHOR_DIR, { recursive: true, force: true });
    await prisma.anchorReport.deleteMany({});
    await prisma.project.deleteMany({ where: { id: PROJECT_ID } });
    await prisma.$disconnect();
  });

  it("MUST execute the anchor writer and chain commits correctly", async () => {
    // Write the first anchor asynchronously
    await execAsync("npx tsx src/scripts/run-anchor-prod.ts", {
      env: process.env,
    });

    const run1 = await prisma.anchorReport.findFirst({
      orderBy: { time: "desc" },
    });

    // If the script failed, run1 will be null, exposing the error.
    expect(run1).not.toBeNull();
    expect(run1).toBeDefined();
    expect(run1?.gitCommit).toBeDefined();

    const file1 = fs.readFileSync(
      path.join(ANCHOR_DIR, run1!.anchorFile!),
      "utf-8",
    );
    const json1 = JSON.parse(file1);
    expect(json1.previousAnchorCommit).toBeNull();

    // Write the second anchor asynchronously
    await execAsync("npx tsx src/scripts/run-anchor-prod.ts", {
      env: process.env,
    });

    const run2 = await prisma.anchorReport.findFirst({
      orderBy: { time: "desc" },
    });

    expect(run2).not.toBeNull();

    const file2 = fs.readFileSync(
      path.join(ANCHOR_DIR, run2!.anchorFile!),
      "utf-8",
    );
    const json2 = JSON.parse(file2);

    // The second anchor MUST point to the first anchor's commit
    expect(json2.previousAnchorCommit).toBe(run1!.gitCommit);
  });
});
