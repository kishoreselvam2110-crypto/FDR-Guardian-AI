-- CreateEnum
CREATE TYPE "FdrVerificationState" AS ENUM ('PENDING', 'VERIFIED', 'DEFICIENT', 'REJECTED');

-- CreateEnum
CREATE TYPE "FdrAdministrativeState" AS ENUM ('PLEDGED_ACTIVE', 'MATURED_PENDING_ACTION', 'RENEWED', 'RELEASE_PENDING', 'RELEASED', 'FORFEITED_ENCASHED');

-- CreateEnum
CREATE TYPE "FdrRenewalState" AS ENUM ('ORIGINAL', 'RENEWAL_REQUESTED', 'RENEWAL_IN_PROGRESS', 'RENEWED_ACTIVE', 'REPLACED_SUPERSEDED');

-- CreateEnum
CREATE TYPE "FdrDocumentType" AS ENUM ('FDR_CERTIFICATE_SCAN', 'BANK_CONFIRMATION_LETTER', 'LIEN_ENDORSEMENT', 'TRIPARTITE_AGREEMENT', 'RENEWAL_ADVICE', 'NOC_RELEASE_ORDER');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('MATURITY_CRITICAL_30D', 'MATURITY_WARNING_60D', 'EXPIRED_NO_RENEWAL', 'LIEN_MISSING', 'STATUTORY_DEFICIT', 'UNRESOLVED_DISCREPANCY', 'RENEWAL_EVIDENCE_MISSING');

-- CreateEnum
CREATE TYPE "ReleaseRequestStatus" AS ENUM ('SUBMITTED', 'UNDER_SCRUTINY', 'COMMITTEE_REVIEW', 'APPROVED', 'REJECTED', 'DISBURSED');

