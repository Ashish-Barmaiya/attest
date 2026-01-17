import {
  globalRateLimit,
  projectRateLimit,
  keyRateLimit,
  resetRateLimits,
} from "../src/http/rate-limit.js";
import assert from "node:assert";

// Mock Express objects
function createMockReq(projectId?: string, keyId?: string) {
  return {
    projectId,
    keyId,
    header: () => "",
  } as any;
}

function createMockRes() {
  const res: any = {};
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: any) => {
    res.body = body;
    return res;
  };
  return res;
}

async function runTests() {
  console.log("Starting Rate Limit Unit Tests...");

  // --- Global Rate Limit ---
  console.log("\nTest: Global Rate Limit");
  resetRateLimits();
  // Default Global RPS is 100.
  let passed = 0;
  let limited = 0;
  for (let i = 0; i < 110; i++) {
    const req = createMockReq();
    const res = createMockRes();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    globalRateLimit(req, res, next);

    if (nextCalled) passed++;
    else if (res.statusCode === 429) limited++;
  }

  console.log(`Global: Passed ${passed}, Limited ${limited}`);
  assert.strictEqual(passed, 100, "Should allow exactly 100 requests globally");
  assert.strictEqual(limited, 10, "Should limit subsequent requests");
  console.log("Passed");

  // --- Project Rate Limit ---
  console.log("\nTest: Project Rate Limit");
  resetRateLimits();
  // Default Project RPS is 10.
  const projectId = "proj-123";

  passed = 0;
  limited = 0;
  for (let i = 0; i < 15; i++) {
    const req = createMockReq(projectId);
    const res = createMockRes();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    projectRateLimit(req, res, next);

    if (nextCalled) passed++;
    else if (res.statusCode === 429) limited++;
  }

  console.log(`Project: Passed ${passed}, Limited ${limited}`);
  assert.strictEqual(
    passed,
    10,
    "Should allow exactly 10 requests per project"
  );
  assert.strictEqual(limited, 5, "Should limit subsequent requests");
  console.log("Passed");

  // --- Key Rate Limit ---
  console.log("\nTest: Key Rate Limit");
  resetRateLimits();
  // Default Key RPS is 5.
  const keyId = "key-abc";

  passed = 0;
  limited = 0;
  for (let i = 0; i < 10; i++) {
    const req = createMockReq("proj-123", keyId);
    const res = createMockRes();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    keyRateLimit(req, res, next);

    if (nextCalled) passed++;
    else if (res.statusCode === 429) limited++;
  }

  console.log(`Key: Passed ${passed}, Limited ${limited}`);
  assert.strictEqual(passed, 5, "Should allow exactly 5 requests per key");
  assert.strictEqual(limited, 5, "Should limit subsequent requests");
  console.log("Passed");

  // --- Isolation Test ---
  console.log("\nTest: Isolation (Different Projects)");
  resetRateLimits();
  const projA = "proj-A";
  const projB = "proj-B";

  // Exhaust projA
  for (let i = 0; i < 10; i++) {
    const req = createMockReq(projA);
    const res = createMockRes();
    const next = () => {};
    projectRateLimit(req, res, next);
  }

  // Try projB (should succeed)
  const reqB = createMockReq(projB);
  const resB = createMockRes();
  let nextCalledB = false;
  projectRateLimit(reqB, resB, () => {
    nextCalledB = true;
  });

  assert.strictEqual(
    nextCalledB,
    true,
    "Project B should not be limited by Project A"
  );
  console.log("Passed");
}

runTests().catch((err) => {
  console.error("Tests Failed:", err);
  process.exit(1);
});
