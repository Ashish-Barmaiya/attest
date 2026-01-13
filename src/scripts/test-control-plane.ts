import { app } from "../http/server.js";
import { initDb } from "../db/schema.js";
import { prisma } from "../db/database.js";
import assert from "assert";
import http from "http";

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
const ADMIN_TOKEN = "test-admin-token";

// Mock env
process.env.ATTEST_ADMIN_TOKEN = ADMIN_TOKEN;

async function startServer() {
  await initDb();
  return new Promise<http.Server>((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`Test server listening on :${PORT}`);
      resolve(server);
    });
  });
}

async function request(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  return fetch(url, { ...options, headers });
}

async function runTests() {
  const server = await startServer();

  try {
    console.log("Starting Control Plane Tests...");

    // 1. Auth Tests
    console.log("Test 1: Auth Security");

    // No token
    let res = await request("/admin/projects");
    assert.strictEqual(res.status, 401, "Should return 401 without token");

    // Wrong token
    res = await request("/admin/projects", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    assert.strictEqual(res.status, 401, "Should return 401 with wrong token");

    // Correct token
    res = await request("/admin/projects", {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200, "Should return 200 with correct token");

    // 2. Project Management
    console.log("Test 2: Project Management");

    // Create Project
    res = await request("/admin/projects", {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ name: "test-project" }),
    });
    assert.strictEqual(res.status, 201, "Should create project");
    const project = await res.json();
    assert.ok(project.projectId, "Should have projectId");
    assert.strictEqual(
      project.name,
      "test-project",
      "Should have correct name"
    );

    // List Projects
    res = await request("/admin/projects", {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const projects = await res.json();
    assert.ok(Array.isArray(projects), "Should return array");
    assert.ok(
      projects.find((p: any) => p.projectId === project.projectId),
      "Should contain created project"
    );

    // 3. Key Management
    console.log("Test 3: Key Management");

    // Create Key
    res = await request(`/admin/projects/${project.projectId}/keys`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 201, "Should create key");
    const keyData = await res.json();
    assert.ok(keyData.apiKey, "Should return apiKey");
    assert.ok(keyData.keyId, "Should return keyId");

    // Use Key to Append Event (Data Plane)
    res = await request("/events", {
      method: "POST",
      headers: { "x-api-key": keyData.apiKey },
      body: JSON.stringify({
        action: "login",
        actor: { type: "user", id: "alice" },
        resource: { type: "app", id: "web-portal" },
      }),
    });
    assert.strictEqual(res.status, 201, "Should append event with new key");

    // 4. Revocation
    console.log("Test 4: Key Revocation");

    // Revoke Key
    res = await request(`/admin/keys/${keyData.keyId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 204, "Should revoke key");

    // Try to Append with Revoked Key
    res = await request("/events", {
      method: "POST",
      headers: { "x-api-key": keyData.apiKey },
      body: JSON.stringify({
        action: "login",
        actor: { type: "user", id: "bob" },
        resource: { type: "app", id: "web-portal" },
      }),
    });
    assert.strictEqual(
      res.status,
      401,
      "Should fail to append with revoked key"
    );
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runTests();
