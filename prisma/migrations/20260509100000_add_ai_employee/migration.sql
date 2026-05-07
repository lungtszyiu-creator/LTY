-- AI 员工档案表（移植自 MC Markets，适配 LTY）
-- ============================================
-- 关联 LTY 现有 ApiKey 表（apiKeyId 1-1 可空），不另起 apiKeyHash 字段。
-- group 用 String 存 LTY Department.slug，柔性不绑 enum。
-- reportsToId / isSupervisor 一次性放进 schema，UI 在 Step 4 才暴露 ——
-- 避免后续 ALTER TABLE。

CREATE TABLE "AiEmployee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "deptSlug" TEXT,
    "layer" INTEGER NOT NULL DEFAULT 3,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "dailyLimitHkd" DECIMAL(12,2) NOT NULL DEFAULT 1000,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "pausedAt" TIMESTAMP(3),
    "pauseReason" TEXT,
    "apiKeyId" TEXT,
    "webhookUrl" TEXT,
    "lastActiveAt" TIMESTAMP(3),
    "reportsToId" TEXT,
    "isSupervisor" BOOLEAN NOT NULL DEFAULT false,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEmployee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiEmployee_apiKeyId_key" ON "AiEmployee"("apiKeyId");
CREATE INDEX "AiEmployee_active_paused_idx" ON "AiEmployee"("active", "paused");
CREATE INDEX "AiEmployee_deptSlug_idx" ON "AiEmployee"("deptSlug");
CREATE INDEX "AiEmployee_lastActiveAt_idx" ON "AiEmployee"("lastActiveAt");
CREATE INDEX "AiEmployee_isSupervisor_idx" ON "AiEmployee"("isSupervisor");
CREATE INDEX "AiEmployee_reportsToId_idx" ON "AiEmployee"("reportsToId");

ALTER TABLE "AiEmployee" ADD CONSTRAINT "AiEmployee_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiEmployee" ADD CONSTRAINT "AiEmployee_reportsToId_fkey"
  FOREIGN KEY ("reportsToId") REFERENCES "AiEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
