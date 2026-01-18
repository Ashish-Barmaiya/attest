import type { Request, Response, NextFunction } from "express";
import { getProjectContext } from "./auth.js";

interface RateLimitConfig {
  windowMs: number;
  limit: number;
}

interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

// Simple in-memory store for rate limiting
// In a distributed system, this should be Redis
const globalStore: RateLimitState = { tokens: 0, lastRefill: 0 };
const projectStore: Map<string, RateLimitState> = new Map();
const keyStore: Map<string, RateLimitState> = new Map();

export function resetRateLimits() {
  globalStore.tokens = 0;
  globalStore.lastRefill = 0;
  projectStore.clear();
  keyStore.clear();
}

// Configuration from env
const WINDOW_MS = parseInt(
  process.env.ATTEST_RATE_LIMIT_WINDOW_MS || "1000",
  10
);
const GLOBAL_RPS = parseInt(process.env.ATTEST_GLOBAL_RPS || "100", 10);
const PROJECT_RPS = parseInt(process.env.ATTEST_PROJECT_RPS || "10", 10);
const KEY_RPS = parseInt(process.env.ATTEST_KEY_RPS || "5", 10);

console.log("Rate Limit Configuration:");
console.log(`  Window: ${WINDOW_MS}ms`);
console.log(`  Global RPS: ${GLOBAL_RPS}`);
console.log(`  Project RPS: ${PROJECT_RPS}`);
console.log(`  Key RPS: ${KEY_RPS}`);

function checkLimit(
  store: RateLimitState,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const timePassed = now - store.lastRefill;

  // Fixed-window rate limiter for simplicity and predictability.
  // If (now - lastRefill > windowMs) -> reset count.

  if (timePassed > windowMs) {
    store.tokens = limit;
    store.lastRefill = now;
  }

  if (store.tokens > 0) {
    store.tokens--;
    return true;
  }

  return false;
}

function getOrInitStore(
  map: Map<string, RateLimitState>,
  key: string,
  limit: number
): RateLimitState {
  let state = map.get(key);
  if (!state) {
    state = { tokens: limit, lastRefill: Date.now() };
    map.set(key, state);
  }
  return state;
}

export function globalRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Initialize global store if needed (first run)
  if (globalStore.lastRefill === 0) {
    globalStore.tokens = GLOBAL_RPS;
    globalStore.lastRefill = Date.now();
  }

  if (!checkLimit(globalStore, GLOBAL_RPS, WINDOW_MS)) {
    return res.status(429).json({ error: "Too Many Requests (Global)" });
  }
  next();
}

export function projectRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const projectId = getProjectContext(req);
    const store = getOrInitStore(projectStore, projectId, PROJECT_RPS);

    if (!checkLimit(store, PROJECT_RPS, WINDOW_MS)) {
      return res.status(429).json({ error: "Too Many Requests (Project)" });
    }
    next();
  } catch (err) {
    console.error("Rate limit error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export function keyRateLimit(req: Request, res: Response, next: NextFunction) {
  const keyId = (req as any).keyId;

  if (!keyId) {
    return next();
  }

  const store = getOrInitStore(keyStore, keyId, KEY_RPS);

  if (!checkLimit(store, KEY_RPS, WINDOW_MS)) {
    return res.status(429).json({ error: "Too Many Requests (Key)" });
  }
  next();
}
