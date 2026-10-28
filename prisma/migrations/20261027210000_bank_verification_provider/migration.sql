-- CreateTable
CREATE TABLE "fdr_bank_verification_requests" (
    "id" TEXT NOT NULL,
    "fdrId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL DEFAULT 'SANDBOX_GATEWAY',
    "providerMode" TEXT NOT NULL DEFAULT 'SANDBOX_SIMULATED',
    "requestedFdrNumber" TEXT NOT NULL,
    "requestedAmount" DECIMAL(15,2) NOT NULL,
    "requestedBankName" TEXT NOT NULL,
    "requestedIfsc" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "responseOutcome" TEXT NOT NULL,
    "comparedFieldsJson" TEXT,
    "verifiedAmount" DECIMAL(15,2),
    "verifiedBankName" TEXT,
    "verifiedAccountStatus" TEXT,
    "isLienConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "disclaimer" TEXT NOT NULL,
    "inconclusiveReason" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "requestedByUserName" TEXT,
    "requestedByUserRole" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fdr_bank_verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fdr_bank_verification_requests_correlationId_key" ON "fdr_bank_verification_requests"("correlationId");

-- CreateIndex
CREATE INDEX "fdr_bank_verification_requests_fdrId_idx" ON "fdr_bank_verification_requests"("fdrId");

-- CreateIndex
CREATE INDEX "fdr_bank_verification_requests_correlationId_idx" ON "fdr_bank_verification_requests"("correlationId");

-- CreateIndex
CREATE INDEX "fdr_bank_verification_requests_responseOutcome_idx" ON "fdr_bank_verification_requests"("responseOutcome");

-- CreateIndex
CREATE INDEX "fdr_bank_verification_requests_providerMode_idx" ON "fdr_bank_verification_requests"("providerMode");

-- AddForeignKey
ALTER TABLE "fdr_bank_verification_requests" ADD CONSTRAINT "fdr_bank_verification_requests_fdrId_fkey" FOREIGN KEY ("fdrId") REFERENCES "fdr_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
