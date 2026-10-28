-- AlterTable
ALTER TABLE "fdr_risk_findings" ADD COLUMN "documentId" TEXT,
ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GENERAL_DISCREPANCY',
ADD COLUMN "sourceAnalysis" TEXT NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN "evidenceJson" TEXT,
ADD COLUMN "ruleKey" TEXT,
ADD COLUMN "ruleVersion" TEXT NOT NULL DEFAULT '1.0.0',
ADD COLUMN "recommendedAction" TEXT,
ADD COLUMN "resolutionState" TEXT NOT NULL DEFAULT 'OPEN',
ADD COLUMN "reviewerDecision" TEXT,
ADD COLUMN "reviewerJustification" TEXT,
ADD COLUMN "resolvedByUserId" TEXT,
ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "fdr_risk_findings_documentId_idx" ON "fdr_risk_findings"("documentId");

-- CreateIndex
CREATE INDEX "fdr_risk_findings_category_idx" ON "fdr_risk_findings"("category");

-- CreateIndex
CREATE INDEX "fdr_risk_findings_resolutionState_idx" ON "fdr_risk_findings"("resolutionState");

-- AddForeignKey
ALTER TABLE "fdr_risk_findings" ADD CONSTRAINT "fdr_risk_findings_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fdr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
