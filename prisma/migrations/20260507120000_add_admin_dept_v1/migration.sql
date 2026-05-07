-- 行政部看板 v1 ：证照 / 资产 / 用品 / 会议室 + 预定 / IT 工单 / 应急演练 / 巡检
-- 嵌入 LTY 公司总看板，权限走 DepartmentMembership(slug='admin')

-- CreateTable
CREATE TABLE "AdminLicense" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expireAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "responsibleId" TEXT,
    "vaultPath" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdByAi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminLicense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminFixedAsset" (
    "id" TEXT NOT NULL,
    "assetCode" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "purchasePrice" DECIMAL(18,2),
    "currency" TEXT DEFAULT 'HKD',
    "status" TEXT NOT NULL DEFAULT 'IN_USE',
    "responsibleId" TEXT,
    "vaultPath" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdByAi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminFixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSupply" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "unit" TEXT DEFAULT '件',
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "safetyStock" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSupply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminMeetingRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "equipment" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminMeetingRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminMeetingReservation" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "bookedById" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT,
    "attendeeCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminMeetingReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminItTicket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "faultDesc" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handlerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "vaultPath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminItTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminEmergencyDrill" (
    "id" TEXT NOT NULL,
    "drillType" TEXT NOT NULL,
    "conductedAt" TIMESTAMP(3) NOT NULL,
    "participants" INTEGER NOT NULL DEFAULT 0,
    "findings" TEXT,
    "reportPath" TEXT,
    "conductedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminEmergencyDrill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminInspection" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "inspectionType" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "issuesFound" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reportPath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminInspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminLicense_status_expireAt_idx" ON "AdminLicense"("status", "expireAt");
CREATE INDEX "AdminLicense_responsibleId_idx" ON "AdminLicense"("responsibleId");
CREATE UNIQUE INDEX "AdminFixedAsset_assetCode_key" ON "AdminFixedAsset"("assetCode");
CREATE INDEX "AdminFixedAsset_category_status_idx" ON "AdminFixedAsset"("category", "status");
CREATE INDEX "AdminFixedAsset_responsibleId_idx" ON "AdminFixedAsset"("responsibleId");
CREATE INDEX "AdminSupply_currentStock_safetyStock_idx" ON "AdminSupply"("currentStock", "safetyStock");
CREATE UNIQUE INDEX "AdminMeetingRoom_name_key" ON "AdminMeetingRoom"("name");
CREATE INDEX "AdminMeetingReservation_roomId_startAt_idx" ON "AdminMeetingReservation"("roomId", "startAt");
CREATE INDEX "AdminMeetingReservation_bookedById_idx" ON "AdminMeetingReservation"("bookedById");
CREATE UNIQUE INDEX "AdminItTicket_ticketNumber_key" ON "AdminItTicket"("ticketNumber");
CREATE INDEX "AdminItTicket_status_reportedAt_idx" ON "AdminItTicket"("status", "reportedAt");
CREATE INDEX "AdminItTicket_reporterId_idx" ON "AdminItTicket"("reporterId");
CREATE INDEX "AdminEmergencyDrill_drillType_conductedAt_idx" ON "AdminEmergencyDrill"("drillType", "conductedAt");
CREATE INDEX "AdminInspection_month_inspectionType_idx" ON "AdminInspection"("month", "inspectionType");

-- AddForeignKey
ALTER TABLE "AdminLicense" ADD CONSTRAINT "AdminLicense_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminLicense" ADD CONSTRAINT "AdminLicense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminFixedAsset" ADD CONSTRAINT "AdminFixedAsset_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminFixedAsset" ADD CONSTRAINT "AdminFixedAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminMeetingReservation" ADD CONSTRAINT "AdminMeetingReservation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "AdminMeetingRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminMeetingReservation" ADD CONSTRAINT "AdminMeetingReservation_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminItTicket" ADD CONSTRAINT "AdminItTicket_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminItTicket" ADD CONSTRAINT "AdminItTicket_handlerId_fkey" FOREIGN KEY ("handlerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminEmergencyDrill" ADD CONSTRAINT "AdminEmergencyDrill_conductedById_fkey" FOREIGN KEY ("conductedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminInspection" ADD CONSTRAINT "AdminInspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: 创建行政部 Department 记录（slug='admin'），idempotent —— 已存在就更新 description
INSERT INTO "Department" ("id", "name", "slug", "description", "order", "active", "createdAt", "updatedAt")
VALUES ('dept_admin_seed_v1', '行政部', 'admin', '证照 / 资产 / 设施 / 应急 / 巡检', 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
