-- CreateTable
CREATE TABLE "HrRoster" (
    "id" TEXT NOT NULL,
    "vaultPath" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "chineseName" TEXT,
    "englishName" TEXT,
    "employmentType" TEXT,
    "roles" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "monthlySalary" DECIMAL(18,2),
    "currency" TEXT,
    "probation" BOOLEAN NOT NULL DEFAULT false,
    "linkedUserId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawFrontmatter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrRoster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HrRoster_vaultPath_key" ON "HrRoster"("vaultPath");

-- CreateIndex
CREATE INDEX "HrRoster_status_idx" ON "HrRoster"("status");

-- CreateIndex
CREATE INDEX "HrRoster_linkedUserId_idx" ON "HrRoster"("linkedUserId");

-- AddForeignKey
ALTER TABLE "HrRoster" ADD CONSTRAINT "HrRoster_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
