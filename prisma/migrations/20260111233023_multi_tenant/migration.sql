-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_head" (
    "projectId" TEXT NOT NULL,
    "lastSequence" INTEGER NOT NULL,
    "lastChainHash" TEXT NOT NULL,

    CONSTRAINT "chain_head_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "projectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "prevChainHash" TEXT NOT NULL,
    "chainHash" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("projectId","sequence")
);
