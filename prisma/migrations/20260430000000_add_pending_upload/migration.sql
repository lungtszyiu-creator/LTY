-- CreateTable
CREATE TABLE "PendingUpload" (
    "id" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "blobPathname" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "downloadedAt" TIMESTAMP(3),
    "vaultPath" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingUpload_status_createdAt_idx" ON "PendingUpload"("status", "createdAt");
