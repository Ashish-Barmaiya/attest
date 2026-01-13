/*
  Warnings:

  - Made the column `name` on table `projects` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "name" SET NOT NULL;
