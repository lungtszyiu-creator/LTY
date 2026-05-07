-- 法务部 v1 · LTY 自家 + MC Markets 双部门嵌入
-- MC Markets 数据红线：物理隔离两套表 LtyLegalRequest + McLegalRequest

-- CreateTable
CREATE TABLE "LtyLegalRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "requesterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "vaultPath" TEXT,
    "notes" TEXT,
    "createdByAi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LtyLegalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McLegalRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "requesterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "vaultPath" TEXT,
    "notes" TEXT,
    "createdByAi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McLegalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LtyLegalRequest_status_priority_idx" ON "LtyLegalRequest"("status", "priority");
CREATE INDEX "LtyLegalRequest_requesterId_idx" ON "LtyLegalRequest"("requesterId");
CREATE INDEX "LtyLegalRequest_assigneeId_idx" ON "LtyLegalRequest"("assigneeId");
CREATE INDEX "McLegalRequest_status_priority_idx" ON "McLegalRequest"("status", "priority");
CREATE INDEX "McLegalRequest_requesterId_idx" ON "McLegalRequest"("requesterId");
CREATE INDEX "McLegalRequest_assigneeId_idx" ON "McLegalRequest"("assigneeId");

-- AddForeignKey
ALTER TABLE "LtyLegalRequest" ADD CONSTRAINT "LtyLegalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LtyLegalRequest" ADD CONSTRAINT "LtyLegalRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "McLegalRequest" ADD CONSTRAINT "McLegalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "McLegalRequest" ADD CONSTRAINT "McLegalRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: 创建 LTY 法务 + MC 法务 两个 Department 记录
INSERT INTO "Department" ("id", "name", "slug", "description", "order", "active", "createdAt", "updatedAt")
VALUES ('dept_lty_legal_seed_v1', 'LTY 法务部', 'lty-legal', '合同审 / 知识产权 / 合规 / 争议处理（自家业务）', 110, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Department" ("id", "name", "slug", "description", "order", "active", "createdAt", "updatedAt")
VALUES ('dept_mc_legal_seed_v1', 'MC 法务部', 'mc-legal', 'MC Markets 外包业务（数据物理隔离）', 120, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
