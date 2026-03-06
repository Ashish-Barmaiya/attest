import { closeRateLimiter } from "./src/http/rate-limit.js";

afterAll(async () => {
  // Ensure the Redis connection is closed after all suites finish
  await closeRateLimiter();
});
