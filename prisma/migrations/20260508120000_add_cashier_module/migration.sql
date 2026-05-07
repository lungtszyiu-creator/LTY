-- 出纳部业务表（PR F · 增量层）
-- PR #41 已 seed Department slug='cashier'，本迁移补 6 张业务表。
-- ⭐ CashierComplianceEntry.dualLayer = REAL/COMPLIANCE/BOTH 双层结构

-- CashierTodo
CREATE TABLE "CashierTodo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "dueAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdByAi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashierTodo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CashierTodo_status_dueAt_idx" ON "CashierTodo"("status", "dueAt");
CREATE INDEX "CashierTodo_ownerId_idx" ON "CashierTodo"("ownerId");
ALTER TABLE "CashierTodo" ADD CONSTRAINT "CashierTodo_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CashierReimbursement
CREATE TABLE "CashierReimbursement" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "occurredOn" TIMESTAMP(3),
    "department" TEXT,
    "reason" TEXT,
    "receiptVaultPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "approvalInstanceId" TEXT,
    "notes" TEXT,
    "createdByAi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashierReimbursement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CashierReimbursement_applicantId_status_idx" ON "CashierReimbursement"("applicantId", "status");
CREATE INDEX "CashierReimbursement_status_createdAt_idx" ON "CashierReimbursement"("status", "createdAt");
CREATE INDEX "CashierReimbursement_category_occurredOn_idx" ON "CashierReimbursement"("category", "occurredOn");
ALTER TABLE "CashierReimbursement" ADD CONSTRAINT "CashierReimbursement_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashierReimbursement" ADD CONSTRAINT "CashierReimbursement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CashierReconciliationTask
CREATE TABLE "CashierReconciliationTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reconType" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "ownerRole" TEXT,
    "ownerId" TEXT,
    "description" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "completionNote" TEXT,
    "notes" TEXT,
    "createdByAi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashierReconciliationTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CashierReconciliationTask_status_dueAt_idx" ON "CashierReconciliationTask"("status", "dueAt");
CREATE INDEX "CashierReconciliationTask_reconType_dueAt_idx" ON "CashierReconciliationTask"("reconType", "dueAt");
ALTER TABLE "CashierReconciliationTask" ADD CONSTRAINT "CashierReconciliationTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CashierComplianceEntry
CREATE TABLE "CashierComplianceEntry" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT,
    "cycle" TEXT,
    "nextDueAt" TIMESTAMP(3),
    "responsibleId" TEXT,
    "responsibleName" TEXT,
    "dualLayer" TEXT NOT NULL DEFAULT 'REAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "vaultPath" TEXT,
    "notes" TEXT,
    "createdByAi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashierComplianceEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CashierComplianceEntry_category_status_idx" ON "CashierComplianceEntry"("category", "status");
CREATE INDEX "CashierComplianceEntry_category_nextDueAt_idx" ON "CashierComplianceEntry"("category", "nextDueAt");
CREATE INDEX "CashierComplianceEntry_dualLayer_idx" ON "CashierComplianceEntry"("dualLayer");
ALTER TABLE "CashierComplianceEntry" ADD CONSTRAINT "CashierComplianceEntry_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CashierBudget (UI 留 v1.1)
CREATE TABLE "CashierBudget" (
    "id" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "month" INTEGER,
    "category" TEXT NOT NULL,
    "department" TEXT,
    "planAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "actualAmount" DECIMAL(18,2),
    "notes" TEXT,
    "createdById" TEXT,
    "createdByAi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashierBudget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CashierBudget_fiscalYear_month_category_department_currency_key" ON "CashierBudget"("fiscalYear", "month", "category", "department", "currency");
CREATE INDEX "CashierBudget_fiscalYear_month_idx" ON "CashierBudget"("fiscalYear", "month");

-- CashierMonthlySettlement (UI 留 v1.1)
CREATE TABLE "CashierMonthlySettlement" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "reimbursementTotal" DECIMAL(18,2),
    "payrollTotal" DECIMAL(18,2),
    "incomeTotal" DECIMAL(18,2),
    "expenseTotal" DECIMAL(18,2),
    "netProfit" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMP(3),
    "generatedById" TEXT,
    "notes" TEXT,
    "createdByAi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashierMonthlySettlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CashierMonthlySettlement_period_key" ON "CashierMonthlySettlement"("period");
