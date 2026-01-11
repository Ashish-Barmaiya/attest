import { prisma } from "../db/database.js";

await prisma.$queryRaw`SELECT 1`;
console.log("Prisma OK");
