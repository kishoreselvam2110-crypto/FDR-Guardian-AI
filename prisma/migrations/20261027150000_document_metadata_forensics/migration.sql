-- CreateTable
CREATE TABLE "document_metadata" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "software" TEXT,
    "producer" TEXT,
    "creator" TEXT,
    "cameraMake" TEXT,
    "cameraModel" TEXT,
    "creationDate" TIMESTAMP(3),
    "modificationDate" TIMESTAMP(3),
    "pageCount" INTEGER,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "analyzerVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "rawMetadataJson" TEXT,
    "findingsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_metadata_documentId_key" ON "document_metadata"("documentId");

-- CreateIndex
CREATE INDEX "document_metadata_documentId_idx" ON "document_metadata"("documentId");

-- AddForeignKey
ALTER TABLE "document_metadata" ADD CONSTRAINT "document_metadata_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "fdr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
