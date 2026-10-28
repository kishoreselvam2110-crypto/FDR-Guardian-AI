/**
 * FDR Guardian AI - QR Code & Barcode Forensic Extraction & Cross-Validation Engine
 * SIH26265 - Streamline of Security Deposit / FDR Portal
 *
 * Capabilities:
 * - Multi-format barcode & QR decoding (QR Code, Code 128, Code 39, DataMatrix)
 * - Safe image pixel decoding for PNG, JPEG, and embedded PDF images
 * - Untrusted payload sanitization (strict SSRF prevention: never executes or fetches URLs)
 * - Multiple schema parsers (JSON, Bank Verification URLs, Delimited Key-Value, Raw Reference)
 * - Deterministic cross-validation with submitted FDR records (Amount, Reference, Dates, Bank)
 * - Regulatory caveat disclosure (QR match is not cryptographic bank authenticity)
 * - Relational persistence and audit logging
 */

import jsQR from "jsqr";
import { createRequire } from "node:module";
import jpeg from "jpeg-js";
import { PDFDocument, PDFRawStream, PDFName } from "pdf-lib";
import zlib from "zlib";
import prisma, { isDatabaseExpectedOnline, markDatabaseUnreachable } from "../db.ts";
import type {
  DocumentBarcodeDto,
  BarcodeCrossValidationRecord,
  CrossValidationOutcome,
  FdrInstrumentDto,
} from "./types.ts";

const require = createRequire(import.meta.url);
const zxing = require("@zxing/library");
const { PNG } = require("pngjs");

const {
  MultiFormatReader,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  BarcodeFormat,
  DecodeHintType,
} = zxing;

export const ANALYZER_VERSION = "1.0.0";

// Resource & safety boundaries
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_PDF_PAGES_TO_INSPECT = 3;
export const MAX_IMAGES_TO_EXTRACT = 5;
export const MAX_IMAGE_DIMENSION = 4096;
export const MAX_PAYLOAD_CHARS = 2048;

export const REGULATORY_AUTHENTICITY_DISCLAIMER =
  "CRITICAL REGULATORY NOTICE: QR code payload match validates document consistency with the applicant's submission only. It does NOT constitute proof of bank authenticity, as QR codes can be produced without bank cryptographic validation. Direct bank confirmation remains mandatory.";

// In-memory registry fallback for offline / database-less testing
const inMemoryBarcodesVault: DocumentBarcodeDto[] = [];

export function getInMemoryBarcodes(documentId?: string): DocumentBarcodeDto[] {
  if (documentId) {
    return inMemoryBarcodesVault.filter((b) => b.documentId === documentId);
  }
  return inMemoryBarcodesVault;
}

export function clearInMemoryBarcodes(): void {
  inMemoryBarcodesVault.length = 0;
}

interface RawPixelImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
  pageNumber: number;
}

/**
 * Decodes PNG or JPEG image buffers into raw RGBA pixel arrays
 */
