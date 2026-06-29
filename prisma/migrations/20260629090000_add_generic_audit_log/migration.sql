-- CreateTable
CREATE TABLE "GenericAuditLog" (
    "id" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorName" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenericAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenericAuditLog_resourceType_resourceId_createdAt_idx" ON "GenericAuditLog"("resourceType", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "GenericAuditLog_actorId_createdAt_idx" ON "GenericAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "GenericAuditLog_action_createdAt_idx" ON "GenericAuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "GenericAuditLog_resourceType_action_createdAt_idx" ON "GenericAuditLog"("resourceType", "action", "createdAt");

-- CreateIndex
CREATE INDEX "GenericAuditLog_createdAt_idx" ON "GenericAuditLog"("createdAt");

