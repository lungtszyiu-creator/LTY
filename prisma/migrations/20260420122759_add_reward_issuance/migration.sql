-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "rewardId" TEXT;

-- CreateTable
CREATE TABLE "RewardIssuance" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "rewardText" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardIssuance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RewardIssuance_recipientId_status_idx" ON "RewardIssuance"("recipientId", "status");

-- CreateIndex
CREATE INDEX "RewardIssuance_status_createdAt_idx" ON "RewardIssuance"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardIssuance_taskId_recipientId_key" ON "RewardIssuance"("taskId", "recipientId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "RewardIssuance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardIssuance" ADD CONSTRAINT "RewardIssuance_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardIssuance" ADD CONSTRAINT "RewardIssuance_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardIssuance" ADD CONSTRAINT "RewardIssuance_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
