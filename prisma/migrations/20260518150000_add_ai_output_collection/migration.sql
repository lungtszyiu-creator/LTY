-- AI 输出归集（防 vault 污染 paradigm · 5/18 起）
-- =====================================================
-- Maggie 5/18 反馈：法务部 8 个 Bot 输出（合同审查 3 文本 / 牌照答疑 / 周报）
-- 不能直接写 vault，会污染人工整理后的目录。
-- 修法：AI 产出 → AiOutput 表 (reviewStatus=pending_human_review) → 人工审核 →
-- approved 后系统才自动 commit 到 vault。rejected 留 audit 不入 vault。
--
-- 通用性：deptSlug 是 String 不绑 enum，初期接 lty-legal / mc-legal 8 个 Bot，
-- 后续行政/HR/财务 Bot 想做"审核 inbox"流时直接复用本表。

CREATE TABLE "AiOutput" (
    "id" TEXT NOT NULL,
    "outputId" TEXT,
    "agentName" TEXT NOT NULL,
    "deptSlug" TEXT NOT NULL,
    "outputType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentMarkdown" TEXT NOT NULL,
    "revisedDoc" TEXT,
    "cleanDoc" TEXT,
    "sourceInput" TEXT,
    "metadata" JSONB,
    "triggeredBy" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending_human_review',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "vaultPath" TEXT,
    "vaultCommitSha" TEXT,
    "vaultCommittedAt" TIMESTAMP(3),
    "apiKeyId" TEXT,
    "tokenCostHkd" DECIMAL(12,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiOutput_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiOutput_outputId_key" ON "AiOutput"("outputId");
CREATE INDEX "AiOutput_deptSlug_reviewStatus_createdAt_idx" ON "AiOutput"("deptSlug", "reviewStatus", "createdAt");
CREATE INDEX "AiOutput_outputType_idx" ON "AiOutput"("outputType");
CREATE INDEX "AiOutput_reviewedById_idx" ON "AiOutput"("reviewedById");

ALTER TABLE "AiOutput"
    ADD CONSTRAINT "AiOutput_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiOutput"
    ADD CONSTRAINT "AiOutput_apiKeyId_fkey"
    FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
