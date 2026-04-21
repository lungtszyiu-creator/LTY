-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "annualLeaveBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "compLeaveBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LeaveBalanceLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pool" TEXT NOT NULL,
    "deltaDays" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "approvalInstanceId" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveBalanceLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveBalanceLedger_userId_pool_createdAt_idx" ON "LeaveBalanceLedger"("userId", "pool", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalanceLedger_approvalInstanceId_pool_key" ON "LeaveBalanceLedger"("approvalInstanceId", "pool");

-- AddForeignKey
ALTER TABLE "LeaveBalanceLedger"
  ADD CONSTRAINT "LeaveBalanceLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LeaveBalanceLedger_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
