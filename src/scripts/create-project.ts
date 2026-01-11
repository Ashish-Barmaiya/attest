import { prisma } from "../db/database.js";
import { randomUUID } from "crypto";

const projectId = randomUUID();

await prisma.project.create({
  data: {
    id: projectId,
    createdAt: BigInt(Date.now()),
  },
});

await prisma.chainHead.create({
  data: {
    projectId,
    lastSequence: 0,
    lastChainHash: "GENESIS",
  },
});

console.log("Project created:", projectId);
