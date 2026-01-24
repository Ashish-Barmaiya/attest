/*
  Warnings:

  - You are about to drop the `anchor_runs` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "AnchorStatus" AS ENUM ('success', 'failed');

-- DropTable
DROP TABLE "anchor_runs";

-- CreateTable
CREATE TABLE "anchor_reports" (
    "id" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AnchorStatus" NOT NULL,
    "projectCount" INTEGER,
    "anchorFile" TEXT,
    "gitCommit" TEXT,
    "error" TEXT,

    CONSTRAINT "anchor_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anchor_reports_time_idx" ON "anchor_reports"("time");
