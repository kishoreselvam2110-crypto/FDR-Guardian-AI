-- AlterTable
ALTER TABLE "fdr_documents" ADD COLUMN "storageKey" TEXT,
ADD COLUMN "sha256Checksum" TEXT,
ADD COLUMN "uploadedByUserId" TEXT,
ADD COLUMN "uploadedByRole" TEXT,
ADD COLUMN "processingStatus" TEXT NOT NULL DEFAULT 'UPLOADED',
ALTER COLUMN "fileUrl" SET DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "fdr_documents_storageKey_key" ON "fdr_documents"("storageKey");

-- CreateIndex
CREATE INDEX "fdr_documents_storageKey_idx" ON "fdr_documents"("storageKey");
