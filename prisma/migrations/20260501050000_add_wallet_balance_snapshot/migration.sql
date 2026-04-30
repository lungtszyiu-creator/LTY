-- CreateTable
CREATE TABLE "WalletBalanceSnapshot" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenContract" TEXT,
    "amount" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'ETHERSCAN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletBalanceSnapshot_walletId_token_asOf_idx" ON "WalletBalanceSnapshot"("walletId", "token", "asOf");

-- CreateIndex
CREATE INDEX "WalletBalanceSnapshot_asOf_idx" ON "WalletBalanceSnapshot"("asOf");

-- AddForeignKey
ALTER TABLE "WalletBalanceSnapshot" ADD CONSTRAINT "WalletBalanceSnapshot_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "CryptoWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
