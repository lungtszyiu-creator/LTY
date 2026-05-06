-- Add finance payment proof fields to ApprovalInstance (A1 phase, 2026-05-06)
-- Used only when template.slug='finance-large-payment'.
-- State machine: IN_PROGRESS -> APPROVED+aiPaymentStatus=WAITING_PAYMENT -> proof attached -> POSTED
ALTER TABLE "ApprovalInstance"
  ADD COLUMN "aiPaymentStatus" TEXT,
  ADD COLUMN "paymentProofs"   TEXT,
  ADD COLUMN "tgAckMessageId"  INTEGER;

-- Index for CFO weekly catchup query: WAITING_PAYMENT older than 72h
CREATE INDEX "ApprovalInstance_aiPaymentStatus_completedAt_idx"
  ON "ApprovalInstance" ("aiPaymentStatus", "completedAt");

-- Index for bridge to look up instance by Telegram ack message_id when boss replies "批"/"驳"
CREATE INDEX "ApprovalInstance_tgAckMessageId_idx"
  ON "ApprovalInstance" ("tgAckMessageId");