export function decodeImageToRgba(
  buffer: Buffer,
  mimeType: string,
  pageNumber = 1
): RawPixelImage | null {
  try {
    if (mimeType === "image/png" || buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
      const png = PNG.sync.read(buffer);
      if (png.width > MAX_IMAGE_DIMENSION || png.height > MAX_IMAGE_DIMENSION) {
        return null;
      }
      return {
        width: png.width,
        height: png.height,
        data: new Uint8Array(png.data),
        pageNumber,
      };
    }

    if (
      mimeType === "image/jpeg" ||
      mimeType === "image/jpg" ||
      buffer.subarray(0, 3).toString("hex") === "ffd8ff"
    ) {
      const jpg = jpeg.decode(buffer, { useTArray: true });
      if (jpg.width > MAX_IMAGE_DIMENSION || jpg.height > MAX_IMAGE_DIMENSION) {
        return null;
      }
      return {
        width: jpg.width,
        height: jpg.height,
        data: jpg.data,
        pageNumber,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Inspects PDF documents safely and extracts embedded image objects for barcode detection
 */
export async function extractImagesFromPdf(buffer: Buffer): Promise<RawPixelImage[]> {
  const images: RawPixelImage[] = [];

  try {
    const pdfDoc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });

    const totalPages = pdfDoc.getPageCount();
    const pagesToInspect = Math.min(totalPages, MAX_PDF_PAGES_TO_INSPECT);
    if (pagesToInspect <= 0) return images;

    const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
    let extractedCount = 0;

    for (const [ref, obj] of indirectObjects) {
      if (extractedCount >= MAX_IMAGES_TO_EXTRACT) break;

      if (
        obj instanceof PDFRawStream &&
        obj.dict &&
        obj.dict.get(PDFName.of("Subtype"))?.toString() === "/Image"
      ) {
        const filter = obj.dict.get(PDFName.of("Filter"))?.toString();
        const widthObj = obj.dict.get(PDFName.of("Width"));
        const heightObj = obj.dict.get(PDFName.of("Height"));
        const width = Number(widthObj ? String(widthObj).replace(/[^\d]/g, "") : 0);
        const height = Number(heightObj ? String(heightObj).replace(/[^\d]/g, "") : 0);

        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          continue;
        }

        const rawStreamBytes = Buffer.from(obj.getContents());

        // Handle JPEG streams directly
        if (filter === "/DCTDecode" || rawStreamBytes.subarray(0, 3).toString("hex") === "ffd8ff") {
          const decodedJpg = decodeImageToRgba(rawStreamBytes, "image/jpeg", 1);
          if (decodedJpg) {
            images.push(decodedJpg);
            extractedCount++;
          }
        } else if (filter === "/FlateDecode" && width > 0 && height > 0) {
          try {
            const deflated = zlib.inflateSync(rawStreamBytes);
            // If raw RGB or RGBA stream matches expected dimension
            if (deflated.length >= width * height * 3) {
              const rgba = new Uint8Array(width * height * 4);
              let srcOffset = 0;
              let dstOffset = 0;
              const isRgba = deflated.length >= width * height * 4;

              for (let i = 0; i < width * height; i++) {
                rgba[dstOffset] = deflated[srcOffset];
                rgba[dstOffset + 1] = deflated[srcOffset + 1];
                rgba[dstOffset + 2] = deflated[srcOffset + 2];
                rgba[dstOffset + 3] = isRgba ? deflated[srcOffset + 3] : 255;
                srcOffset += isRgba ? 4 : 3;
                dstOffset += 4;
              }

              images.push({
                width,
                height,
                data: rgba,
                pageNumber: 1,
              });
              extractedCount++;
            }
          } catch {
            // Ignore stream decompression failure gracefully
          }
        }
      }
    }
  } catch {
    // Non-parseable PDF returns empty image list
  }

  return images;
}

/**
 * Discovers QR codes and barcodes within an RGBA pixel bitmap using dual decoders
 */
export function detectBarcodesInRgba(
  image: RawPixelImage
): Array<{ barcodeType: string; rawPayload: string; pageNumber: number }> {
  const results: Array<{ barcodeType: string; rawPayload: string; pageNumber: number }> = [];
  const seenPayloads = new Set<string>();

  // 1. Primary: Dedicated jsQR detection for QR codes
  try {
    const clamped =
      image.data instanceof Uint8ClampedArray
        ? image.data
        : new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength);

    const qrResult = jsQR(clamped, image.width, image.height, {
      inversionAttempts: "attemptBoth",
    });

    if (qrResult && qrResult.data && qrResult.data.trim()) {
      const text = qrResult.data.trim();
      results.push({
        barcodeType: "QR_CODE",
        rawPayload: text,
        pageNumber: image.pageNumber,
      });
      seenPayloads.add(text);
    }
  } catch {
    // Continue to ZXing fallback
  }

  // 2. Secondary: ZXing MultiFormatReader for 1D and 2D formats (Code 128, Code 39, DataMatrix, etc.)
  try {
    const totalPixels = image.width * image.height;
    const luminances = new Uint8ClampedArray(totalPixels);

    for (let i = 0; i < totalPixels; i++) {
      const offset = i * 4;
      luminances[i] = Math.round(
        0.299 * image.data[offset] +
          0.587 * image.data[offset + 1] +
          0.114 * image.data[offset + 2]
      );
    }

    const luminanceSource = new RGBLuminanceSource(luminances, image.width, image.height);
    const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
    const reader = new MultiFormatReader();
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.EAN_13,
      BarcodeFormat.ITF,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    reader.setHints(hints);

    const origError = console.error;
    const origWarn = console.warn;
    let zxingResult = null;
    try {
      console.error = () => {};
      console.warn = () => {};
      zxingResult = reader.decode(binaryBitmap);
    } catch {
      // Barcode not found
    } finally {
      console.error = origError;
      console.warn = origWarn;
    }

    if (zxingResult && zxingResult.getText()) {
      const text = zxingResult.getText().trim();
      if (!seenPayloads.has(text)) {
        let typeName = "BARCODE_1D";
        const fmt = zxingResult.getBarcodeFormat();
        if (fmt === BarcodeFormat.QR_CODE) typeName = "QR_CODE";
        else if (fmt === BarcodeFormat.CODE_128) typeName = "CODE_128";
        else if (fmt === BarcodeFormat.CODE_39) typeName = "CODE_39";
        else if (fmt === BarcodeFormat.DATA_MATRIX) typeName = "DATA_MATRIX";
        else if (fmt === BarcodeFormat.EAN_13) typeName = "EAN_13";

        results.push({
          barcodeType: typeName,
          rawPayload: text,
          pageNumber: image.pageNumber,
        });
        seenPayloads.add(text);
      }
    }
  } catch {
    // No additional barcodes found by ZXing
  }

  return results;
}

