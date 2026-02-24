import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const projectId = "my-app-prod";
  const head = await prisma.chainHead.findUnique({ where: { projectId } });
  if (!head) {
    console.error(`Project ${projectId} not found.`);
    process.exit(1);
  }
  const targetSeq = Math.max(1, head.lastSequence - 10);

  // The demo wants exactly this output
  console.log(
    `> UPDATE audit_events SET payload = '{"action": "grant_admin"}' WHERE sequence = ${targetSeq};`,
  );

  // Target an event a few sequences back from the head
  await prisma.$executeRaw`
    UPDATE audit_events 
    SET "payloadJson" = '{"action": "grant_admin", "user": "hacker"}' 
    WHERE "projectId" = ${projectId} AND sequence = ${targetSeq}
  `;
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
