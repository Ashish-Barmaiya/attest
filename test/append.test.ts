import request from "supertest";
import crypto from "node:crypto";
import { prisma } from "../src/db/database.js";
import { app } from "../src/http/app.js";

describe("Append Event Tests", () => {
  const testProjectId = "append-test-project";
  let validKey: string;

  beforeAll(async () => {
    // 1. Clean slate
    await prisma.project.deleteMany({
      where: { id: testProjectId },
    });

    // 2. Setup parent project
    await prisma.project.create({
      data: {
        id: testProjectId,
        name: "Append Test",
        createdAt: BigInt(Date.now()),
      },
    });

    // 3. Initialize the chain head for this project
    await prisma.chainHead.create({
      data: {
        projectId: testProjectId,
        lastSequence: 0,
        lastChainHash: "GENESIS",
      },
    });

    // 4. Create a valid API key to pass the auth middleware
    validKey = crypto.randomBytes(32).toString("hex");
    const keyHash = crypto.createHash("sha256").update(validKey).digest("hex");
    await prisma.apiKey.create({
      data: {
        keyHash,
        projectId: testProjectId,
        createdAt: BigInt(Date.now()),
      },
    });
  });

  afterAll(async () => {
    // Cleanup cascades and wipes the head, key, and events automatically
    await prisma.project.deleteMany({
      where: { id: testProjectId },
    });
    await prisma.$disconnect();
  });

  it("should successfully append an event and persist it in the database", async () => {
    const payload = {
      action: "LOGIN",
      actor: { type: "user", id: "test-user-123" },
      resource: { type: "system", id: "auth-service" },
      metadata: { timestamp: Date.now() },
    };

    // Make the request using supertest and the valid API key
    const res = await request(app)
      .post("/events")
      .set("x-api-key", validKey)
      .send(payload);

    // Assert HTTP success
    expect(res.status).toBe(201);
    expect(typeof res.body.sequence).toBe("number");
    expect(typeof res.body.chainHash).toBe("string");

    // Assert Database State
    const eventInDb = await prisma.auditEvent.findUnique({
      where: {
        projectId_sequence: {
          projectId: testProjectId,
          sequence: res.body.sequence,
        },
      },
    });

    expect(eventInDb).not.toBeNull();
    expect(eventInDb?.projectId).toBe(testProjectId);
    expect(eventInDb?.sequence).toBe(res.body.sequence);
    expect(eventInDb?.chainHash).toBe(res.body.chainHash);

    // Ensure the payload was actually stored
    const storedPayload = JSON.parse(eventInDb!.payloadJson);
    expect(storedPayload.action).toBe("LOGIN");
    expect(storedPayload.actor.id).toBe("test-user-123");
  });
});
