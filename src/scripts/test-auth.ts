import { appendEventPersistent } from "../db/appendPersistent.js";
import { prisma } from "../db/database.js";
import crypto from "node:crypto";

// We need to test against the running server for HTTP tests,
// but we can also test the logic directly if we want.
// The requirements say "Create a test script... that proves: Valid key -> correct project access...".
// It's best to test the HTTP endpoints since that's where the auth middleware lives.

const BASE_URL = "http://localhost:3000";

async function createKey(projectId: string): Promise<string> {
  const key = crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");

  await prisma.apiKey.create({
    data: {
      keyHash,
      projectId,
      createdAt: BigInt(Date.now()),
    },
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

async function request(
  method: string,
  path: string,
  key?: string,
  body?: unknown
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (key) {
    headers["x-api-key"] = key;
  }

  const init: RequestInit = {
    method,
    headers,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  };

  const res = await fetch(`${BASE_URL}${path}`, init);

  return {
    status: res.status,
    data: await res.json().catch(() => ({})),
  };
}

async function runTests() {
  console.log("Starting Adversarial Auth Tests...");

  // Setup
  const projectA = "auth-test-a";
  const projectB = "auth-test-b";

  // Clean up
  await prisma.apiKey.deleteMany({
    where: { projectId: { in: [projectA, projectB] } },
  });
  await prisma.auditEvent.deleteMany({
    where: { projectId: { in: [projectA, projectB] } },
  });
  await prisma.chainHead.deleteMany({
    where: { projectId: { in: [projectA, projectB] } },
  });

  // Initialize heads
  await prisma.chainHead.create({
    data: { projectId: projectA, lastSequence: 0, lastChainHash: "GENESIS_A" },
  });
  await prisma.chainHead.create({
    data: { projectId: projectB, lastSequence: 0, lastChainHash: "GENESIS_B" },
  });

  const keyA = await createKey(projectA);
  const keyB = await createKey(projectB);

  // 1. Valid key -> correct project access
  console.log("\nTest 1: Valid Key Access");
  const res1 = await request("POST", "/events", keyA, {
    action: "login",
    actor: { type: "user", id: "alice" },
    resource: { type: "app", id: "web" },
  });
  if (res1.status === 201) console.log("✅ Append with valid key success");
  else console.error("❌ Append with valid key failed", res1);

  // 2. Invalid key -> rejected
  console.log("\nTest 2: Invalid Key Rejection");
  const res2 = await request("POST", "/events", "invalid-key-123", {
    action: "login",
    actor: { type: "user", id: "alice" },
    resource: { type: "app", id: "web" },
  });
  if (res2.status === 401) console.log("✅ Invalid key rejected");
  else console.error("❌ Invalid key NOT rejected", res2);

  // 3. Revoked key -> rejected
  console.log("\nTest 3: Revoked Key Rejection");
  const keyRevoked = await createKey(projectA);
  await revokeKey(keyRevoked);
  const res3 = await request("POST", "/events", keyRevoked, {
    action: "login",
    actor: { type: "user", id: "alice" },
    resource: { type: "app", id: "web" },
  });
  if (res3.status === 401) console.log("✅ Revoked key rejected");
  else console.error("❌ Revoked key NOT rejected", res3);

  // 4. Missing key -> rejected
  console.log("\nTest 4: Missing Key Rejection");
  const res4 = await request("POST", "/events", undefined, {
    action: "login",
    actor: { type: "user", id: "alice" },
    resource: { type: "app", id: "web" },
  });
  if (res4.status === 401) console.log("✅ Missing key rejected");
  else console.error("❌ Missing key NOT rejected", res4);

  // 5. Cross-project isolation (Key A cannot append to Project B)
  console.log("\nTest 5: Project Isolation");

  const headA = await request("GET", "/head", keyA);
  const headB = await request("GET", "/head", keyB);

  if (headA.data.lastSequence === 1 && headB.data.lastSequence === 0) {
    console.log("✅ Isolation verified: Project A advanced, Project B did not");
  } else {
    console.error("❌ Isolation failed", {
      headA: headA.data,
      headB: headB.data,
    });
  }

  // 6. Verify Key Scope (Renamed from "Verify Endpoint Access")
  // This test ensures that Key A can ONLY verify Project A.
  // We cannot ask the server to verify Project B with Key A because the server
  // derives the project from the key.
  // So we verify that the data returned corresponds to Project A.
  console.log("\nTest 6: Verify Key Scope");
  const verifyA = await request("GET", "/verify", keyA);

  if (verifyA.status === 200 && verifyA.data.isValid === true) {
    if (verifyA.data.projectId === projectA) {
      console.log("✅ Key A correctly scoped to Project A");
    } else {
      console.error("❌ Key A returned data for wrong project!", verifyA.data);
    }
  } else {
    console.error("❌ Verify endpoint failed", verifyA);
  }

  // 7. Malformed Key -> 401 (Hardening Check)
  console.log("\nTest 7: Malformed Key Rejection");
  const res7 = await request("POST", "/events", "short-key", {
    action: "login",
    actor: { type: "user", id: "alice" },
    resource: { type: "app", id: "web" },
  });
  if (res7.status === 401) console.log("✅ Malformed key rejected (401)");
  else console.error("❌ Malformed key NOT rejected properly", res7);

  console.log("\nDone.");
}

runTests()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
