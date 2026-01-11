import "dotenv/config";
import { PrismaClient } from "../../node_modules/.prisma/client/client.js";

export const prisma = new PrismaClient();
