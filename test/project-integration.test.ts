import request from "supertest";
import express from "express";
import { prisma } from "../src/db/database.js";
import { adminRouter } from "../src/http/admin.js";

const app = express();
app.use(express.json());
app.use("/admin", adminRouter);

describe("POST /admin/projects - Atomicity & Rollback", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.project.deleteMany({});
    // CRITICAL: Prevent mocks from bleeding into Test 2
    jest.clearAllMocks();
  });

  it("MUST rollback the project creation if chain_head creation fails", async () => {
    const testProjectName = "Rollback-Integration-Test";

    // 1. Sabotage the transaction itself.
    // Mock $transaction to throw, simulating a failure during the atomic operation.
    jest
      .spyOn(prisma, "$transaction")
      .mockRejectedValueOnce(
        new Error("Simulated database crash mid-transaction"),
      );

    // 2. Hit the endpoint
    const response = await request(app)
      .post("/admin/projects")
      .send({ name: testProjectName });

    // 3. Assert the API handled the crash gracefully
    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty("error", "Failed to create project");

    // 4. Assert the database rolled back the project creation natively.
    const projectInDb = await prisma.project.findFirst({
      where: { name: testProjectName },
    });

    // Because the transaction engine actually ran, this must be null.
    expect(projectInDb).toBeNull();
  });

  it("should successfully create a project and chain_head in normal conditions", async () => {
    const testProjectName = "Success-Integration-Test";

    const response = await request(app)
      .post("/admin/projects")
      .send({ name: testProjectName });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty("projectId");

    const projectInDb = await prisma.project.findFirst({
      where: { name: testProjectName },
    });

    expect(projectInDb).not.toBeNull();
    expect(projectInDb?.name).toBe(testProjectName);

    const chainHeadInDb = await prisma.chainHead.findFirst({
      where: { projectId: projectInDb!.id },
    });

    expect(chainHeadInDb).not.toBeNull();
  });
});
