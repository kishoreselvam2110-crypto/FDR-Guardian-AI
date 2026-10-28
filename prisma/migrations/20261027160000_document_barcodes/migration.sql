-- CreateTable
CREATE TABLE "document_barcodes" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fdrId" TEXT NOT NULL,
    "barcodeType" TEXT NOT NULL,
    "rawPayload" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL DEFAULT 1,
    "schemaType" TEXT NOT NULL,
    "extractedFdrNumber" TEXT,
    "extractedAmount" DECIMAL(15,2),
    "extractedBankName" TEXT,
    "extractedIssueDate" TIMESTAMP(3),
    "extractedMaturityDate" TIMESTAMP(3),
    "parsedFieldsJson" TEXT,
    "comparisonsJson" TEXT,
    "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "hasMismatch" BOOLEAN NOT NULL DEFAULT false,
    "riskFindingCreated" BOOLEAN NOT NULL DEFAULT false,
    "analyzerVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_barcodes_documentId_idx" ON "document_barcodes"("documentId");

-- CreateIndex
CREATE INDEX "document_barcodes_fdrId_idx" ON "document_barcodes"("fdrId");

-- CreateIndex
CREATE INDEX "document_barcodes_validationStatus_idx" ON "document_barcodes"("validationStatus");

-- AddForeignKey
ALTER TABLE "document_barcodes" ADD CONSTRAINT "document_barcodes_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fdr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_barcodes" ADD CONSTRAINT "document_barcodes_fdrId_fkey" FOREIGN KEY ("fdrId") REFERENCES "fdr_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
