import { prisma } from "../db/database.js";
import fs from "fs";
import path from "path";

async function main() {
  const anchorDir = process.env.ANCHOR_DIR;
  if (!anchorDir) {
    console.error("ANCHOR_DIR env var is not set");
    process.exit(1);
  }

  if (!fs.existsSync(anchorDir)) {
    console.error(`ANCHOR_DIR ${anchorDir} does not exist`);
    process.exit(1);
  }

  console.log(`Writing anchors to ${anchorDir}...`);

  const heads = await prisma.chainHead.findMany();
  let count = 0;

  for (const head of heads) {
    const anchorPayload = {
      projectId: head.projectId,
      lastSequence: head.lastSequence,
      lastChainHash: head.lastChainHash,
      anchoredAt: Date.now(),
      anchorCommit: null,
      previousAnchorCommit: null,
    };

    const filePath = path.join(anchorDir, `project-${head.projectId}.json`);

    try {
      fs.writeFileSync(filePath, JSON.stringify(anchorPayload, null, 2));
      count++;
    } catch (err) {
      console.error(
        `Failed to write anchor for project ${head.projectId}:`,
        err
      );
      process.exit(1);
    }
  }

  console.log(`Successfully anchored ${count} projects.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
