import request from "supertest";
import crypto from "node:crypto";
import { prisma } from "../src/db/database.js";
import { app } from "../src/http/app.js";

describe("Adversarial Auth Tests", () => {
  const projectA = "auth-test-a";
  const projectB = "auth-test-b";
  let keyA: string;
  let keyB: string;

  // --- Helper Functions ---
  async function createKey(projectId: string): Promise<string> {
    const key = crypto.randomBytes(32).toString("hex");
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");
    await prisma.apiKey.create({
      data: { keyHash, projectId, createdAt: BigInt(Date.now()) },
    });
    return key;
  }

  async function revokeKey(key: string) {
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");
    await prisma.apiKey.update({
      where: { keyHash },
      data: { revokedAt: BigInt(Date.now()) },
    });
  }

  // --- Lifecycle Hooks ---
  beforeAll(async () => {
    // 1. Clean up potential old state
    await prisma.project.deleteMany({
      where: { id: { in: [projectA, projectB] } },
    });

    // 2. Setup Projects
    await prisma.project.createMany({
      data: [
        { id: projectA, name: "Project A", createdAt: BigInt(Date.now()) },
        { id: projectB, name: "Project B", createdAt: BigInt(Date.now()) },
      ],
    });

    // 3. Initialize Heads
    await prisma.chainHead.createMany({
      data: [
        { projectId: projectA, lastSequence: 0, lastChainHash: "GENESIS_A" },
        { projectId: projectB, lastSequence: 0, lastChainHash: "GENESIS_B" },
      ],
    });

    keyA = await createKey(projectA);
    keyB = await createKey(projectB);
  });

  afterAll(async () => {
    // Cascading delete - wiping the projects wipes the keys and heads
    await prisma.project.deleteMany({
      where: { id: { in: [projectA, projectB] } },
    });
    await prisma.$disconnect();
  });

  // --- The Tests ---

  it("Test 1: Valid Key Access - should allow append with a valid key", async () => {
    const response = await request(app)
      .post("/events")
      .set("x-api-key", keyA)
      .send({
        action: "login",
        actor: { type: "user", id: "alice" },
        resource: { type: "app", id: "web" },
      });

    expect(response.status).toBe(201);
  });

  it("Test 2: Invalid Key Rejection - should return 401 for a bad key", async () => {
    const response = await request(app)
      .post("/events")
      .set("x-api-key", "invalid-key-123")
      .send({
        action: "login",
        actor: { type: "user", id: "alice" },
        resource: { type: "app", id: "web" },
      });

    expect(response.status).toBe(401);
  });

  it("Test 3: Revoked Key Rejection - should return 401 for a revoked key", async () => {
    const keyRevoked = await createKey(projectA);
    await revokeKey(keyRevoked);

    const response = await request(app)
      .post("/events")
      .set("x-api-key", keyRevoked)
      .send({
        action: "login",
        actor: { type: "user", id: "alice" },
        resource: { type: "app", id: "web" },
      });

    expect(response.status).toBe(401);
  });

  it("Test 4: Missing Key Rejection - should return 401 when no key is provided", async () => {
    const response = await request(app)
      .post("/events")
      .send({
        action: "login",
        actor: { type: "user", id: "alice" },
        resource: { type: "app", id: "web" },
      });

    expect(response.status).toBe(401);
  });

  it("Test 5: Project Isolation - Key A should only advance Project A", async () => {
    const headA = await request(app).get("/head").set("x-api-key", keyA);
    const headB = await request(app).get("/head").set("x-api-key", keyB);

    expect(headA.status).toBe(200);
    expect(headB.status).toBe(200);

    // Key A appended an event in Test 1, so its sequence should be 1
    expect(headA.body.lastSequence).toBe(1);
    // Key B has not appended anything, so its sequence remains 0
    expect(headB.body.lastSequence).toBe(0);
  });

  it("Test 6: Verify Key Scope - /verify should return the correct project bounds", async () => {
    const verifyA = await request(app).get("/verify").set("x-api-key", keyA);

    expect(verifyA.status).toBe(200);
    expect(verifyA.body.isValid).toBe(true);
    expect(verifyA.body.projectId).toBe(projectA);
  });

  it("Test 7: Malformed Key Rejection - should return 401 for structurally invalid keys", async () => {
    const response = await request(app)
      .post("/events")
      .set("x-api-key", "short-key")
      .send({
        action: "login",
        actor: { type: "user", id: "alice" },
        resource: { type: "app", id: "web" },
      });

    expect(response.status).toBe(401);
  });
});
