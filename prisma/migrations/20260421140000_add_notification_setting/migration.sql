-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "extraUserIds" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSetting_kind_key" ON "NotificationSetting"("kind");
