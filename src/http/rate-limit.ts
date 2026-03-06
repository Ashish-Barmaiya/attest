import dotenv from "dotenv";
import type { Request, Response, NextFunction } from "express";
import { getProjectContext } from "./auth.js";
import { Redis } from "ioredis";

dotenv.config();

// ----Config----
const WINDOW_MS = parseInt(
  process.env.ATTEST_RATE_LIMIT_WINDOW_MS || "1000",
  10,
);
const GLOBAL_RPS = parseInt(process.env.ATTEST_GLOBAL_RPS || "100", 10);
const PROJECT_RPS = parseInt(process.env.ATTEST_PROJECT_RPS || "10", 10);
const KEY_RPS = parseInt(process.env.ATTEST_KEY_RPS || "5", 10);
const DISABLE_RATE_LIMIT = process.env.ATTEST_DISABLE_RATE_LIMIT === "true";

console.log("Rate Limit Configuration (Redis):");
console.log(`  Window: ${WINDOW_MS}ms`);
console.log(`  Global RPS: ${GLOBAL_RPS}`);
console.log(`  Project RPS: ${PROJECT_RPS}`);
console.log(`  Key RPS: ${KEY_RPS}`);

// ----Redis Setup & Lua Script----

// Connect to the local Redis container
export const redis = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
);

// Define an atomic Token Bucket operation using Lua
redis.defineCommand("takeToken", {
  numberOfKeys: 1,
  lua: `
    local key = KEYS[1]
    local rate = tonumber(ARGV[1])
    local windowMs = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])

    -- Fetch current state from Redis
    local current = redis.call("HMGET", key, "tokens", "lastRefill")
    local tokens = tonumber(current[1])
    local lastRefill = tonumber(current[2])

    -- Initialize if it doesn't exist
    if not tokens then
      tokens = rate
      lastRefill = now
    end

    -- Calculate how many tokens to refill based on elapsed time
    local elapsed = math.max(0, now - lastRefill)
    local refill = (elapsed / windowMs) * rate
    tokens = math.min(rate, tokens + refill)
    lastRefill = now

    local allowed = 0
    if tokens >= 1 then
      tokens = tokens - 1
      allowed = 1
    end

    -- Save state and set an automatic expiration to prevent memory leaks!
    redis.call("HMSET", key, "tokens", tokens, "lastRefill", lastRefill)
    redis.call("PEXPIRE", key, windowMs * 2) 

    return allowed
  `,
});

// ----Core Logic----

async function checkLimit(
  key: string,
  rate: number,
  windowMs: number,
): Promise<boolean> {
  // @ts-ignore - ioredis injects this method dynamically at runtime
  const result = await redis.takeToken(key, rate, windowMs, Date.now());
  return result === 1;
}

export async function resetRateLimits() {
  // For testing purposes: wipe the Redis database cleanly
  await redis.flushdb();
}

// ----Middleware----

export async function globalRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (DISABLE_RATE_LIMIT) return next();

  try {
    const allowed = await checkLimit("rl:global", GLOBAL_RPS, WINDOW_MS);
    if (!allowed) {
      return res.status(429).json({ error: "Too Many Requests (Global)" });
    }
    next();
  } catch (err) {
    console.error("Global rate limit error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function projectRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (DISABLE_RATE_LIMIT) return next();

  try {
    const projectId = getProjectContext(req);
    const allowed = await checkLimit(
      `rl:project:${projectId}`,
      PROJECT_RPS,
      WINDOW_MS,
    );

    if (!allowed) {
      return res.status(429).json({ error: "Too Many Requests (Project)" });
    }
    next();
  } catch (err) {
    console.error("Project rate limit error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function keyRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (DISABLE_RATE_LIMIT) return next();

  try {
    const keyId = (req as any).keyId;
    if (!keyId) return next();

    const allowed = await checkLimit(`rl:key:${keyId}`, KEY_RPS, WINDOW_MS);
    if (!allowed) {
      return res.status(429).json({ error: "Too Many Requests (Key)" });
    }
    next();
  } catch (err) {
    console.error("Key rate limit error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function closeRateLimiter() {
  await redis.quit();
}
