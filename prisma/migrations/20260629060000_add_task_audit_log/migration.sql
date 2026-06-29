-- CreateTable
CREATE TABLE "TaskAuditLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorName" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskAuditLog_taskId_createdAt_idx" ON "TaskAuditLog"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskAuditLog_actorId_createdAt_idx" ON "TaskAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskAuditLog_action_createdAt_idx" ON "TaskAuditLog"("action", "createdAt");

