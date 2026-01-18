import { Router } from "express";
import { prisma } from "../db/database.js";
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";

export const adminRouter = Router();

// 1. Create Project
adminRouter.post("/projects", async (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Project name is required" });
  }

  const projectId = randomUUID();
  const createdAt = BigInt(Date.now());

  try {
    // Create project
    await prisma.project.create({
      data: {
        id: projectId,
        name,
        createdAt,
      },
    });

    // Initialize chain head
    await prisma.chainHead.create({
      data: {
        projectId,
        lastSequence: 0,
        lastChainHash: "GENESIS",
      },
    });

    res.status(201).json({
      projectId,
      name,
      createdAt: createdAt.toString(),
    });
  } catch (err) {
    console.error("Failed to create project:", err);
    res.status(500).json({ error: "Failed to create project" });
  }
});

// 2. List Projects
adminRouter.get("/projects", async (req, res) => {
  try {
    const projects = await prisma.project.findMany();
    const result = projects.map((p) => ({
      projectId: p.id,
      name: p.name,
      createdAt: p.createdAt.toString(),
    }));

    res.json(result);
  } catch (err) {
    console.error("Failed to list projects:", err);
    res.status(500).json({ error: "Failed to list projects" });
  }
});

// 3. Create API Key
adminRouter.post("/projects/:projectId/keys", async (req, res) => {
  const { projectId } = req.params;

  try {
    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.tombstonedAt) {
      return res.status(403).json({ error: "Project is tombstoned" });
    }

    // Generate key
    const key = crypto.randomBytes(32).toString("hex");

    // Hash the key
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");

    const apiKey = await prisma.apiKey.create({
      data: {
        keyHash, // Store the hash, not the raw key
        projectId,
        createdAt: BigInt(Date.now()),
      },
    });

    res.status(201).json({
      apiKey: key, // Return the raw key
      keyId: apiKey.id,
    });
  } catch (err) {
    console.error("Failed to create API key:", err);
    res.status(500).json({ error: "Failed to create API key" });
  }
});

// 4. Revoke API Key
adminRouter.delete("/keys/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // We need to find the key first to know the project.
    const key = await prisma.apiKey.findUnique({ where: { id } });
    if (!key) return res.status(404).json({ error: "Key not found" });

    // Verify project is not tombstoned
    const project = await prisma.project.findUnique({
      where: { id: key.projectId },
    });

    if (project && project.tombstonedAt) {
      return res.status(403).json({ error: "Project is tombstoned" });
    }

    await prisma.apiKey.update({
      where: { id },
      data: {
        revokedAt: BigInt(Date.now()), // Mark the key as revoked
      },
    });

    res.status(204).send();
  } catch (err) {
    console.error("Failed to revoke key:", err);
    res.status(500).json({ error: "Failed to revoke key" });
  }
});

// 6. Tombstone Project
adminRouter.post("/projects/:projectId/tombstone", async (req, res) => {
  const { projectId } = req.params;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.tombstonedAt) {
      return res.status(400).json({ error: "Project is already tombstoned" });
    }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        tombstonedAt: BigInt(Date.now()), // Mark the project as tombstoned
      },
    });

    res.json({
      message: "Project tombstoned",
      projectId,
      tombstonedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to tombstone project:", err);
    // @ts-ignore
    if (err.meta) console.error("Prisma meta:", err.meta);
    res
      .status(500)
      .json({ error: "Failed to tombstone project", details: String(err) });
  }
});

// 5. Export Events (for CLI verification)
adminRouter.get("/projects/:projectId/events", async (req, res) => {
  const { projectId } = req.params;

  try {
    const events = await prisma.auditEvent.findMany({
      where: { projectId },
      orderBy: { sequence: "asc" },
    });

    // Convert BigInt to string for JSON
    const result = events.map((e) => ({
      ...e,
      createdAt: e.createdAt.toString(),
    }));

    res.json(result);
  } catch (err) {
    console.error("Failed to export events:", err);
    res.status(500).json({ error: "Failed to export events" });
  }
});
// 7. Get Anchor Logs
adminRouter.get("/anchor/logs", async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;

  try {
    const logs = await prisma.anchorRun.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
    });

    res.json(logs);
  } catch (err) {
    console.error("Failed to fetch anchor logs:", err);
    res.status(500).json({ error: "Failed to fetch anchor logs" });
  }
});
