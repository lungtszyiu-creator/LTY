-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "reportToId" TEXT;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportToId_fkey" FOREIGN KEY ("reportToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
