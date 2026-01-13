import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { prisma } from "../db/database.js";

// Extend Express Request to include projectId
declare global {
  namespace Express {
    interface Request {
      projectId?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const apiKey = req.header("x-api-key");

  // Constant-time-ish strategy:
  // Always do:
  // 1. Validation check (fast fail, but we want to simulate work if possible?
  //    Actually requirements say "Always perform... DB lookup".
  //    So if missing/malformed, we hash a dummy.)

  let keyToHash = apiKey;
  let isValidFormat = true;

  // 1. Validate format (64 hex chars)
  // We check this, but we DON'T return yet. We set a flag.
  if (!apiKey || typeof apiKey !== "string" || !/^[0-9a-f]{64}$/.test(apiKey)) {
    isValidFormat = false;
    // Use a dummy key for hashing to ensure we still do the work
    keyToHash =
      "0000000000000000000000000000000000000000000000000000000000000000";
  }

  // 2. Hash it (SHA-256)
  // Always happens, either on real key or dummy key
  const keyHash = crypto.createHash("sha256").update(keyToHash!).digest("hex");

  try {
    // 3. DB Lookup
    // Always happens
    const keyRecord = await prisma.apiKey.findUnique({
      where: { keyHash },
    });

    // 4. Final Decision
    // We fail if:
    // - Format was invalid (isValidFormat === false)
    // - Record not found (!keyRecord)
    // - Key is revoked (keyRecord.revokedAt)
    // - Dummy key was used (implied by !keyRecord usually, but explicit check helps)

    if (!isValidFormat || !keyRecord || keyRecord.revokedAt) {
      // Uniform 401
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Attach project context
    req.projectId = keyRecord.projectId;
    next();
  } catch (err) {
    console.error("Auth error:", err);
    // Fail closed, ambiguously
    res.status(401).json({ error: "Unauthorized" });
  }
}

export function getProjectContext(req: Request): string {
  if (!req.projectId) {
    throw new Error("Project context missing! Auth middleware failure.");
  }
  return req.projectId;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const adminToken = process.env.ATTEST_ADMIN_TOKEN;

  if (!adminToken) {
    console.error("ATTEST_ADMIN_TOKEN is not set!");
    return res.status(500).json({ error: "Server configuration error" });
  }

  // Constant-time comparison
  let isValid = true;
  let tokenToCompare = token || "";

  // If token is missing or wrong length, we still compare against something to simulate work?
  // Actually, for a simple token check, just ensuring we compare both is usually enough.
  // But strictly speaking, we want to avoid timing attacks on length.
  // However, for this task, a simple constant-time string compare is sufficient if lengths match.
  // If lengths mismatch, it's obviously wrong, but we should still try to take constant time.

  if (!token || typeof token !== "string") {
    isValid = false;
    tokenToCompare = "invalid-token-placeholder";
  }

  // Use crypto.timingSafeEqual
  // It requires buffers of equal length.
  const bufferA = Buffer.from(tokenToCompare);
  const bufferB = Buffer.from(adminToken);

  if (bufferA.length !== bufferB.length) {
    isValid = false;
    // To avoid timing leak on length, we could compare bufferB against itself or something,
    // but usually length leak is considered acceptable for tokens or hard to avoid completely without padding.
    // Let's just fail. The requirement says "Use constant-time comparison".
    // If lengths differ, timingSafeEqual throws.
  } else {
    if (!crypto.timingSafeEqual(bufferA, bufferB)) {
      isValid = false;
    }
  }

  if (!isValid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}
