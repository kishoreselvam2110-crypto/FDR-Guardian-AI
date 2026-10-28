import exifr from "exifr";
import { PDFDocument } from "pdf-lib";
import prisma, { isDatabaseExpectedOnline, markDatabaseUnreachable } from "../db.ts";
import type {
  DocumentMetadataDto,
  MetadataForensicFinding,
} from "./types.ts";
import { findInMemoryDocument } from "../storage/documentRegistry.ts";

export const ANALYZER_VERSION = "1.0.0";

// Recognized image editing and document manipulation software signatures
const SUSPICIOUS_EDITOR_KEYWORDS = [
  "photoshop",
  "canva",
  "gimp",
  "coreldraw",
  "corel",
  "illustrator",
  "paint.net",
  "pixelmator",
  "inkscape",
  "nitro pro",
  "foxit phantom",
  "sejda",
  "ilovepdf",
  "pdfescape",
  "smallpdf",
  "pdf24",
  "wondershare pdf",
];

// Common physical document scanner manufacturers
const HARDWARE_SCANNER_MANUFACTURERS = [
  "canon",
  "epson",
  "hp",
  "hewlett-packard",
  "fujitsu",
  "brother",
  "xerox",
  "ricoh",
  "konica",
  "kyocera",
  "kodak",
  "plustek",
];

/**
 * Standardizes raw date objects or date strings into ISO 8601 strings
 */
function normalizeDate(rawDate: unknown): string | null {
  if (!rawDate) return null;
  if (rawDate instanceof Date) {
    return isNaN(rawDate.getTime()) ? null : rawDate.toISOString();
  }
  if (typeof rawDate === "string") {
    const parsed = new Date(rawDate);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

/**
 * Extracts metadata from supported image buffers (JPEG, PNG)
 * PRIVACY SAFEGUARD: Explicitly excludes GPS tags and geolocation coordinates.
 */
async function extractImageMetadata(buffer: Buffer) {
  try {
    const raw = await exifr.parse(buffer, {
      tiff: true,
      xmp: true,
      jfif: true,
      gps: false, // PRIVACY: Never extract or persist GPS data
      pick: [
        "Make",
        "Model",
        "Software",
        "CreatorTool",
        "ModifyDate",
        "CreateDate",
        "DateTimeOriginal",
        "ImageWidth",
        "ImageHeight",
        "ExifImageWidth",
        "ExifImageHeight",
      ],
    });

    if (!raw) {
      return {
        software: null,
        producer: null,
        creator: null,
        cameraMake: null,
        cameraModel: null,
        creationDate: null,
        modificationDate: null,
        pageCount: 1,
        imageWidth: null,
        imageHeight: null,
        rawMetadata: {},
      };
    }

    const software = raw.Software || raw.CreatorTool || null;
    const cameraMake = raw.Make ? String(raw.Make).trim() : null;
    const cameraModel = raw.Model ? String(raw.Model).trim() : null;
    const creationDate = normalizeDate(raw.DateTimeOriginal || raw.CreateDate);
    const modificationDate = normalizeDate(raw.ModifyDate);
    const imageWidth = raw.ImageWidth || raw.ExifImageWidth || null;
    const imageHeight = raw.ImageHeight || raw.ExifImageHeight || null;

    // Filter out any undefined or empty values for raw presentation
    const cleanRaw: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v !== undefined && v !== null && k.toLowerCase().indexOf("gps") === -1) {
        cleanRaw[k] = v instanceof Date ? v.toISOString() : v;
      }
    }

    return {
      software: software ? String(software).trim() : null,
      producer: null,
      creator: software ? String(software).trim() : null,
      cameraMake,
      cameraModel,
      creationDate,
      modificationDate,
      pageCount: 1,
      imageWidth: typeof imageWidth === "number" ? imageWidth : null,
      imageHeight: typeof imageHeight === "number" ? imageHeight : null,
      rawMetadata: cleanRaw,
    };
  } catch (err: unknown) {
    const error = err as Error;
    return {
      software: null,
      producer: null,
      creator: null,
      cameraMake: null,
      cameraModel: null,
      creationDate: null,
      modificationDate: null,
      pageCount: 1,
      imageWidth: null,
      imageHeight: null,
      rawMetadata: { parseError: error.message },
    };
  }
}

