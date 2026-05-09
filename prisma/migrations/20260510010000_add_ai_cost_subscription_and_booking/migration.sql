-- AI 平台月订阅成本 + 月度入账记录
-- ===================================
-- 老板要把 AI 看板的实时 token 花费 + 各 SaaS 月订阅（Coze Credit / Perplexity
-- / Manus / MiniMax 等）合算成公司成本，让凭证编制员 AI 月底按 vendor / 员工
-- 分笔写 voucher 入账（PR-C 实现）。这条 migration 只建表 + 关系。
--
-- AiCostSubscription：老板手动录入的固定月费订阅
-- AiCostBooking：每月度按 (员工 token 费 / 订阅月费) 分笔入账记录，防重复

-- ============================================================================
-- AiCostSubscription: AI 平台月订阅
-- ============================================================================
CREATE TABLE "AiCostSubscription" (
    "id" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "monthlyHkd" DECIMAL(12, 2) NOT NULL,
    "monthlyAmountOriginal" DECIMAL(12, 2),
    "currencyOriginal" TEXT,
    "billingDay" INTEGER NOT NULL DEFAULT 1,
    "purposeAccount" TEXT NOT NULL DEFAULT '管理费用-AI 服务费',
    "fundingAccount" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCostSubscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiCostSubscription_vendor_idx" ON "AiCostSubscription"("vendor");
CREATE INDEX "AiCostSubscription_active_startedAt_idx" ON "AiCostSubscription"("active", "startedAt");

ALTER TABLE "AiCostSubscription" ADD CONSTRAINT "AiCostSubscription_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- AiCostBooking: 月度入账记录（防重复）
-- ============================================================================
-- 一个月份 + (员工 OR 订阅) = 唯一行。换言之每月每个员工一行 token 费、每月
-- 每个订阅一行月费。入账后 voucherId 指向写好的 voucher，删 voucher 时
-- SetNull 不级联删本表（保留入账历史用于审计）。
CREATE TABLE "AiCostBooking" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "aiEmployeeId" TEXT,
    "subscriptionId" TEXT,
    "voucherId" TEXT,
    "totalHkd" DECIMAL(12, 2) NOT NULL,
    "meta" JSONB,
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bookedById" TEXT,

    CONSTRAINT "AiCostBooking_pkey" PRIMARY KEY ("id")
);

-- 一个月份 × 员工 × 订阅组合唯一。NULL 在 Postgres unique 里多个 NULL 算
-- 不冲突，所以 (2026-04, employee=A, sub=null) 跟 (2026-04, employee=B, sub=null)
-- 不冲突；(2026-04, employee=A, sub=null) 不会插第二次。
CREATE UNIQUE INDEX "AiCostBooking_month_aiEmployeeId_subscriptionId_key"
  ON "AiCostBooking"("month", "aiEmployeeId", "subscriptionId");

CREATE INDEX "AiCostBooking_month_idx" ON "AiCostBooking"("month");
CREATE INDEX "AiCostBooking_voucherId_idx" ON "AiCostBooking"("voucherId");

ALTER TABLE "AiCostBooking" ADD CONSTRAINT "AiCostBooking_aiEmployeeId_fkey"
  FOREIGN KEY ("aiEmployeeId") REFERENCES "AiEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiCostBooking" ADD CONSTRAINT "AiCostBooking_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "AiCostSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiCostBooking" ADD CONSTRAINT "AiCostBooking_voucherId_fkey"
  FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiCostBooking" ADD CONSTRAINT "AiCostBooking_bookedById_fkey"
  FOREIGN KEY ("bookedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
