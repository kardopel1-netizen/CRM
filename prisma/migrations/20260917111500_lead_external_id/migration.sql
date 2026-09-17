-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Inquiry_externalId_key" ON "Inquiry"("externalId");
