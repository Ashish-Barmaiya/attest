import "dotenv/config";
import express from "express";
import { IngestEventSchema } from "./schemas.js";
import { appendEventPersistent } from "../db/appendPersistent.js";
import { requireAuth, getProjectContext, requireAdmin } from "./auth.js";
import { prisma } from "../db/database.js";
import { loadAllEvents } from "../db/loadAll.js";
import { verifyChain } from "../core/verify.js";
import { adminRouter } from "./admin.js";
import {
  globalRateLimit,
  projectRateLimit,
  keyRateLimit,
} from "./rate-limit.js";

export const app = express();

app.use(express.json({ limit: "100kb" }));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/admin", requireAdmin, adminRouter);
app.use(requireAuth);
app.use(globalRateLimit);

app.post("/events", projectRateLimit, keyRateLimit, async (req, res) => {
  const parsed = IngestEventSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid event payload",
      details: parsed.error.flatten(),
    });
  }

  const projectId = getProjectContext(req);

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return res.status(404).json({ error: "Unknown project" });
    }

    if (project.tombstonedAt) {
      return res.status(403).json({ error: "Project is tombstoned" });
    }

    const event = await appendEventPersistent(projectId, parsed.data);

    res.status(201).json({
      sequence: event.sequence,
      chainHash: event.chainHash,
    });
  } catch (err) {
    console.error(err);
    if (err instanceof Error && err.message === "Unknown project") {
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
        projectId,
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
