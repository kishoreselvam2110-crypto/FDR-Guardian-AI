import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";

import {
  validateDocumentFile,
  sanitizeFileName,
  MAX_FILE_SIZE_BYTES,
} from "../validation.ts";
import {
  saveDocument,
  retrieveDocument,
  deleteDocument,
  storageFileExists,
  generateStorageKey,
  computeSha256,
  getStorageDirectory,
} from "../../storage/fdrStorage.ts";
import {
  resolveAuthContext,
  verifyFdrAccess,
  CENTRAL_REGULATORY_ROLES,
} from "../auth.ts";

// Helper buffers
const VALID_PDF_BUFFER = Buffer.from(
  "%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Title (FDR Certificate SBI) >>\nendobj\nxref\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
);
const VALID_JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const VALID_PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const FAKE_EXE_BUFFER = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ executable header

describe("FDR Document Ingestion - Content & Magic-Byte Validation", () => {
  it("should validate and accept genuine PDF document buffer", () => {
    const res = validateDocumentFile(VALID_PDF_BUFFER, "sbi_certificate_scan.pdf", "application/pdf");
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.detectedMimeType, "application/pdf");
    assert.strictEqual(res.sanitizedFileName, "sbi_certificate_scan.pdf");
  });

  it("should validate and accept genuine JPEG and PNG image buffers", () => {
    const resJpg = validateDocumentFile(VALID_JPEG_BUFFER, "deposit_receipt.jpg", "image/jpeg");
    assert.strictEqual(resJpg.isValid, true);
    assert.strictEqual(resJpg.detectedMimeType, "image/jpeg");

    const resPng = validateDocumentFile(VALID_PNG_BUFFER, "bank_endorsement.png", "image/png");
    assert.strictEqual(resPng.isValid, true);
    assert.strictEqual(resPng.detectedMimeType, "image/png");
  });

  it("should reject renamed unsupported file by inspecting binary magic bytes", () => {
    // Malicious actor renames a Windows .exe binary to .pdf
    const res = validateDocumentFile(FAKE_EXE_BUFFER, "malicious_payload.pdf", "application/pdf");
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, "UNSUPPORTED_TYPE");
    assert.match(res.errorMessage || "", /File signature does not match any allowed format/);
  });

  it("should reject an empty 0-byte file upload", () => {
    const emptyBuf = Buffer.alloc(0);
    const res = validateDocumentFile(emptyBuf, "empty.pdf", "application/pdf");
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, "EMPTY_FILE");
  });

  it("should reject an oversized file exceeding maximum 15 MB threshold", () => {
    // Construct a buffer 1 byte larger than 15 MB
    const oversizedLength = MAX_FILE_SIZE_BYTES + 1;
    const oversizedMock = {
      length: oversizedLength,
    } as Buffer;

    const res = validateDocumentFile(oversizedMock, "large_scan.pdf", "application/pdf");
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, "FILE_TOO_LARGE");
    assert.match(res.errorMessage || "", /exceeds maximum allowed limit/);
  });

  it("should sanitize filenames and prevent path traversal sequences", () => {
    const malicious = "../../../etc/passwd.pdf";
    const sanitized = sanitizeFileName(malicious);
    assert.strictEqual(sanitized.includes(".."), false);
    assert.strictEqual(sanitized.includes("/"), false);
    assert.strictEqual(sanitized.includes("\\"), false);
    assert.strictEqual(sanitized, "passwd.pdf");

    const withNullBytes = "certificate\0evil.exe.pdf";
    const cleanNull = sanitizeFileName(withNullBytes);
    assert.strictEqual(cleanNull.includes("\0"), false);
  });
});

