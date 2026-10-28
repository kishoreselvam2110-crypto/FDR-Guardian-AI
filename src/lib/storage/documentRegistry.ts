import type {
  FdrDocumentType,
  DocumentMetadataDto,
  DocumentBarcodeDto,
  DocumentOcrExtractionResultDto,
  DocumentElaResultDto,
  LayoutAnomalyFindingDto,
  DocumentVisualRegionDto,
  DocumentAiEfficiencyDto,
} from "@/lib/fdr/types";

export interface StoredDocumentRecord {
  id: string;
  fdrId: string;
  documentType: FdrDocumentType;
  fileName: string;
  fileUrl: string;
  fileSizeBytes: number;
  mimeType: string;
  storageKey: string;
  sha256Checksum: string;
  uploadedByUserId: string;
  uploadedByRole: string;
  processingStatus: string;
  isVerified: boolean;
  metadata?: DocumentMetadataDto | null;
  barcodes?: DocumentBarcodeDto[] | null;
  extractedData?: DocumentOcrExtractionResultDto | null;
  elaResult?: DocumentElaResultDto | null;
  layoutFindings?: LayoutAnomalyFindingDto[] | null;
  visualRegions?: DocumentVisualRegionDto[] | null;
  aiEfficiency?: DocumentAiEfficiencyDto | null;
  createdAt: string;
}

const inMemoryDocumentVault: StoredDocumentRecord[] = [];

export function registerUploadedDocument(doc: StoredDocumentRecord): void {
  inMemoryDocumentVault.unshift(doc);
}

export function getInMemoryDocuments(fdrId?: string): StoredDocumentRecord[] {
  if (fdrId) {
    return inMemoryDocumentVault.filter((d) => d.fdrId === fdrId);
  }
  return inMemoryDocumentVault;
}

export function findInMemoryDocument(documentId: string): StoredDocumentRecord | undefined {
  return inMemoryDocumentVault.find((d) => d.id === documentId);
}
