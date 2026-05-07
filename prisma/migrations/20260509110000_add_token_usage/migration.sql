-- AI Token 监控表（Step 2）
-- ============================================
-- 一行 = 一次 LLM 调用记录，看板服务端按 createdAt 聚合算预算。
-- costHkd Decimal(12,6) 防精度丢失。
-- onDelete CASCADE：员工被硬删时连带清掉历史，符合 SUPER_ADMIN 删员工
-- 时"无业务行才能删"的语义。

CREATE TABLE "TokenUsage" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costHkd" DECIMAL(12,6) NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TokenUsage_createdAt_idx" ON "TokenUsage"("createdAt");
CREATE INDEX "TokenUsage_employeeId_createdAt_idx" ON "TokenUsage"("employeeId", "createdAt");
CREATE INDEX "TokenUsage_model_idx" ON "TokenUsage"("model");

ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "AiEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
