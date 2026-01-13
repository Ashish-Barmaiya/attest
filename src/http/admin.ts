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

    // Generate key
    const key = crypto.randomBytes(32).toString("hex");
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");

    const apiKey = await prisma.apiKey.create({
      data: {
        keyHash,
        projectId,
        createdAt: BigInt(Date.now()),
      },
    });

    res.status(201).json({
      apiKey: key,
      keyId: apiKey.id,
    });
  } catch (err) {
    console.error("Failed to create API key:", err);
    res.status(500).json({ error: "Failed to create API key" });
  }
});

// 4. Revoke API Key
adminRouter.delete("/keys/:keyHash", async (req, res) => {
  const { keyHash } = req.params; // This is keyHash

  try {
    await prisma.apiKey.update({
      where: { keyHash },
      data: {
        revokedAt: BigInt(Date.now()),
      },
    });

    res.status(204).send();
  } catch (err) {
    // If not found
    // Prisma throws if record not found? No, update throws?
    // Actually update throws if not found.
    console.error("Failed to revoke key:", err);
    res.status(404).json({ error: "Key not found" });
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
      // payloadJson is already a string
    }));

    res.json(result);
  } catch (err) {
    console.error("Failed to export events:", err);
    res.status(500).json({ error: "Failed to export events" });
  }
});
