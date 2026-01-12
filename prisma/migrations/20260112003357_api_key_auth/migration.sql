-- CreateTable
CREATE TABLE "api_keys" (
    "keyHash" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,
    "revokedAt" BIGINT,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("keyHash")
);
