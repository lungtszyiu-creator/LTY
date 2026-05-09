-- AlterTable
ALTER TABLE "PendingUpload" ADD COLUMN "targetVault" TEXT NOT NULL DEFAULT 'lty-vault';

-- CreateIndex
CREATE INDEX "PendingUpload_targetVault_status_idx" ON "PendingUpload"("targetVault", "status");