/**
 * Extracts metadata from PDF documents using pdf-lib
 */
async function extractPdfMetadata(buffer: Buffer) {
  try {
    const pdfDoc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });

    const creator = pdfDoc.getCreator() || null;
    const producer = pdfDoc.getProducer() || null;
    const title = pdfDoc.getTitle() || null;
    const author = pdfDoc.getAuthor() || null;
    const creationDate = normalizeDate(pdfDoc.getCreationDate());
    const modificationDate = normalizeDate(pdfDoc.getModificationDate());
    const pageCount = pdfDoc.getPageCount();

    const rawMetadata: Record<string, unknown> = {
      creator,
      producer,
      title,
      author,
      creationDate,
      modificationDate,
      pageCount,
    };

    return {
      software: producer || creator || null,
      producer: producer ? String(producer).trim() : null,
      creator: creator ? String(creator).trim() : null,
      cameraMake: null,
      cameraModel: null,
      creationDate,
      modificationDate,
      pageCount,
      imageWidth: null,
      imageHeight: null,
      rawMetadata,
    };
  } catch (err: unknown) {
    const error = err as Error;
    return {
      software: null,
      producer: null,
      creator: null,
      cameraMake: null,
      cameraModel: null,
      creationDate: null,
      modificationDate: null,
      pageCount: null,
      imageWidth: null,
      imageHeight: null,
      rawMetadata: { parseError: error.message },
    };
  }
}

/**
 * Versioned forensic rules engine generating explainable findings
 */
