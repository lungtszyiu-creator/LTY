-- CreateTable
CREATE TABLE "VaultCompanyMirror" (
    "id" TEXT NOT NULL,
    "vaultPath" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "officialNameEn" TEXT,
    "officialNameZh" TEXT,
    "jurisdiction" TEXT,
    "entityKind" TEXT,
    "legalRepresentative" TEXT,
    "actualController" TEXT,
    "registeredAddress" TEXT,
    "registeredCapital" TEXT,
    "creditCode" TEXT,
    "established" TEXT,
    "relationToLty" TEXT,
    "privateMatter" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawFrontmatter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultCompanyMirror_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VaultCompanyMirror_vaultPath_key" ON "VaultCompanyMirror"("vaultPath");

-- CreateIndex
CREATE INDEX "VaultCompanyMirror_status_idx" ON "VaultCompanyMirror"("status");

-- CreateIndex
CREATE INDEX "VaultCompanyMirror_jurisdiction_idx" ON "VaultCompanyMirror"("jurisdiction");
