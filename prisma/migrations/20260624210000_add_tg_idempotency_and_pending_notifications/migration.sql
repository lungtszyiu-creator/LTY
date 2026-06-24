-- DropForeignKey
ALTER TABLE "HrRoster" DROP CONSTRAINT "HrRoster_linkedUserId_fkey";

-- AlterTable
ALTER TABLE "Submission" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "HrRoster";

-- DropTable
DROP TABLE "VaultCompanyMirror";

-- CreateTable
CREATE TABLE "ProcessedTGUpdate" (
    "id" TEXT NOT NULL,
    "updateId" BIGINT NOT NULL,
    "chatId" BIGINT,
    "messageId" INTEGER,
    "fromUserId" BIGINT,
    "updateKind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedTGUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingTelegramNotification" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'bridge',
    "botKey" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "messageId" INTEGER,
    "text" TEXT NOT NULL,
    "parseMode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "context" JSONB,
    "lastTriedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingTelegramNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedTGUpdate_updateId_key" ON "ProcessedTGUpdate"("updateId");

-- CreateIndex
CREATE INDEX "ProcessedTGUpdate_createdAt_idx" ON "ProcessedTGUpdate"("createdAt");

-- CreateIndex
CREATE INDEX "ProcessedTGUpdate_chatId_createdAt_idx" ON "ProcessedTGUpdate"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "PendingTelegramNotification_status_createdAt_idx" ON "PendingTelegramNotification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PendingTelegramNotification_createdAt_idx" ON "PendingTelegramNotification"("createdAt");

