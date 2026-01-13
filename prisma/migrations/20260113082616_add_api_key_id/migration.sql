/*
  Warnings:

  - The primary key for the `api_keys` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The required column `id` was added to the `api_keys` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_pkey",
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");