-- CreateTable
CREATE TABLE "fdr_instruments" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "fdrNumber" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "ifscCode" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "interestRate" DECIMAL(5,2) NOT NULL,
    "jointHolderName" TEXT NOT NULL,
    "isLienMarked" BOOLEAN NOT NULL DEFAULT false,
    "lienConfirmedAt" TIMESTAMP(3),
    "verificationState" "FdrVerificationState" NOT NULL DEFAULT 'PENDING',
    "administrativeState" "FdrAdministrativeState" NOT NULL DEFAULT 'PLEDGED_ACTIVE',
    "renewalState" "FdrRenewalState" NOT NULL DEFAULT 'ORIGINAL',
    "predecessorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fdr_instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fdr_documents" (
    "id" TEXT NOT NULL,
    "fdrId" TEXT NOT NULL,
    "documentType" "FdrDocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fdr_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_extractions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "extractedFdrNumber" TEXT,
    "extractedAmount" DECIMAL(15,2),
    "extractedBankName" TEXT,
    "extractedIfsc" TEXT,
    "extractedMaturityDate" TIMESTAMP(3),
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "rawExtractionJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fdr_verification_events" (
    "id" TEXT NOT NULL,
    "fdrId" TEXT NOT NULL,
    "officerUserId" TEXT NOT NULL,
    "officerName" TEXT NOT NULL,
    "officerRole" TEXT NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "previousState" "FdrVerificationState" NOT NULL,
    "newState" "FdrVerificationState" NOT NULL,
    "remarks" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fdr_verification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fdr_renewal_requests" (
    "id" TEXT NOT NULL,
    "fdrId" TEXT NOT NULL,
    "requestedTenureMonths" INTEGER NOT NULL,
    "proposedMaturityDate" TIMESTAMP(3) NOT NULL,
    "proposedAmount" DECIMAL(15,2),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "officerRemarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fdr_renewal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fdr_release_requests" (
    "id" TEXT NOT NULL,
    "fdrId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "requestedAmount" DECIMAL(15,2) NOT NULL,
    "statutoryTenureCompleted" BOOLEAN NOT NULL DEFAULT false,
    "nocIssued" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReleaseRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submissionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committeeDecisionDate" TIMESTAMP(3),
    "committeeRemarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fdr_release_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fdr_alerts" (
    "id" TEXT NOT NULL,
    "fdrId" TEXT,
    "institutionId" TEXT NOT NULL,
    "alertType" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fdr_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fdr_risk_findings" (
    "id" TEXT NOT NULL,
    "fdrId" TEXT NOT NULL,
    "riskCode" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fdr_risk_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fdr_audit_logs" (
    "id" TEXT NOT NULL,
    "fdrId" TEXT,
    "institutionId" TEXT,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "detailsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fdr_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fdr_instruments_fdrNumber_key" ON "fdr_instruments"("fdrNumber");

-- CreateIndex
CREATE INDEX "fdr_instruments_institutionId_idx" ON "fdr_instruments"("institutionId");

-- CreateIndex
CREATE INDEX "fdr_instruments_maturityDate_idx" ON "fdr_instruments"("maturityDate");

-- CreateIndex
CREATE INDEX "fdr_instruments_verificationState_idx" ON "fdr_instruments"("verificationState");

-- CreateIndex
CREATE INDEX "fdr_instruments_administrativeState_idx" ON "fdr_instruments"("administrativeState");

-- CreateIndex
CREATE INDEX "fdr_documents_fdrId_idx" ON "fdr_documents"("fdrId");

-- CreateIndex
CREATE INDEX "document_extractions_documentId_idx" ON "document_extractions"("documentId");

-- CreateIndex
CREATE INDEX "fdr_verification_events_fdrId_idx" ON "fdr_verification_events"("fdrId");

-- CreateIndex
CREATE INDEX "fdr_renewal_requests_fdrId_idx" ON "fdr_renewal_requests"("fdrId");

-- CreateIndex
CREATE INDEX "fdr_release_requests_fdrId_idx" ON "fdr_release_requests"("fdrId");

-- CreateIndex
CREATE INDEX "fdr_release_requests_institutionId_idx" ON "fdr_release_requests"("institutionId");

-- CreateIndex
CREATE INDEX "fdr_alerts_institutionId_idx" ON "fdr_alerts"("institutionId");

-- CreateIndex
CREATE INDEX "fdr_alerts_fdrId_idx" ON "fdr_alerts"("fdrId");

-- CreateIndex
CREATE INDEX "fdr_alerts_isResolved_idx" ON "fdr_alerts"("isResolved");

-- CreateIndex
CREATE INDEX "fdr_risk_findings_fdrId_idx" ON "fdr_risk_findings"("fdrId");

-- CreateIndex
CREATE INDEX "fdr_audit_logs_institutionId_idx" ON "fdr_audit_logs"("institutionId");

-- CreateIndex
CREATE INDEX "fdr_audit_logs_fdrId_idx" ON "fdr_audit_logs"("fdrId");

-- CreateIndex
CREATE INDEX "fdr_audit_logs_createdAt_idx" ON "fdr_audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "fdr_instruments" ADD CONSTRAINT "fdr_instruments_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fdr_instruments" ADD CONSTRAINT "fdr_instruments_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "fdr_instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fdr_documents" ADD CONSTRAINT "fdr_documents_fdrId_fkey" FOREIGN KEY ("fdrId") REFERENCES "fdr_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fdr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fdr_verification_events" ADD CONSTRAINT "fdr_verification_events_fdrId_fkey" FOREIGN KEY ("fdrId") REFERENCES "fdr_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fdr_renewal_requests" ADD CONSTRAINT "fdr_renewal_requests_fdrId_fkey" FOREIGN KEY ("fdrId") REFERENCES "fdr_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fdr_release_requests" ADD CONSTRAINT "fdr_release_requests_fdrId_fkey" FOREIGN KEY ("fdrId") REFERENCES "fdr_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fdr_release_requests" ADD CONSTRAINT "fdr_release_requests_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fdr_alerts" ADD CONSTRAINT "fdr_alerts_fdrId_fkey" FOREIGN KEY ("fdrId") REFERENCES "fdr_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fdr_alerts" ADD CONSTRAINT "fdr_alerts_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fdr_risk_findings" ADD CONSTRAINT "fdr_risk_findings_fdrId_fkey" FOREIGN KEY ("fdrId") REFERENCES "fdr_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fdr_audit_logs" ADD CONSTRAINT "fdr_audit_logs_fdrId_fkey" FOREIGN KEY ("fdrId") REFERENCES "fdr_instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fdr_audit_logs" ADD CONSTRAINT "fdr_audit_logs_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
