-- CreateTable
CREATE TABLE "IngestRequest" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT,
    "commitSha" TEXT,
    "errorMessage" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "IngestRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestRequest_status_requestedAt_idx" ON "IngestRequest"("status", "requestedAt");
