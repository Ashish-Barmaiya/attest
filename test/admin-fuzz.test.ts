import request from "supertest";
import { app } from "../src/http/app.js";
import { prisma } from "../src/db/database.js";

describe("Admin Control Plane - Adversarial Fuzzing", () => {
  const ADMIN_TOKEN = "fuzz-admin-token";
  const headers = { Authorization: `Bearer ${ADMIN_TOKEN}` };

  beforeAll(() => {
    process.env.ATTEST_ADMIN_TOKEN = ADMIN_TOKEN;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("MUST reject project creation with malformed data", async () => {
    // 1. Missing name
    let res = await request(app).post("/admin/projects").set(headers).send({});
    expect(res.status).toBe(400);

    // 2. Name too short
    res = await request(app)
      .post("/admin/projects")
      .set(headers)
      .send({ name: "ab" });
    expect(res.status).toBe(400);

    // 3. Name is an array (Injection attempt)
    res = await request(app)
      .post("/admin/projects")
      .set(headers)
      .send({ name: ["My", "Project"] });
    expect(res.status).toBe(400);

    // 4. Unknown fields included (.strict() should catch this)
    res = await request(app).post("/admin/projects").set(headers).send({
      name: "Valid Project",
      bypassAuth: true,
    });
    expect(res.status).toBe(400);
  });

  it("MUST reject endpoints with invalid UUID params", async () => {
    const badUUID = "1234-invalid-uuid-string";

    // Create Key with bad UUID
    let res = await request(app)
      .post(`/admin/projects/${badUUID}/keys`)
      .set(headers);
    expect(res.status).toBe(400);

    // Get Head with bad UUID
    res = await request(app)
      .get(`/admin/projects/${badUUID}/head`)
      .set(headers);
    expect(res.status).toBe(400);

    // Revoke Key with SQL Injection attempt in URL
    const sqlInject = "1'; DROP TABLE keys;--";
    res = await request(app).delete(`/admin/keys/${sqlInject}`).set(headers);
    expect(res.status).toBe(400);
  });

  it("MUST reject malformed anchor reports", async () => {
    // 1. Invalid status enum
    let res = await request(app)
      .post("/admin/anchor-report")
      .set(headers)
      .send({
        status: "hacked",
        projectCount: 5,
      });
    expect(res.status).toBe(400);

    // 2. Negative project count
    res = await request(app).post("/admin/anchor-report").set(headers).send({
      status: "success",
      projectCount: -1,
    });
    expect(res.status).toBe(400);

    // 3. String instead of integer
    res = await request(app).post("/admin/anchor-report").set(headers).send({
      status: "failed",
      projectCount: "five",
    });
    expect(res.status).toBe(400);
  });
});
