-- CreateTable
CREATE TABLE "document_ela_results" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "recompressionQuality" INTEGER NOT NULL DEFAULT 90,
    "averageErrorLevel" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "peakError" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "highDiscrepancyRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "diagnosticStorageKey" TEXT,
    "formatType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "findingsJson" TEXT,
    "analyzerVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_ela_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_layout_findings" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "anomalyType" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL DEFAULT 1,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "fieldName" TEXT,
    "observedValue" TEXT,
    "thresholdApplied" TEXT NOT NULL,
    "boundingBoxJson" TEXT,
    "explanation" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "analyzerVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_layout_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_ela_results_documentId_key" ON "document_ela_results"("documentId");

-- CreateIndex
CREATE INDEX "document_ela_results_documentId_idx" ON "document_ela_results"("documentId");

-- CreateIndex
CREATE INDEX "document_layout_findings_documentId_idx" ON "document_layout_findings"("documentId");

-- CreateIndex
CREATE INDEX "document_layout_findings_anomalyType_idx" ON "document_layout_findings"("anomalyType");

-- AddForeignKey
ALTER TABLE "document_ela_results" ADD CONSTRAINT "document_ela_results_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fdr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_layout_findings" ADD CONSTRAINT "document_layout_findings_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fdr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
