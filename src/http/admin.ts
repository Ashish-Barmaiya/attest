import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/database.js";
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const adminRouter = Router();

/* ---------------------------------
   Zod Validation Middleware
---------------------------------- */

function validate(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validData = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      }) as { body: any; query: any; params: any };

      // 1. We can safely overwrite the body object
      req.body = validData.body;

      // 2. We must assign keys individually for query and params to avoid Express getter errors
      for (const key of Object.keys(validData.query)) {
        req.query[key] = validData.query[key];
      }
      for (const key of Object.keys(validData.params)) {
        req.params[key] = validData.params[key];
      }

      next();
    } catch (error: any) {
      if (error && Array.isArray(error.issues)) {
        return res.status(400).json({
          error: "Bad Request: Invalid Input",
          details: error.issues,
        });
      }
      next(error);
    }
  };
}

/* --------------------------------
   Validation Schemas
---------------------------------- */

const createProjectSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(3).max(255),
    })
    .strict(),
  query: z.any(),
  params: z.any(),
});

const projectIdParamSchema = z.object({
  params: z.object({
    projectId: z.string().uuid(),
  }),
  body: z.any(),
  query: z.any(),
});

const keyIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.any(),
  query: z.any(),
});

const anchorReportSchema = z.object({
  body: z
    .object({
      status: z.enum(["success", "failed"]),
      projectCount: z.number().int().min(0).optional().nullable().default(null),
      anchorFile: z
        .string()
        .max(1024)
        .optional()
        .nullable()
        // If the CLI sends an empty string, convert it to null for the database
        .transform((val) => (val === "" ? null : val))
        .default(null),
      gitCommit: z
        .string()
        .max(40)
        .optional()
        .nullable()
        .transform((val) => (val === "" ? null : val))
        .default(null),
      error: z
        .string()
        .max(2048)
        .optional()
        .nullable()
        .transform((val) => (val === "" ? null : val))
        .default(null),
    })
    .strict(),
  query: z.any(),
  params: z.any(),
});

const getAnchorReportsSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
  body: z.any(),
  params: z.any(),
});

/* -------------------------------
   Routes
---------------------------------- */

// 1. Create Project
adminRouter.post(
  "/projects",
  validate(createProjectSchema),
  async (req, res) => {
    const { name } = req.body as z.infer<typeof createProjectSchema>["body"];

    const projectId = randomUUID();
    const createdAt = BigInt(Date.now());

    try {
      await prisma.$transaction(async (tx) => {
        await tx.project.create({
          data: { id: projectId, name, createdAt },
        });

        await tx.chainHead.create({
          data: { projectId, lastSequence: 0, lastChainHash: "GENESIS" },
        });
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
  },
);

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

// 2b. Get Project Head
adminRouter.get(
  "/projects/:projectId/head",
  validate(projectIdParamSchema),
  async (req, res) => {
    const { projectId } = req.params as z.infer<
      typeof projectIdParamSchema
    >["params"];

    try {
      const head = await prisma.chainHead.findUnique({
        where: { projectId },
      });

      if (!head)
        return res.status(404).json({ error: "Project head not found" });
      res.json(head);
    } catch (err) {
      console.error("Failed to fetch project head:", err);
      res.status(500).json({ error: "Failed to fetch project head" });
    }
  },
);

// 3. Create API Key
adminRouter.post(
  "/projects/:projectId/keys",
  validate(projectIdParamSchema),
  async (req, res) => {
    const { projectId } = req.params as z.infer<
      typeof projectIdParamSchema
    >["params"];

    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) return res.status(404).json({ error: "Project not found" });
      if (project.tombstonedAt)
        return res.status(403).json({ error: "Project is tombstoned" });

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
  },
);

// 4. Revoke API Key
adminRouter.delete(
  "/keys/:id",
  validate(keyIdParamSchema),
  async (req, res) => {
    const { id } = req.params as z.infer<typeof keyIdParamSchema>["params"];

    try {
      const key = await prisma.apiKey.findUnique({ where: { id } });
      if (!key) return res.status(404).json({ error: "Key not found" });

      const project = await prisma.project.findUnique({
        where: { id: key.projectId },
      });

      if (project && project.tombstonedAt) {
        return res.status(403).json({ error: "Project is tombstoned" });
      }

      await prisma.apiKey.update({
        where: { id },
        data: { revokedAt: BigInt(Date.now()) },
      });

      res.status(204).send();
    } catch (err) {
      console.error("Failed to revoke key:", err);
      res.status(500).json({ error: "Failed to revoke key" });
    }
  },
);

// 5. Export Events
adminRouter.get(
  "/projects/:projectId/events",
  validate(projectIdParamSchema),
  async (req, res) => {
    const { projectId } = req.params as z.infer<
      typeof projectIdParamSchema
    >["params"];

    try {
      const events = await prisma.auditEvent.findMany({
        where: { projectId },
        orderBy: { sequence: "asc" },
      });

      const result = events.map((e) => ({
        ...e,
        createdAt: e.createdAt.toString(),
      }));

      res.json(result);
    } catch (err) {
      console.error("Failed to export events:", err);
      res.status(500).json({ error: "Failed to export events" });
    }
  },
);

// 6. Tombstone Project
adminRouter.post(
  "/projects/:projectId/tombstone",
  validate(projectIdParamSchema),
  async (req, res) => {
    const { projectId } = req.params as z.infer<
      typeof projectIdParamSchema
    >["params"];

    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) return res.status(404).json({ error: "Project not found" });
      if (project.tombstonedAt)
        return res.status(400).json({ error: "Project is already tombstoned" });

      await prisma.project.update({
        where: { id: projectId },
        data: { tombstonedAt: BigInt(Date.now()) },
      });

      res.json({
        message: "Project tombstoned",
        projectId,
        tombstonedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to tombstone project:", err);
      res
        .status(500)
        .json({ error: "Failed to tombstone project", details: String(err) });
    }
  },
);

// 7. Report Anchor Result
adminRouter.post(
  "/anchor-report",
  validate(anchorReportSchema),
  async (req, res) => {
    const { status, projectCount, anchorFile, gitCommit, error } =
      req.body as z.infer<typeof anchorReportSchema>["body"];

    try {
      await prisma.anchorReport.create({
        data: { status, projectCount, anchorFile, gitCommit, error },
      });

      res.json({ ok: true });
    } catch (err) {
      console.error("Failed to save anchor report:", err);
      res.status(500).json({ error: "Failed to save anchor report" });
    }
  },
);

// 8. Get Anchor Reports
adminRouter.get(
  "/anchor-reports",
  validate(getAnchorReportsSchema),
  async (req, res) => {
    const { limit } = req.query as unknown as z.infer<
      typeof getAnchorReportsSchema
    >["query"];

    try {
      const reports = await prisma.anchorReport.findMany({
        orderBy: { time: "desc" },
        take: limit,
      });

      res.json(reports);
    } catch (err) {
      console.error("Failed to fetch anchor reports:", err);
      res.status(500).json({ error: "Failed to fetch anchor reports" });
    }
  },
);
