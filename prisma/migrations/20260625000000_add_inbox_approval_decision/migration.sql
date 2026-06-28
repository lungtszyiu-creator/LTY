-- CreateTable
CREATE TABLE "InboxApprovalDecision" (
    "id" TEXT NOT NULL,
    "itemPath" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "approvedDept" TEXT,
    "approvedType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),
    "originalGuessedDept" TEXT,
    "originalGuessedType" TEXT,
    "originalSummary" TEXT,
    "originalConfidence" DOUBLE PRECISION,

    CONSTRAINT "InboxApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboxApprovalDecision_itemPath_key" ON "InboxApprovalDecision"("itemPath");

-- CreateIndex
CREATE INDEX "InboxApprovalDecision_status_decidedAt_idx" ON "InboxApprovalDecision"("status", "decidedAt");

-- CreateIndex
CREATE INDEX "InboxApprovalDecision_decidedById_decidedAt_idx" ON "InboxApprovalDecision"("decidedById", "decidedAt");