describe("FDR Private Storage Vault - Isolation & Integrity", () => {
  const createdTestKeys: string[] = [];

  after(async () => {
    // Cleanup any test artifacts
    for (const key of createdTestKeys) {
      await deleteDocument(key);
    }
  });

  it("should store private files strictly outside public web root", () => {
    const storageDir = getStorageDirectory();
    const publicDir = path.resolve(process.cwd(), "public");

    // Must never be inside public/
    assert.strictEqual(
      storageDir.startsWith(publicDir),
      false,
      "CRITICAL: Storage directory must not reside inside public/"
    );
    assert.strictEqual(storageDir.includes(path.join("storage", "private")), true);
  });

  it("should write and retrieve document buffer with exact SHA-256 integrity", async () => {
    const storageKey = generateStorageKey();
    createdTestKeys.push(storageKey);

    const writeRes = await saveDocument(storageKey, VALID_PDF_BUFFER);
    assert.strictEqual(writeRes.bytesWritten, VALID_PDF_BUFFER.length);

    const expectedChecksum = computeSha256(VALID_PDF_BUFFER);
    assert.strictEqual(writeRes.checksum, expectedChecksum);

    // Verify physical file existence
    const exists = await storageFileExists(storageKey);
    assert.strictEqual(exists, true);

    // Retrieve file and verify content identity
    const retrieved = await retrieveDocument(storageKey);
    assert.notStrictEqual(retrieved, null);
    assert.strictEqual(retrieved?.size, VALID_PDF_BUFFER.length);
    assert.strictEqual(retrieved?.checksum, expectedChecksum);
    assert.deepStrictEqual(retrieved?.buffer, VALID_PDF_BUFFER);
  });

  it("should prohibit path traversal via malicious storage keys", async () => {
    const maliciousKey = "../../secret_system_file";
    await assert.rejects(
      async () => {
        await saveDocument(maliciousKey, VALID_PDF_BUFFER);
      },
      /Security Alert: Invalid storage key format/
    );

    await assert.rejects(
      async () => {
        await retrieveDocument(maliciousKey);
      },
      /Security Alert: Invalid storage key format/
    );
  });

  it("should delete document cleanly and prevent orphaned files on failed operations", async () => {
    const rollbackKey = generateStorageKey();
    await saveDocument(rollbackKey, VALID_JPEG_BUFFER);

    assert.strictEqual(await storageFileExists(rollbackKey), true);

    // Simulate rollback on database failure
    const deleted = await deleteDocument(rollbackKey);
    assert.strictEqual(deleted, true);
    assert.strictEqual(await storageFileExists(rollbackKey), false);

    // Subsequent retrieval returns null
    const missing = await retrieveDocument(rollbackKey);
    assert.strictEqual(missing, null);
  });
});

describe("FDR Authorization - Institutional Scoping & Regulatory Roles", () => {
  it("should grant central regulatory officers universal institution access", () => {
    for (const role of CENTRAL_REGULATORY_ROLES) {
      const officer = {
        userId: "usr-reg-01",
        userName: "Officer Test",
        userRole: role,
        isRegulatoryOfficer: true,
      };

      const checkA = verifyFdrAccess(officer, "inst-apex-01");
      assert.strictEqual(checkA.allowed, true);

      const checkB = verifyFdrAccess(officer, "inst-bharat-02");
      assert.strictEqual(checkB.allowed, true);
    }
  });

  it("should permit an institution nodal officer to access their own FDRs", () => {
    const nodalOfficer = {
      userId: "usr-nodal-01",
      userName: "Nodal Officer Apex",
      userRole: "Institution Nodal Officer",
      institutionId: "inst-apex-01",
      isRegulatoryOfficer: false,
    };

    const checkOwn = verifyFdrAccess(nodalOfficer, "inst-apex-01");
    assert.strictEqual(checkOwn.allowed, true);
  });

  it("should strictly deny an institution nodal officer from accessing another institution's FDRs", () => {
    const nodalOfficerApex = {
      userId: "usr-nodal-01",
      userName: "Nodal Officer Apex",
      userRole: "Institution Nodal Officer",
      institutionId: "inst-apex-01",
      isRegulatoryOfficer: false,
    };

    // Attempt to access Bharat Institute's FDR (inst-bharat-02)
    const crossAccessCheck = verifyFdrAccess(nodalOfficerApex, "inst-bharat-02");
    assert.strictEqual(crossAccessCheck.allowed, false);
    assert.match(crossAccessCheck.reason || "", /Access Denied/);
  });

  it("should reject unauthenticated requests when header signal is present", () => {
    const mockReq = new Request("http://localhost:3000/api/fdr/fdr-1/documents", {
      headers: { "x-unauthenticated": "true" },
    });

    const auth = resolveAuthContext(mockReq);
    assert.strictEqual(auth, null);
  });
});