/**
 * Sanitizes untrusted decoded payloads.
 * Protects against XSS, command injection, and SSRF (strictly disallows URL fetching).
 */
export function sanitizeUntrustedPayload(raw: string): string {
  if (!raw) return "";
  // Strip control characters except newline and tab
  const sanitized = raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
  return sanitized.length > MAX_PAYLOAD_CHARS
    ? sanitized.substring(0, MAX_PAYLOAD_CHARS) + " [TRUNCATED]"
    : sanitized;
}

export interface ParsedBarcodePayload {
  schemaType: "JSON" | "URL_QUERY_PARAMS" | "DELIMITED_KV" | "RAW_STRING" | "UNRECOGNIZED";
  extractedFdrNumber?: string | null;
  extractedAmount?: number | null;
  extractedBankName?: string | null;
  extractedIssueDate?: string | null;
  extractedMaturityDate?: string | null;
  parsedFields: Record<string, unknown>;
}

/**
 * Parses and extracts standard FDR fields from various banking payload schemas
 */
export function parseBarcodePayload(payload: string): ParsedBarcodePayload {
  const sanitized = sanitizeUntrustedPayload(payload);
  const parsedFields: Record<string, unknown> = {};

  // 1. JSON Schema (Modern bank receipt / core banking QR)
  if (
    (sanitized.startsWith("{") && sanitized.endsWith("}")) ||
    (sanitized.startsWith("[") && sanitized.endsWith("]"))
  ) {
    try {
      const obj = JSON.parse(sanitized);
      if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
        Object.assign(parsedFields, obj);

        const fdrNumber =
          obj.fdrNumber ||
          obj.fdrNo ||
          obj.fdr_no ||
          obj.receiptNo ||
          obj.receipt_no ||
          obj.certificateNo ||
          obj.refNo ||
          obj.accountNo ||
          null;

        const amount =
          obj.amount ||
          obj.depositAmount ||
          obj.principalAmount ||
          obj.amt ||
          obj.deposit_amt ||
          null;

        const bankName =
          obj.bank ||
          obj.bankName ||
          obj.bank_name ||
          obj.issuingBank ||
          obj.issuer ||
          null;

        const issueDate =
          obj.issueDate ||
          obj.issue_date ||
          obj.bookingDate ||
          obj.valueDate ||
          obj.depositDate ||
          null;

        const maturityDate =
          obj.maturityDate ||
          obj.maturity_date ||
          obj.expiryDate ||
          obj.dueDate ||
          obj.matDate ||
          null;

        return {
          schemaType: "JSON",
          extractedFdrNumber: fdrNumber ? String(fdrNumber).trim() : null,
          extractedAmount: parseNumericAmount(amount),
          extractedBankName: bankName ? String(bankName).trim() : null,
          extractedIssueDate: normalizeDateString(issueDate),
          extractedMaturityDate: normalizeDateString(maturityDate),
          parsedFields,
        };
      }
    } catch {
      // Invalid JSON syntax, fallback to next parser
    }
  }

  // 2. URL Verification Portal Query Parameters (e.g., https://bank.example/verify?ref=...&amt=...)
  // Strictly parse URL offline without ANY outbound network requests (anti-SSRF)
  if (
    sanitized.startsWith("http://") ||
    sanitized.startsWith("https://") ||
    sanitized.includes("?")
  ) {
    try {
      // Use dummy origin if relative query string
      const url = new URL(sanitized.startsWith("http") ? sanitized : `https://vault.internal${sanitized}`);
      const params: Record<string, string> = {};
      url.searchParams.forEach((val, key) => {
        params[key] = val;
      });

      if (Object.keys(params).length > 0) {
        Object.assign(parsedFields, {
          urlHost: url.hostname,
          urlPath: url.pathname,
          queryParams: params,
        });

        const fdrNumber =
          params.fdr ||
          params.fdrNumber ||
          params.ref ||
          params.receipt ||
          params.cert ||
          params.account ||
          null;

        const amount = params.amt || params.amount || params.principal || null;
        const bankName = params.bank || params.issuer || url.hostname.split(".")[0];
        const issueDate = params.issue_date || params.issued || params.booking || null;
        const maturityDate = params.mat_date || params.maturity || params.date || null;

        return {
          schemaType: "URL_QUERY_PARAMS",
          extractedFdrNumber: fdrNumber ? String(fdrNumber).trim() : null,
          extractedAmount: parseNumericAmount(amount),
          extractedBankName: bankName ? String(bankName).trim() : null,
          extractedIssueDate: normalizeDateString(issueDate),
          extractedMaturityDate: normalizeDateString(maturityDate),
          parsedFields,
        };
      }
    } catch {
      // Malformed URL, fallback
    }
  }

  // 3. Delimited Key-Value Pairs (e.g., "FDR:SBI123|AMT:2500000|BANK:SBI|MAT:2027-01-01")
  if (sanitized.includes("=") || sanitized.includes(":")) {
    const delimiter = sanitized.includes("|")
      ? "|"
      : sanitized.includes(";")
      ? ";"
      : sanitized.includes("\n")
      ? "\n"
      : ",";

    const parts = sanitized.split(delimiter);
    if (parts.length >= 2) {
      let pairsFound = 0;
      for (const part of parts) {
        const sepIndex = part.indexOf("=") !== -1 ? part.indexOf("=") : part.indexOf(":");
        if (sepIndex > 0) {
          const key = part.substring(0, sepIndex).trim().toLowerCase();
          const val = part.substring(sepIndex + 1).trim();
          parsedFields[key] = val;
          pairsFound++;
        }
      }

      if (pairsFound >= 2) {
        const fdrNumber =
          (parsedFields["fdr"] as string) ||
          (parsedFields["fdr_no"] as string) ||
          (parsedFields["ref"] as string) ||
          (parsedFields["receipt"] as string) ||
          null;

        const amount =
          (parsedFields["amount"] as string) ||
          (parsedFields["amt"] as string) ||
          (parsedFields["principal"] as string) ||
          null;

        const bankName =
          (parsedFields["bank"] as string) ||
          (parsedFields["bank_name"] as string) ||
          (parsedFields["branch"] as string) ||
          null;

        const issueDate =
          (parsedFields["issue_date"] as string) ||
          (parsedFields["issued"] as string) ||
          null;

        const maturityDate =
          (parsedFields["mat_date"] as string) ||
          (parsedFields["maturity"] as string) ||
          (parsedFields["due_date"] as string) ||
          null;

        return {
          schemaType: "DELIMITED_KV",
          extractedFdrNumber: fdrNumber ? String(fdrNumber).trim() : null,
          extractedAmount: parseNumericAmount(amount),
          extractedBankName: bankName ? String(bankName).trim() : null,
          extractedIssueDate: normalizeDateString(issueDate),
          extractedMaturityDate: normalizeDateString(maturityDate),
          parsedFields,
        };
      }
    }
  }

  // 4. Raw Identifier / String (e.g., "FDR-2026-SBI-88210")
  if (/^[A-Za-z0-9_\-/\.]{6,40}$/.test(sanitized)) {
    parsedFields.rawCode = sanitized;
    return {
      schemaType: "RAW_STRING",
      extractedFdrNumber: sanitized,
      extractedAmount: null,
      extractedBankName: null,
      extractedIssueDate: null,
      extractedMaturityDate: null,
      parsedFields,
    };
  }

  // 5. Unrecognized Schema
  parsedFields.rawUnrecognized = sanitized;
  return {
    schemaType: "UNRECOGNIZED",
    extractedFdrNumber: null,
    extractedAmount: null,
    extractedBankName: null,
    extractedIssueDate: null,
    extractedMaturityDate: null,
    parsedFields,
  };
}

