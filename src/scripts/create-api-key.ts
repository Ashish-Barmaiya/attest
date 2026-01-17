import { prisma } from "../db/database.js";
import crypto from "node:crypto";

async function createApiKey(projectId: string) {
  // 1. Generate high-entropy key (32 bytes = 256 bits)
  const key = crypto.randomBytes(32).toString("hex");

  // 2. Hash it (SHA-256)
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");

  // 3. Store in DB
  await prisma.apiKey.create({
    data: {
      keyHash,
      projectId,
      createdAt: BigInt(Date.now()),
    },
  });

  console.log(`\nAPI Key created for project: ${projectId}`);
  console.log(`Key: ${key}`);
  console.log(`Store this key safely. It will NOT be shown again.\n`);
}

const projectId = process.argv[2];

if (!projectId) {
  console.error("Usage: npx tsx src/scripts/create-api-key.ts <project-id>");
  process.exit(1);
}

createApiKey(projectId)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
