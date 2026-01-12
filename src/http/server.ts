import "dotenv/config";
import { initDb } from "../db/schema.js";
import express from "express";
import { IngestEventSchema } from "./schemas.js";
import { appendEventPersistent } from "../db/appendPersistent.js";
import { requireAuth, getProjectContext } from "./auth.js";
import { prisma } from "../db/database.js";
import { loadAllEvents } from "../db/loadAll.js";
import { verifyChain } from "../core/verify.js";

const app = express();

app.use(express.json({ limit: "100kb" }));

// Public health check (optional, but good practice)
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// --- Authenticated Routes ---
app.use(requireAuth);

app.post("/events", async (req, res) => {
  const parsed = IngestEventSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid event payload",
      details: parsed.error.flatten(),
    });
  }

  // Project ID is guaranteed by requireAuth
  const projectId = getProjectContext(req);

  try {
    const event = await appendEventPersistent(projectId, parsed.data);

    res.status(201).json({
      sequence: event.sequence,
      chainHash: event.chainHash,
    });
  } catch (err) {
    console.error(err);
    if (err instanceof Error && err.message === "Unknown project") {
      // This should theoretically not happen if auth is correct,
      // but good for safety if DB state is inconsistent
      return res.status(404).json({ error: "Unknown project" });
    }
    res.status(500).json({ error: "Failed to append event" });
  }
});

app.get("/head", async (req, res) => {
  const projectId = getProjectContext(req);

  try {
    const head = await prisma.chainHead.findUnique({
      where: { projectId },
    });

    if (!head) {
      console.error(
        "Invariant broken: missing chain head for project",
        projectId
      );
      return res.status(500).json({ error: "Internal error" });
    }

    res.json(head);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch chain head" });
  }
});

app.get("/verify", async (req, res) => {
  const projectId = getProjectContext(req);

  try {
    const events = await loadAllEvents(projectId);
    verifyChain(events);

    res.json({
      projectId,
      eventCount: events.length,
      isValid: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Verification failed",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

// Initialize DB then start server
initDb()
  .then(() => {
    app.listen(3000, () => {
      console.log("Audit service listening on :3000");
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