export function evaluateForensicRules(
  documentId: string,
  metadata: {
    software: string | null;
    producer: string | null;
    creator: string | null;
    cameraMake: string | null;
    cameraModel: string | null;
    creationDate: string | null;
    modificationDate: string | null;
    pageCount: number | null;
  },
  now: Date = new Date()
): MetadataForensicFinding[] {
  const findings: MetadataForensicFinding[] = [];
  const analyzedAt = now.toISOString();

  const combinedSoftware = [metadata.software, metadata.producer, metadata.creator]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Rule 1: Graphic Editor / Document Manipulation Tool Signature
  const matchedEditor = SUSPICIOUS_EDITOR_KEYWORDS.find((keyword) =>
    combinedSoftware.includes(keyword)
  );

  if (matchedEditor) {
    findings.push({
      id: `finding_${documentId}_editor_${matchedEditor}`,
      documentId,
      ruleKey: "RULE_EDITOR_DETECTED",
      severity: "WARNING",
      title: "Document Editing / Graphic Processing Tool Detected",
      explanation: `Document metadata identifies software signature associated with editing tools ('${matchedEditor}'). Observed software string: "${metadata.software || metadata.producer || metadata.creator}".`,
      supportingEvidence: {
        matchedKeyword: matchedEditor,
        software: metadata.software,
        producer: metadata.producer,
        creator: metadata.creator,
      },
      recommendedAction:
        "Inspect deposit certificate layout closely against the issuing bank confirmation letter. Verify that numerical deposit figures, IFSC routing, and bank branch seal show no signs of localized patching or re-composition.",
      analyzerVersion: ANALYZER_VERSION,
      analyzedAt,
      isResolved: false,
    });
  }

  // Rule 2: Timeline Inconsistency (Modification Date earlier than Creation Date)
  if (metadata.creationDate && metadata.modificationDate) {
    const createTime = new Date(metadata.creationDate).getTime();
    const modTime = new Date(metadata.modificationDate).getTime();

    if (!isNaN(createTime) && !isNaN(modTime) && modTime < createTime) {
      findings.push({
        id: `finding_${documentId}_timeline_inversion`,
        documentId,
        ruleKey: "RULE_TIMELINE_INCONSISTENCY",
        severity: "WARNING",
        title: "Metadata Temporal Inversion (ModDate Precedes CreateDate)",
        explanation: `Temporal inversion detected: the file modification timestamp (${metadata.modificationDate}) precedes the creation timestamp (${metadata.creationDate}). This chronological inversion typically arises from manual metadata manipulation or unsynchronized system clocks.`,
        supportingEvidence: {
          creationDate: metadata.creationDate,
          modificationDate: metadata.modificationDate,
          discrepancySeconds: Math.round((createTime - modTime) / 1000),
        },
        recommendedAction:
          "Cross-reference the document date with the actual bank issuance date and request verification from the institution.",
        analyzerVersion: ANALYZER_VERSION,
        analyzedAt,
        isResolved: false,
      });
    }

    // Rule 3: Future-Dated Metadata Timestamp
    const futureThreshold = now.getTime() + 24 * 60 * 60 * 1000; // 24 hours ahead
    if (createTime > futureThreshold || modTime > futureThreshold) {
      findings.push({
        id: `finding_${documentId}_future_dated`,
        documentId,
        ruleKey: "RULE_FUTURE_DATED_METADATA",
        severity: "WARNING",
        title: "Future-Dated Metadata Timestamp",
        explanation: `Document metadata contains timestamps recorded in the future relative to current verification time (${now.toISOString()}).`,
        supportingEvidence: {
          creationDate: metadata.creationDate,
          modificationDate: metadata.modificationDate,
          currentTime: now.toISOString(),
        },
        recommendedAction:
          "Investigate scanner system clock calibration or inspect for manual timestamp editing.",
        analyzerVersion: ANALYZER_VERSION,
        analyzedAt,
        isResolved: false,
      });
    }
  }

  // Rule 4: Physical Hardware Scanner Detected
  if (metadata.cameraMake) {
    const makeLower = metadata.cameraMake.toLowerCase();
    const isHardwareScanner = HARDWARE_SCANNER_MANUFACTURERS.some((m) =>
      makeLower.includes(m)
    );

    if (isHardwareScanner) {
      findings.push({
        id: `finding_${documentId}_hardware_scanner`,
        documentId,
        ruleKey: "RULE_SCANNER_AUTHENTICATED",
        severity: "INFO",
        title: "Physical Hardware Scanner Fingerprint Present",
        explanation: `Document metadata contains physical scanning hardware make ('${metadata.cameraMake}') and model ('${metadata.cameraModel || "Unspecified"}'), consistent with a direct hardware scanner intake.`,
        supportingEvidence: {
          cameraMake: metadata.cameraMake,
          cameraModel: metadata.cameraModel,
        },
        recommendedAction:
          "Informational corroboration confirming physical scanner origin.",
        analyzerVersion: ANALYZER_VERSION,
        analyzedAt,
        isResolved: true,
      });
    }
  }

  // Rule 5: Minimal / Stripped Metadata
  const hasMeaningfulMetadata =
    metadata.software ||
    metadata.cameraMake ||
    metadata.creationDate ||
    metadata.modificationDate;

  if (!hasMeaningfulMetadata) {
    findings.push({
      id: `finding_${documentId}_stripped_metadata`,
      documentId,
      ruleKey: "RULE_METADATA_STRIPPED",
      severity: "INFO",
      title: "Minimal / Stripped Metadata Profile",
      explanation:
        "No scanner model, creator software, or creation timestamps were identified in the file. Web optimization tools, chat platforms, and privacy scrubbing tools regularly strip metadata from genuine files.",
      supportingEvidence: {
        pageCount: metadata.pageCount,
      },
      recommendedAction:
        "Informational only. Absence of metadata does not constitute evidence of document manipulation.",
      analyzerVersion: ANALYZER_VERSION,
      analyzedAt,
      isResolved: true,
    });
  }

  return findings;
}

/**
 * Main analysis pipeline: extracts metadata, runs rules, and returns normalized DTO
 */
