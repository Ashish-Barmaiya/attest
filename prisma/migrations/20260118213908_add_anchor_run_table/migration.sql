-- CreateTable
CREATE TABLE "anchor_runs" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "projectCount" INTEGER,
    "anchorFile" TEXT,
    "gitCommit" TEXT,
    "anchorCommit" TEXT,
    "previousAnchorCommit" TEXT,

    CONSTRAINT "anchor_runs_pkey" PRIMARY KEY ("id")
);
