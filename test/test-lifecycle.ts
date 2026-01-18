import { app } from "../src/http/server.js";
import { initDb } from "../src/db/schema.js";
import { prisma } from "../src/db/database.js";
import assert from "assert";
import http from "http";

const PORT = 3002;
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
    console.log("Starting Lifecycle Tests...");

    // 1. Key Rotation
    console.log("Test 1: Key Rotation");

    // Create Project
    let res = await request("/admin/projects", {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: JSON.stringify({ name: "lifecycle-test" }),
    });
    const project = await res.json();
    const projectId = project.projectId;

    // Create Key 1
    res = await request(`/admin/projects/${projectId}/keys`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const key1 = await res.json();

    // Rotate (Create Key 2)
    res = await request(`/admin/projects/${projectId}/keys`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const key2 = await res.json();

    assert.notStrictEqual(key1.apiKey, key2.apiKey, "Keys should be different");

    // Verify both keys work
    res = await request("/events", {
      method: "POST",
      headers: { "x-api-key": key1.apiKey },
      body: JSON.stringify({
        action: "test1",
        actor: { type: "user", id: "u1" },
        resource: { type: "r", id: "r1" },
      }),
    });
    assert.strictEqual(res.status, 201, "Key 1 should work");

    res = await request("/events", {
      method: "POST",
      headers: { "x-api-key": key2.apiKey },
      body: JSON.stringify({
        action: "test2",
        actor: { type: "user", id: "u1" },
        resource: { type: "r", id: "r1" },
      }),
    });
    assert.strictEqual(res.status, 201, "Key 2 should work");

    // Revoke Key 1
    res = await request(`/admin/keys/${key1.keyId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 204, "Revocation should succeed");

    // Verify Key 1 fails
    res = await request("/events", {
      method: "POST",
      headers: { "x-api-key": key1.apiKey },
      body: JSON.stringify({
        action: "test3",
        actor: { type: "user", id: "u1" },
        resource: { type: "r", id: "r1" },
      }),
    });
    assert.strictEqual(res.status, 401, "Key 1 should fail after revocation");

    // Verify Key 2 still works
    res = await request("/events", {
      method: "POST",
      headers: { "x-api-key": key2.apiKey },
      body: JSON.stringify({
        action: "test4",
        actor: { type: "user", id: "u1" },
        resource: { type: "r", id: "r1" },
      }),
    });
    assert.strictEqual(res.status, 201, "Key 2 should still work");

    console.log("Key Rotation Tests Passed.");

    // 2. Tombstoning
    console.log("Test 2: Tombstoning");

    // Tombstone Project
    res = await request(`/admin/projects/${projectId}/tombstone`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 200, "Tombstoning should succeed");

    // Verify Append Fails
    res = await request("/events", {
      method: "POST",
      headers: { "x-api-key": key2.apiKey },
      body: JSON.stringify({
        action: "test5",
        actor: { type: "user", id: "u1" },
        resource: { type: "r", id: "r1" },
      }),
    });
    assert.strictEqual(
      res.status,
      403,
      "Append should fail for tombstoned project"
    );

    // Verify Create Key Fails
    res = await request(`/admin/projects/${projectId}/keys`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(
      res.status,
      403,
      "Create Key should fail for tombstoned project"
    );

    // Verify Revoke Key Fails
    res = await request(`/admin/keys/${key2.keyId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(
      res.status,
      403,
      "Revoke Key should fail for tombstoned project"
    );

    // Verify Tombstone Fails (Already Tombstoned)
    res = await request(`/admin/projects/${projectId}/tombstone`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.strictEqual(res.status, 400, "Double tombstone should fail");

    console.log("Tombstoning Tests Passed.");
  } catch (err) {
    console.error("Test Failed:", err);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runTests();