export async function analyzeDocumentMetadata(
  documentId: string,
  buffer: Buffer,
  mimeType: string
): Promise<{
  metadata: DocumentMetadataDto;
  findings: MetadataForensicFinding[];
}> {
  const isPdf = mimeType === "application/pdf" || buffer.subarray(0, 5).toString() === "%PDF-";

  const extracted = isPdf
    ? await extractPdfMetadata(buffer)
    : await extractImageMetadata(buffer);

  const findings = evaluateForensicRules(documentId, extracted);

  const metadataDto: DocumentMetadataDto = {
    id: `meta_${documentId}`,
    documentId,
    software: extracted.software,
    producer: extracted.producer,
    creator: extracted.creator,
    cameraMake: extracted.cameraMake,
    cameraModel: extracted.cameraModel,
    creationDate: extracted.creationDate,
    modificationDate: extracted.modificationDate,
    pageCount: extracted.pageCount,
    imageWidth: extracted.imageWidth,
    imageHeight: extracted.imageHeight,
    analyzerVersion: ANALYZER_VERSION,
    rawMetadata: extracted.rawMetadata,
    findings,
    status: "COMPLETED",
    analyzedAt: new Date().toISOString(),
  };

  return {
    metadata: metadataDto,
    findings,
  };
}

/**
 * Persists metadata and forensic findings to PostgreSQL or in-memory fallback
 */
export async function persistDocumentMetadata(
  documentId: string,
  fdrId: string,
  analysis: {
    metadata: DocumentMetadataDto;
    findings: MetadataForensicFinding[];
  }
): Promise<void> {
  const { metadata, findings } = analysis;

  if (!isDatabaseExpectedOnline()) {
    inMemoryMetadataStore.set(documentId, metadata);
    return;
  }

  try {
    // 1. Upsert into document_metadata table
    await prisma.documentMetadata.upsert({
      where: { documentId },
      create: {
        id: metadata.id,
        documentId,
        software: metadata.software,
        producer: metadata.producer,
        creator: metadata.creator,
        cameraMake: metadata.cameraMake,
        cameraModel: metadata.cameraModel,
        creationDate: metadata.creationDate ? new Date(metadata.creationDate) : null,
        modificationDate: metadata.modificationDate ? new Date(metadata.modificationDate) : null,
        pageCount: metadata.pageCount,
        imageWidth: metadata.imageWidth,
        imageHeight: metadata.imageHeight,
        analyzerVersion: metadata.analyzerVersion,
        rawMetadataJson: JSON.stringify(metadata.rawMetadata || {}),
        findingsJson: JSON.stringify(findings),
        status: "COMPLETED",
        analyzedAt: new Date(metadata.analyzedAt),
      },
      update: {
        software: metadata.software,
        producer: metadata.producer,
        creator: metadata.creator,
        cameraMake: metadata.cameraMake,
        cameraModel: metadata.cameraModel,
        creationDate: metadata.creationDate ? new Date(metadata.creationDate) : null,
        modificationDate: metadata.modificationDate ? new Date(metadata.modificationDate) : null,
        pageCount: metadata.pageCount,
        imageWidth: metadata.imageWidth,
        imageHeight: metadata.imageHeight,
        analyzerVersion: metadata.analyzerVersion,
        rawMetadataJson: JSON.stringify(metadata.rawMetadata || {}),
        findingsJson: JSON.stringify(findings),
        status: "COMPLETED",
        analyzedAt: new Date(metadata.analyzedAt),
      },
    });

    // 2. If warning findings exist (e.g. editor detected or timeline inversion), record into FdrRiskFinding
    const warningFindings = findings.filter((f) => f.severity === "WARNING");
    for (const wf of warningFindings) {
      await prisma.fdrRiskFinding.create({
        data: {
          fdrId,
          riskCode: wf.ruleKey,
          severity: "WARNING",
          description: `${wf.title}: ${wf.explanation}`,
          isResolved: false,
        },
      });
    }
  } catch {
    // Database offline: store in fallback registry
    markDatabaseUnreachable();
    inMemoryMetadataStore.set(documentId, metadata);
  }
}

// In-memory fallback for synthetic / offline testing
const inMemoryMetadataStore = new Map<string, DocumentMetadataDto>();

export function getInMemoryMetadata(documentId: string): DocumentMetadataDto | undefined {
  return inMemoryMetadataStore.get(documentId);
}
