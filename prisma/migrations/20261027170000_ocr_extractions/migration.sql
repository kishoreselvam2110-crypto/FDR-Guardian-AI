-- AlterTable
ALTER TABLE "document_extractions" ADD COLUMN "extractedIssueDate" TIMESTAMP(3),
ADD COLUMN "extractedInstitutionName" TEXT,
ADD COLUMN "ocrEngine" TEXT,
ADD COLUMN "ocrVersion" TEXT,
ADD COLUMN "processingDurationMs" INTEGER,
ADD COLUMN "provenanceJson" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "document_field_corrections" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "originalValue" TEXT,
    "correctedValue" TEXT NOT NULL,
    "correctedByUserId" TEXT NOT NULL,
    "correctedByUserName" TEXT NOT NULL,
    "correctedByUserRole" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_field_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_field_corrections_extractionId_idx" ON "document_field_corrections"("extractionId");

-- AddForeignKey
ALTER TABLE "document_field_corrections" ADD CONSTRAINT "document_field_corrections_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "document_extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
