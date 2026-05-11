-- 凭证操作审计 VoucherAuditLog
-- ===================================
-- 凭证每次 create / edit / approve / reject / void / delete 都写一条 audit log，
-- 老板与出纳都可在凭证详情页看到完整改动时间线，保证账目可追溯（合规要求）。
--
-- 配套权限调整（在 API 层）：
-- 出纳（VIEWER）可在 AI_DRAFT/BOSS_REVIEWING 状态下 PATCH action='edit'，
-- 但 approve/reject/void 仍仅限 EDITOR（老板）。所有改动都留 audit log 痕迹。

CREATE TABLE "VoucherAuditLog" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changedById" TEXT,
    "byAi" TEXT,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoucherAuditLog_voucherId_createdAt_idx" ON "VoucherAuditLog"("voucherId", "createdAt");
CREATE INDEX "VoucherAuditLog_createdAt_idx" ON "VoucherAuditLog"("createdAt");

ALTER TABLE "VoucherAuditLog"
    ADD CONSTRAINT "VoucherAuditLog_voucherId_fkey"
    FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VoucherAuditLog"
    ADD CONSTRAINT "VoucherAuditLog_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
