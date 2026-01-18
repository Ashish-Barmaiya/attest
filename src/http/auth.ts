import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { prisma } from "../db/database.js";

// Extend Express Request to include projectId
declare global {
  namespace Express {
    interface Request {
      projectId?: string;
      keyId?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const apiKey = req.header("x-api-key");

  // Always do validation check
  let keyToHash = apiKey;
  let isValidFormat = true;

  // 1. Validate format (64 hex chars)
  if (!apiKey || typeof apiKey !== "string" || !/^[0-9a-f]{64}$/.test(apiKey)) {
    isValidFormat = false;
    // Dummy key for hashing to ensure work is still being done
    keyToHash =
      "0000000000000000000000000000000000000000000000000000000000000000";
  }

  // 2. Hash it (SHA-256)
  // Always happens, either on real key or dummy key
  const keyHash = crypto.createHash("sha256").update(keyToHash!).digest("hex");

  try {
    // 3. DB Lookup
    const keyRecord = await prisma.apiKey.findUnique({
      where: { keyHash },
    });

    // 4. Fail if:
    // - Format was invalid
    // - Record not found
    // - Key is revoked
    // - Dummy key was used

    if (!isValidFormat || !keyRecord || keyRecord.revokedAt) {
      // Uniform 401
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Attach project context
    req.projectId = keyRecord.projectId;
    (req as any).keyId = keyRecord.id;
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

  let isValid = true;
  let tokenToCompare = token || "";

  if (!token || typeof token !== "string") {
    isValid = false;
    tokenToCompare = "invalid-token-placeholder";
  }

  const bufferA = Buffer.from(tokenToCompare);
  const bufferB = Buffer.from(adminToken);

  if (bufferA.length !== bufferB.length) {
    isValid = false;
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
