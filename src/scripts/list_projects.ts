import { prisma } from "../db/database.js";

async function listProjects() {
  const allProjects = await prisma.project.findMany();
  console.log(`Found ${allProjects.length} projects.`);

  for (const p of allProjects) {
    const count = await prisma.auditEvent.count({
      where: { projectId: p.id },
    });
    console.log(`Project: ${p.id}, Events: ${count}`);
  }
}

listProjects()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
