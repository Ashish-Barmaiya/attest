import dotenv from "dotenv";
import type { Request, Response, NextFunction } from "express";
import { getProjectContext } from "./auth.js";

dotenv.config();

/* ================================
   Types
================================ */

interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

/* ================================
   Config
================================ */

const WINDOW_MS = parseInt(
  process.env.ATTEST_RATE_LIMIT_WINDOW_MS || "1000",
  10,
);

const GLOBAL_RPS = parseInt(process.env.ATTEST_GLOBAL_RPS || "100", 10);
const PROJECT_RPS = parseInt(process.env.ATTEST_PROJECT_RPS || "10", 10);
const KEY_RPS = parseInt(process.env.ATTEST_KEY_RPS || "5", 10);

const DISABLE_RATE_LIMIT = process.env.ATTEST_DISABLE_RATE_LIMIT === "true";

console.log("Rate Limit Configuration:");
console.log(`  Window: ${WINDOW_MS}ms`);
console.log(`  Global RPS: ${GLOBAL_RPS}`);
console.log(`  Project RPS: ${PROJECT_RPS}`);
console.log(`  Key RPS: ${KEY_RPS}`);
console.log(`  Disabled: ${DISABLE_RATE_LIMIT}`);

/* ================================
   Stores
================================ */

const globalStore: RateLimitState = {
  tokens: GLOBAL_RPS,
  lastRefill: Date.now(),
};

const projectStore = new Map<string, RateLimitState>();
const keyStore = new Map<string, RateLimitState>();

export function resetRateLimits() {
  globalStore.tokens = GLOBAL_RPS;
  globalStore.lastRefill = Date.now();
  projectStore.clear();
  keyStore.clear();
}

/* ================================
   Token Bucket Logic
================================ */

function checkLimit(
  store: RateLimitState,
  rate: number,
  windowMs: number,
): boolean {
  const now = Date.now();

  const elapsed = now - store.lastRefill;
  const refill = (elapsed / windowMs) * rate;

  store.tokens = Math.min(rate, store.tokens + refill);
  store.lastRefill = now;

  if (store.tokens >= 1) {
    store.tokens -= 1;
    return true;
  }

  return false;
}

function getOrInitStore(
  map: Map<string, RateLimitState>,
  key: string,
  rate: number,
): RateLimitState {
  let state = map.get(key);
  if (!state) {
    state = {
      tokens: rate,
      lastRefill: Date.now(),
    };
    map.set(key, state);
  }
  return state;
}

/* ================================
   Middleware
================================ */

export function globalRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (DISABLE_RATE_LIMIT) return next();

  if (!checkLimit(globalStore, GLOBAL_RPS, WINDOW_MS)) {
    return res.status(429).json({
      error: "Too Many Requests (Global)",
    });
  }

  next();
}

export function projectRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (DISABLE_RATE_LIMIT) return next();

  try {
    const projectId = getProjectContext(req);
    const store = getOrInitStore(projectStore, projectId, PROJECT_RPS);

    if (!checkLimit(store, PROJECT_RPS, WINDOW_MS)) {
      return res.status(429).json({
        error: "Too Many Requests (Project)",
      });
    }

    next();
  } catch (err) {
    console.error("Project rate limit error:", err);
    return res.status(500).json({
      error: "Internal Server Error",
    });
  }
}

export function keyRateLimit(req: Request, res: Response, next: NextFunction) {
  if (DISABLE_RATE_LIMIT) return next();

  const keyId = (req as any).keyId;
  if (!keyId) return next();

  const store = getOrInitStore(keyStore, keyId, KEY_RPS);

  if (!checkLimit(store, KEY_RPS, WINDOW_MS)) {
    return res.status(429).json({
      error: "Too Many Requests (Key)",
    });
  }

  next();
}
