import request from "supertest";
import { app } from "../src/http/app.js";
import { prisma } from "../src/db/database.js";

describe("Admin Control Plane & Lifecycle", () => {
  const ADMIN_TOKEN = "dev-admin-token";
  let projectId: string;
  let key1Id: string;
  let key1Hash: string;
  let key2Hash: string;

  beforeAll(async () => {
    process.env.ATTEST_ADMIN_TOKEN = ADMIN_TOKEN;
    await prisma.project.deleteMany({ where: { name: "cp-test-project" } });
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { name: "cp-test-project" } });
    await prisma.$disconnect();
  });

  it("MUST reject unauthorized admin access", async () => {
    const res = await request(app)
      .post("/admin/projects")
      .send({ name: "fail" });
    expect(res.status).toBe(401);
  });

  it("MUST create a project and initialize its chain head", async () => {
    const res = await request(app)
      .post("/admin/projects")
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`)
      .send({ name: "cp-test-project" });

    expect(res.status).toBe(201);
    projectId = res.body.projectId;
    expect(projectId).toBeDefined();

    const head = await prisma.chainHead.findUnique({ where: { projectId } });
    expect(head).not.toBeNull();
  });

  it("MUST handle key rotation (Create, verify, revoke)", async () => {
    // 1. Create Key 1
    let res = await request(app)
      .post(`/admin/projects/${projectId}/keys`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(201);
    key1Id = res.body.keyId;
    key1Hash = res.body.apiKey;

    // 2. Create Key 2 (Rotation)
    res = await request(app)
      .post(`/admin/projects/${projectId}/keys`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(201);
    key2Hash = res.body.apiKey;

    expect(key1Hash).not.toBe(key2Hash);

    // 3. Revoke Key 1
    res = await request(app)
      .delete(`/admin/keys/${key1Id}`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(204);

    // 4. Verify Key 1 is blocked from appending
    res = await request(app)
      .post("/events")
      .set("x-api-key", key1Hash)
      .send({
        action: "test",
        actor: { type: "u", id: "1" },
        resource: { type: "r", id: "1" },
      });
    expect(res.status).toBe(401);

    // 5. Verify Key 2 still works
    res = await request(app)
      .post("/events")
      .set("x-api-key", key2Hash)
      .send({
        action: "test",
        actor: { type: "u", id: "1" },
        resource: { type: "r", id: "1" },
      });
    expect(res.status).toBe(201);
  });

  it("MUST block all operations when a project is tombstoned", async () => {
    // Tombstone the project
    let res = await request(app)
      .post(`/admin/projects/${projectId}/tombstone`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);

    // Append should fail
    res = await request(app)
      .post("/events")
      .set("x-api-key", key2Hash)
      .send({
        action: "test",
        actor: { type: "u", id: "1" },
        resource: { type: "r", id: "1" },
      });
    expect(res.status).toBe(403);

    // Key creation should fail
    res = await request(app)
      .post(`/admin/projects/${projectId}/keys`)
      .set("Authorization", `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(403);
  });
});
