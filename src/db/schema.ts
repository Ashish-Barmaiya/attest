import { prisma } from "./database.js";

export async function initDb() {
  const genesis = await prisma.chainHead.findUnique({
    where: { projectId: "1" },
  });

  if (!genesis) {
    await prisma.chainHead.create({
      data: {
        projectId: "1",
        lastSequence: 0,
        lastChainHash: "GENESIS",
      },
    });
    console.log("Initialized Genesis block");
  }
}