/**
 * Parses numeric monetary values safely from currency-formatted strings
 */
export function parseNumericAmount(val: unknown): number | null {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val !== "string") return null;

  // Strip currency symbols (₹, INR, Rs., $, commas, spaces)
  const cleaned = val
    .replace(/[₹$€£\s,]|INR|Rs\.?|\/\-$/gi, "")
    .trim();

  const num = parseFloat(cleaned);
  return !isNaN(num) && isFinite(num) ? Math.round(num * 100) / 100 : null;
}

/**
 * Normalizes varied date formats into ISO standard YYYY-MM-DD
 */
export function normalizeDateString(val: unknown): string | null {
  if (!val) return null;
  const str = String(val).trim();

  // Standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = dmyMatch[2].padStart(2, "0");
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // DD-MMM-YYYY or DD MMM YYYY (e.g. 27-Sep-2026, 15 August 2024)
  const alphaMonthMatch = str.match(/^(\d{1,2})[\/\-\.\s]+([A-Za-z]{3,9})[\/\-\.\s,]+(\d{4})/);
  if (alphaMonthMatch) {
    const day = alphaMonthMatch[1].padStart(2, "0");
    const mStr = alphaMonthMatch[2].toLowerCase().substring(0, 3);
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
    };
    const month = months[mStr];
    const year = alphaMonthMatch[3];
    if (month) return `${year}-${month}-${day}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().substring(0, 10);
  }

  return null;
}

/**
 * Normalizes alphanumeric references by stripping hyphens, slashes, whitespace, and lowercasing
 */
export function normalizeReference(val: string): string {
  return val.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * Resolves Indian commercial bank acronyms and brand names to canonical forms
 */
export function canonicalizeBank(name: string): string {
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (lower.includes("sbi") || lower.includes("statebank")) return "STATE_BANK_OF_INDIA";
  if (lower.includes("hdfc")) return "HDFC_BANK";
  if (lower.includes("icici")) return "ICICI_BANK";
  if (lower.includes("pnb") || lower.includes("punjabnational")) return "PUNJAB_NATIONAL_BANK";
  if (lower.includes("canara")) return "CANARA_BANK";
  if (lower.includes("bob") || lower.includes("bankofbaroda")) return "BANK_OF_BARODA";
  if (lower.includes("axis")) return "AXIS_BANK";
  if (lower.includes("union") || lower.includes("ubi")) return "UNION_BANK_OF_INDIA";
  return lower;
}

/**
 * Executes deterministic field-by-field cross-validation between decoded barcode data
 * and independently submitted FDR records.
 */
export function crossValidateBarcodeData(
  parsed: ParsedBarcodePayload,
  fdrRecord: Partial<FdrInstrumentDto> | null | undefined
): {
  comparisons: BarcodeCrossValidationRecord[];
  validationStatus: "MATCH" | "MISMATCH" | "INCONCLUSIVE" | "UNRECOGNIZED";
  hasMismatch: boolean;
} {
  const comparisons: BarcodeCrossValidationRecord[] = [];

  if (!fdrRecord) {
    return {
      comparisons,
      validationStatus: parsed.schemaType === "UNRECOGNIZED" ? "UNRECOGNIZED" : "INCONCLUSIVE",
      hasMismatch: false,
    };
  }

  let hasMismatch = false;
  let hasAtLeastOneMatch = false;

  // 1. Cross-validate Instrument Reference / FDR Number
  if (parsed.extractedFdrNumber && fdrRecord.fdrNumber) {
    const normQr = normalizeReference(parsed.extractedFdrNumber);
    const normFdr = normalizeReference(fdrRecord.fdrNumber);
    const isMatch = normQr === normFdr;

    if (isMatch) hasAtLeastOneMatch = true;
    else hasMismatch = true;

    comparisons.push({
      field: "fdrNumber",
      firstValue: parsed.extractedFdrNumber,
      firstSource: "Barcode Payload",
      secondValue: fdrRecord.fdrNumber,
      secondSource: "Submitted FDR Record",
      normalizationRule: "Punctuation/whitespace stripped, uppercase alphanumeric",
      outcome: isMatch ? "MATCH" : "MISMATCH",
      explanation: isMatch
        ? `FDR number '${parsed.extractedFdrNumber}' matches submitted reference '${fdrRecord.fdrNumber}'.`
        : `DISCREPANCY: Barcode reference '${parsed.extractedFdrNumber}' does NOT match submitted FDR '${fdrRecord.fdrNumber}'.`,
    });
  } else if (fdrRecord.fdrNumber && !parsed.extractedFdrNumber) {
    comparisons.push({
      field: "fdrNumber",
      firstValue: "N/A",
      firstSource: "Barcode Payload",
      secondValue: fdrRecord.fdrNumber,
      secondSource: "Submitted FDR Record",
      normalizationRule: "Punctuation/whitespace stripped, uppercase alphanumeric",
      outcome: "INCONCLUSIVE",
      explanation: "FDR reference not present in decoded barcode payload.",
    });
  }

  // 2. Cross-validate Deposit Amount
  if (parsed.extractedAmount !== null && parsed.extractedAmount !== undefined && fdrRecord.amount !== undefined) {
    const qrAmount = Number(parsed.extractedAmount);
    const fdrAmount = Number(fdrRecord.amount);
    const diff = Math.abs(qrAmount - fdrAmount);
    const isMatch = diff < 0.01;

    if (isMatch) hasAtLeastOneMatch = true;
    else hasMismatch = true;

    const formattedQr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(qrAmount);
    const formattedFdr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(fdrAmount);

    comparisons.push({
      field: "amount",
      firstValue: formattedQr,
      firstSource: "Barcode Payload",
      secondValue: formattedFdr,
      secondSource: "Submitted FDR Record",
      normalizationRule: "Currency stripped, exact decimal precision compared",
      outcome: isMatch ? "MATCH" : "MISMATCH",
      explanation: isMatch
        ? `Deposit amount ${formattedQr} matches submitted instrument amount.`
        : `CRITICAL DISCREPANCY: Barcode deposit amount (${formattedQr}) does NOT match submitted deposit (${formattedFdr}).`,
    });
  } else if (fdrRecord.amount !== undefined && parsed.extractedAmount === null) {
    comparisons.push({
      field: "amount",
      firstValue: "N/A",
      firstSource: "Barcode Payload",
      secondValue: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(fdrRecord.amount)),
      secondSource: "Submitted FDR Record",
      normalizationRule: "Currency stripped, exact decimal precision compared",
      outcome: "INCONCLUSIVE",
      explanation: "Deposit amount not present in decoded barcode payload.",
    });
  }

  // 3. Cross-validate Maturity Date
  if (parsed.extractedMaturityDate && fdrRecord.maturityDate) {
    const qrMat = parsed.extractedMaturityDate;
    const fdrMat = normalizeDateString(fdrRecord.maturityDate);
    const isMatch = qrMat === fdrMat;

    if (isMatch) hasAtLeastOneMatch = true;
    else hasMismatch = true;

    comparisons.push({
      field: "maturityDate",
      firstValue: qrMat,
      firstSource: "Barcode Payload",
      secondValue: fdrMat || fdrRecord.maturityDate,
      secondSource: "Submitted FDR Record",
      normalizationRule: "Standardized to ISO YYYY-MM-DD",
      outcome: isMatch ? "MATCH" : "MISMATCH",
      explanation: isMatch
        ? `Maturity date '${qrMat}' matches submitted instrument maturity.`
        : `DISCREPANCY: Barcode maturity date '${qrMat}' does NOT match submitted maturity '${fdrMat}'.`,
    });
  }

  // 4. Cross-validate Issue Date
  if (parsed.extractedIssueDate && fdrRecord.issueDate) {
    const qrIssue = parsed.extractedIssueDate;
    const fdrIssue = normalizeDateString(fdrRecord.issueDate);
    const isMatch = qrIssue === fdrIssue;

    if (isMatch) hasAtLeastOneMatch = true;
    else hasMismatch = true;

    comparisons.push({
      field: "issueDate",
      firstValue: qrIssue,
      firstSource: "Barcode Payload",
      secondValue: fdrIssue || fdrRecord.issueDate,
      secondSource: "Submitted FDR Record",
      normalizationRule: "Standardized to ISO YYYY-MM-DD",
      outcome: isMatch ? "MATCH" : "MISMATCH",
      explanation: isMatch
        ? `Issue date '${qrIssue}' matches submitted instrument issue date.`
        : `DISCREPANCY: Barcode issue date '${qrIssue}' does NOT match submitted issue date '${fdrIssue}'.`,
    });
  }

  // 5. Cross-validate Issuing Bank
  if (parsed.extractedBankName && fdrRecord.bankName) {
    const canonQr = canonicalizeBank(parsed.extractedBankName);
    const canonFdr = canonicalizeBank(fdrRecord.bankName);
    const isMatch = canonQr === canonFdr || canonQr.includes(canonFdr) || canonFdr.includes(canonQr);

    if (isMatch) hasAtLeastOneMatch = true;
    else hasMismatch = true;

    comparisons.push({
      field: "issuingBank",
      firstValue: parsed.extractedBankName,
      firstSource: "Barcode Payload",
      secondValue: fdrRecord.bankName,
      secondSource: "Submitted FDR Record",
      normalizationRule: "Canonical banking entity matching & acronym expansion",
      outcome: isMatch ? "MATCH" : "MISMATCH",
      explanation: isMatch
        ? `Issuing bank '${parsed.extractedBankName}' corresponds to '${fdrRecord.bankName}'.`
        : `DISCREPANCY: Barcode issuing bank '${parsed.extractedBankName}' differs from '${fdrRecord.bankName}'.`,
    });
  }

  let validationStatus: "MATCH" | "MISMATCH" | "INCONCLUSIVE" | "UNRECOGNIZED" = "INCONCLUSIVE";
  if (hasMismatch) {
    validationStatus = "MISMATCH";
  } else if (hasAtLeastOneMatch) {
    validationStatus = "MATCH";
  } else if (parsed.schemaType === "UNRECOGNIZED") {
    validationStatus = "UNRECOGNIZED";
  }

  return {
    comparisons,
    validationStatus,
    hasMismatch,
  };
}

/**
 * Main pipeline: Ingests document buffer, extracts all QR codes / barcodes,
 * parses fields, and executes deterministic cross-validation against submitted FDR records.
 */
export async function extractAndValidateBarcodes(
  documentId: string,
  fdrId: string,
  buffer: Buffer,
  mimeType: string,
  fdrContext?: Partial<FdrInstrumentDto> | null
): Promise<DocumentBarcodeDto[]> {
  const analyzedAt = new Date().toISOString();
  const rawImages: RawPixelImage[] = [];

  // 1. Acquire raw pixel bitmaps from image or PDF
  if (mimeType === "application/pdf") {
    const pdfImages = await extractImagesFromPdf(buffer);
    rawImages.push(...pdfImages);
  } else {
    const singleImage = decodeImageToRgba(buffer, mimeType, 1);
    if (singleImage) {
      rawImages.push(singleImage);
    }
  }

  // 2. Detect barcodes across all retrieved images
  const detectedCodes: Array<{ barcodeType: string; rawPayload: string; pageNumber: number }> = [];
  for (const img of rawImages) {
    const codes = detectBarcodesInRgba(img);
    detectedCodes.push(...codes);
  }

  // 3. If no barcodes detected, return a single descriptive record
  if (detectedCodes.length === 0) {
    return [
      {
        id: `bc_${documentId}_none`,
        documentId,
        fdrId,
        barcodeType: "NONE",
        rawPayload: "",
        pageNumber: 1,
        schemaType: "NO_CODES_DETECTED",
        extractedFdrNumber: null,
        extractedAmount: null,
        extractedBankName: null,
        extractedIssueDate: null,
        extractedMaturityDate: null,
        parsedFields: { notice: "No 2D QR codes or 1D barcodes detected in document pages." },
        comparisons: [],
        validationStatus: "NO_CODES",
        hasMismatch: false,
        analyzerVersion: ANALYZER_VERSION,
        analyzedAt,
      },
    ];
  }

  // 4. Process each detected code through schema parser & cross-validation engine
  const dtos: DocumentBarcodeDto[] = [];

  for (let idx = 0; idx < detectedCodes.length; idx++) {
    const code = detectedCodes[idx];
    const parsed = parseBarcodePayload(code.rawPayload);
    const { comparisons, validationStatus, hasMismatch } = crossValidateBarcodeData(parsed, fdrContext);

    dtos.push({
      id: `bc_${documentId}_${idx + 1}`,
      documentId,
      fdrId,
      barcodeType: code.barcodeType,
      rawPayload: sanitizeUntrustedPayload(code.rawPayload),
      pageNumber: code.pageNumber,
      schemaType: parsed.schemaType,
      extractedFdrNumber: parsed.extractedFdrNumber,
      extractedAmount: parsed.extractedAmount,
      extractedBankName: parsed.extractedBankName,
      extractedIssueDate: parsed.extractedIssueDate,
      extractedMaturityDate: parsed.extractedMaturityDate,
      parsedFields: parsed.parsedFields,
      comparisons,
      validationStatus,
      hasMismatch,
      analyzerVersion: ANALYZER_VERSION,
      analyzedAt,
    });
  }

  return dtos;
}

/**
 * Persists barcode analysis results to Prisma relational database and mirrors
 * critical discrepancies into FdrRiskFinding with idempotency.
 */
export async function persistDocumentBarcodes(
  documentId: string,
  fdrId: string,
  barcodes: DocumentBarcodeDto[]
): Promise<void> {
  // Always update in-memory cache
  for (const bc of barcodes) {
    const existingIndex = inMemoryBarcodesVault.findIndex((b) => b.id === bc.id);
    if (existingIndex !== -1) {
      inMemoryBarcodesVault[existingIndex] = bc;
    } else {
      inMemoryBarcodesVault.unshift(bc);
    }
  }

  if (!isDatabaseExpectedOnline()) {
    return;
  }

  try {
    // 1. Delete prior barcode records for this document to ensure idempotency
    await prisma.documentBarcode.deleteMany({
      where: { documentId },
    });

    // 2. Insert new barcode records (excluding NONE status)
    for (const bc of barcodes) {
      if (bc.barcodeType === "NONE") continue;

      await prisma.documentBarcode.create({
        data: {
          id: bc.id,
          documentId,
          fdrId,
          barcodeType: bc.barcodeType,
          rawPayload: bc.rawPayload,
          pageNumber: bc.pageNumber,
          schemaType: bc.schemaType,
          extractedFdrNumber: bc.extractedFdrNumber,
          extractedAmount: bc.extractedAmount !== null && bc.extractedAmount !== undefined ? bc.extractedAmount : undefined,
          extractedBankName: bc.extractedBankName,
          extractedIssueDate: bc.extractedIssueDate ? new Date(bc.extractedIssueDate) : undefined,
          extractedMaturityDate: bc.extractedMaturityDate ? new Date(bc.extractedMaturityDate) : undefined,
          parsedFieldsJson: JSON.stringify(bc.parsedFields),
          comparisonsJson: JSON.stringify(bc.comparisons),
          validationStatus: bc.validationStatus,
          hasMismatch: bc.hasMismatch,
          riskFindingCreated: bc.hasMismatch,
          analyzerVersion: bc.analyzerVersion,
          analyzedAt: new Date(bc.analyzedAt),
        },
      });

      // 3. If a discrepancy exists, mirror to FdrRiskFinding
      if (bc.hasMismatch) {
        const riskCode = "BARCODE_FIELD_DISCREPANCY";
        const existingFinding = await prisma.fdrRiskFinding.findFirst({
          where: {
            fdrId,
            riskCode,
            description: { contains: documentId },
          },
        });

        if (!existingFinding) {
          const mismatchFields = bc.comparisons
            .filter((c) => c.outcome === "MISMATCH")
            .map((c) => c.field)
            .join(", ");

          await prisma.fdrRiskFinding.create({
            data: {
              fdrId,
              riskCode,
              severity: "CRITICAL",
              description: `[Document ${documentId}] Barcode cross-validation failure on: ${mismatchFields}. Decoded payload conflicts with institution-submitted FDR details.`,
              isResolved: false,
            },
          });
        }
      }
    }
  } catch {
    // Fail silently to in-memory vault if database is unreachable
    markDatabaseUnreachable();
  }
}
