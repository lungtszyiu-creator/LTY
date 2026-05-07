-- HR 部 v1 + 财务出纳部门 seed
--
-- HR：5 张表 HrPosition / HrCandidate / HrEmployeeProfile / HrPerformanceReview / HrPrivateMessage
-- 复用 LTY 现有 ApprovalInstance / Task / User / Doc / FAQ / Announcement
-- 试用期 30 天 + 证件 60 天 = HR 主页 banner 自动派生（不依赖 AI）
--
-- 财务出纳：仅 seed Department 'cashier'，UI 框架，数据接入留 PR I（等老板发出纳 7 张子页截图）

-- CreateTable
CREATE TABLE "HrPosition" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECRUITING',
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "deadline" TIMESTAMP(3),
    "leadId" TEXT,
    "notes" TEXT,
    "createdByAi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrCandidate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "positionId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'APPLIED',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumeUrl" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdByAi" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrEmployeeProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "department" TEXT,
    "positionTitle" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'FULL_TIME',
    "workLocation" TEXT NOT NULL DEFAULT 'ONSITE',
    "hireDate" TIMESTAMP(3),
    "probationEnd" TIMESTAMP(3),
    "contractEnd" TIMESTAMP(3),
    "idType" TEXT,
    "idNumber" TEXT,
    "idExpireAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "resignedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrEmployeeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPerformanceReview" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'GOAL_SETTING',
    "subjectId" TEXT NOT NULL,
    "evaluatorId" TEXT,
    "grade" TEXT,
    "score" INTEGER,
    "goals" TEXT,
    "selfReview" TEXT,
    "managerNote" TEXT,
    "hrFinalNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrPerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPrivateMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "hrReplyById" TEXT,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrPrivateMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrPosition_status_deadline_idx" ON "HrPosition"("status", "deadline");
CREATE INDEX "HrCandidate_stage_appliedAt_idx" ON "HrCandidate"("stage", "appliedAt");
CREATE INDEX "HrCandidate_positionId_idx" ON "HrCandidate"("positionId");
CREATE UNIQUE INDEX "HrEmployeeProfile_userId_key" ON "HrEmployeeProfile"("userId");
CREATE INDEX "HrEmployeeProfile_status_probationEnd_idx" ON "HrEmployeeProfile"("status", "probationEnd");
CREATE INDEX "HrEmployeeProfile_idExpireAt_idx" ON "HrEmployeeProfile"("idExpireAt");
CREATE UNIQUE INDEX "HrPerformanceReview_period_subjectId_key" ON "HrPerformanceReview"("period", "subjectId");
CREATE INDEX "HrPerformanceReview_period_phase_idx" ON "HrPerformanceReview"("period", "phase");
CREATE INDEX "HrPerformanceReview_subjectId_idx" ON "HrPerformanceReview"("subjectId");
CREATE INDEX "HrPrivateMessage_threadId_createdAt_idx" ON "HrPrivateMessage"("threadId", "createdAt");
CREATE INDEX "HrPrivateMessage_senderId_idx" ON "HrPrivateMessage"("senderId");

-- AddForeignKey
ALTER TABLE "HrPosition" ADD CONSTRAINT "HrPosition_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrCandidate" ADD CONSTRAINT "HrCandidate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "HrPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrCandidate" ADD CONSTRAINT "HrCandidate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrEmployeeProfile" ADD CONSTRAINT "HrEmployeeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HrPerformanceReview" ADD CONSTRAINT "HrPerformanceReview_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrPerformanceReview" ADD CONSTRAINT "HrPerformanceReview_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HrPrivateMessage" ADD CONSTRAINT "HrPrivateMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HrPrivateMessage" ADD CONSTRAINT "HrPrivateMessage_hrReplyById_fkey" FOREIGN KEY ("hrReplyById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: 创建 HR 部 + 财务出纳 部门记录
INSERT INTO "Department" ("id", "name", "slug", "description", "order", "active", "createdAt", "updatedAt")
VALUES ('dept_hr_seed_v1', '人事部', 'hr', '员工档案 / 招聘 / 绩效 / 试用期 + 证件到期监控', 130, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Department" ("id", "name", "slug", "description", "order", "active", "createdAt", "updatedAt")
VALUES ('dept_cashier_seed_v1', '出纳', 'cashier', '财务出纳专用看板（KPI 概览 + 录入）', 140, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
