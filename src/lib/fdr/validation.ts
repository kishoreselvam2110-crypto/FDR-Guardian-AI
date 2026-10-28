import path from "path";

/**
 * File validation and forensic integrity checks for uploaded FDR documents.
 */

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 Megabytes

export type SupportedMimeType = "application/pdf" | "image/jpeg" | "image/png";

export interface MagicByteRule {
  mimeType: SupportedMimeType;
  extensions: string[];
  description: string;
  check: (buffer: Buffer) => boolean;
}

export const SUPPORTED_RULES: MagicByteRule[] = [
  {
    mimeType: "application/pdf",
    extensions: [".pdf"],
    description: "Adobe Portable Document Format (PDF)",
    check: (buf: Buffer) => {
      // PDF magic bytes: '%PDF-' (0x25, 0x50, 0x44, 0x46, 0x2D)
      if (buf.length < 5) return false;
      return (
        buf[0] === 0x25 &&
        buf[1] === 0x50 &&
        buf[2] === 0x44 &&
        buf[3] === 0x46 &&
        buf[4] === 0x2d
      );
    },
  },
  {
    mimeType: "image/jpeg",
    extensions: [".jpg", ".jpeg"],
    description: "Joint Photographic Experts Group (JPEG)",
    check: (buf: Buffer) => {
      // JPEG magic bytes: 0xFF, 0xD8, 0xFF
      if (buf.length < 3) return false;
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    },
  },
  {
    mimeType: "image/png",
    extensions: [".png"],
    description: "Portable Network Graphics (PNG)",
    check: (buf: Buffer) => {
      // PNG magic bytes: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
      if (buf.length < 8) return false;
      return (
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47 &&
        buf[4] === 0x0d &&
        buf[5] === 0x0a &&
        buf[6] === 0x1a &&
        buf[7] === 0x0a
      );
    },
  },
];

export interface FileValidationResult {
  isValid: boolean;
  sanitizedFileName: string;
  detectedMimeType: SupportedMimeType | null;
  fileSizeBytes: number;
  errorCode?: "EMPTY_FILE" | "FILE_TOO_LARGE" | "UNSUPPORTED_TYPE" | "SIGNATURE_MISMATCH" | "INVALID_NAME";
  errorMessage?: string;
}

/**
 * Sanitizes client-provided filenames to prevent path traversal or filesystem exploits
 */
export function sanitizeFileName(rawFileName: string): string {
  if (!rawFileName || typeof rawFileName !== "string") {
    return "document_unnamed.pdf";
  }

  // 1. Strip null bytes and directory components
  let cleanName = rawFileName.replace(/\0/g, "");
  cleanName = path.basename(cleanName);

  // 2. Remove dangerous path traversal sequences
  cleanName = cleanName.replace(/(\.\.[\/\\])+/g, "");

  // 3. Remove characters that are unsafe on Linux/Windows/macOS filesystems
  cleanName = cleanName.replace(/[^a-zA-Z0-9._-]/g, "_");

  // 4. Prevent hidden file prefixes (e.g. .env, .htaccess)
  cleanName = cleanName.replace(/^\.+/, "");

  // 5. Enforce sane length boundary
  if (cleanName.length === 0) {
    cleanName = "uploaded_document.dat";
  } else if (cleanName.length > 120) {
    const ext = path.extname(cleanName);
    const stem = path.basename(cleanName, ext).substring(0, 110);
    cleanName = `${stem}${ext}`;
  }

  return cleanName;
}

/**
 * Validates file buffer size, magic bytes signature, and extension consistency
 */
export function validateDocumentFile(
  buffer: Buffer,
  rawFileName: string,
  declaredMimeType?: string
): FileValidationResult {
  const sanitizedFileName = sanitizeFileName(rawFileName);
  const fileSizeBytes = buffer.length;

  // 1. Empty buffer check
  if (fileSizeBytes === 0) {
    return {
      isValid: false,
      sanitizedFileName,
      detectedMimeType: null,
      fileSizeBytes: 0,
      errorCode: "EMPTY_FILE",
      errorMessage: "Uploaded file is empty (0 bytes).",
    };
  }

  // 2. File size limit enforcement
  if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    const maxMb = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
    const actualMb = (fileSizeBytes / (1024 * 1024)).toFixed(2);
    return {
      isValid: false,
      sanitizedFileName,
      detectedMimeType: null,
      fileSizeBytes,
      errorCode: "FILE_TOO_LARGE",
      errorMessage: `File size (${actualMb} MB) exceeds maximum allowed limit of ${maxMb} MB.`,
    };
  }

  // 3. Magic bytes inspection
  const matchingRule = SUPPORTED_RULES.find((rule) => rule.check(buffer));
  if (!matchingRule) {
    return {
      isValid: false,
      sanitizedFileName,
      detectedMimeType: null,
      fileSizeBytes,
      errorCode: "UNSUPPORTED_TYPE",
      errorMessage:
        "File signature does not match any allowed format. Only genuine PDF, JPEG, and PNG files are accepted.",
    };
  }

  // 4. File extension consistency check
  const ext = path.extname(sanitizedFileName).toLowerCase();
  if (!matchingRule.extensions.includes(ext)) {
    return {
      isValid: false,
      sanitizedFileName,
      detectedMimeType: matchingRule.mimeType,
      fileSizeBytes,
      errorCode: "SIGNATURE_MISMATCH",
      errorMessage: `File extension '${ext}' does not match its detected binary format (${matchingRule.description}). Potential file spoofing attempt detected.`,
    };
  }

  // 5. Declared MIME cross-check (if provided by client)
  if (declaredMimeType) {
    const normalizedDeclared = declaredMimeType.toLowerCase().trim();
    if (
      normalizedDeclared !== matchingRule.mimeType &&
      !(normalizedDeclared === "image/jpg" && matchingRule.mimeType === "image/jpeg") &&
      !(normalizedDeclared === "application/x-pdf" && matchingRule.mimeType === "application/pdf")
    ) {
      return {
        isValid: false,
        sanitizedFileName,
        detectedMimeType: matchingRule.mimeType,
        fileSizeBytes,
        errorCode: "SIGNATURE_MISMATCH",
        errorMessage: `Declared MIME type '${declaredMimeType}' contradicts detected file format '${matchingRule.mimeType}'.`,
      };
    }
  }

  return {
    isValid: true,
    sanitizedFileName,
    detectedMimeType: matchingRule.mimeType,
    fileSizeBytes,
  };
}
