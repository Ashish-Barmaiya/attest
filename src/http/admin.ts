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
    const keyId = crypto.randomUUID(); // We don't have a keyId in the schema?
    // Schema: model ApiKey { keyHash String @id, ... }
    // The schema uses keyHash as ID.
    // But the requirement says: Response { apiKey: "...", keyId: "..." }
    // And Revoke: DELETE /admin/keys/:keyId
    // If I use keyHash as keyId, that leaks the hash?
    // No, keyHash is the hash of the key.
    // If I give keyHash as keyId, the admin can revoke it.
    // Is it safe to expose keyHash?
    // Usually yes, it's a SHA256 of a high entropy secret.
    // But maybe I should add a separate ID?
    // Again, schema constraints.
    // Schema: ApiKey { keyHash String @id, projectId String, createdAt BigInt, revokedAt BigInt? }
    // So keyHash IS the identifier.
    // I will use keyHash as keyId for now, or maybe I should add an ID column?
    // If I can't change schema, I must use keyHash as keyId.

    await prisma.apiKey.create({
      data: {
        keyHash,
        projectId,
        createdAt: BigInt(Date.now()),
      },
    });

    res.status(201).json({
      apiKey: key,
      keyId: keyHash, // Using keyHash as keyId
    });
  } catch (err) {
    console.error("Failed to create API key:", err);
    res.status(500).json({ error: "Failed to create API key" });
  }
});

// 4. Revoke API Key
adminRouter.delete("/keys/:keyId", async (req, res) => {
  const { keyId } = req.params; // This is keyHash

  try {
    await prisma.apiKey.update({
      where: { keyHash: keyId },
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
