-- CreateTable
CREATE TABLE "document_visual_regions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "candidateClass" TEXT NOT NULL,
    "detectionMethod" TEXT NOT NULL,
    "detectionStatus" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL DEFAULT 1,
    "confidenceScore" DOUBLE PRECISION,
    "boundingBoxJson" TEXT,
    "anchorText" TEXT,
    "inkCharacteristics" TEXT,
    "limitations" TEXT,
    "isVerifiedByReviewer" BOOLEAN NOT NULL DEFAULT false,
    "reviewerRemarks" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "analyzerVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_visual_regions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_visual_regions_documentId_idx" ON "document_visual_regions"("documentId");

-- CreateIndex
CREATE INDEX "document_visual_regions_candidateClass_idx" ON "document_visual_regions"("candidateClass");

-- CreateIndex
CREATE INDEX "document_visual_regions_detectionStatus_idx" ON "document_visual_regions"("detectionStatus");

-- AddForeignKey
ALTER TABLE "document_visual_regions" ADD CONSTRAINT "document_visual_regions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fdr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
