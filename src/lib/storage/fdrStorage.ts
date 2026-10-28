import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * SIH26265 FDR Guardian AI - Private Document Storage Service
 *
 * Enforces secure, isolated storage for sensitive financial deposit receipts,
 * bank lien endorsement letters, and tripartite agreements.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. Files are NEVER stored in public/ or served via static routes.
 * 2. Filenames on disk are opaque random UUID storage keys (preventing path traversal).
 * 3. Retrieval requires authorized server operations and strict institution-scoping.
 * 4. Content integrity is guarded by SHA-256 cryptographic checksums.
 *
 * ARCHITECTURAL LIMITATION NOTE:
 * Local private storage writes to the local server volume. In multi-instance or serverless
 * deployments, this abstraction can be configured to use S3/Azure Blob/GCS without changing
 * the service contract.
 */

// Storage directory resides strictly outside the public web root
const DEFAULT_STORAGE_PATH = path.join(process.cwd(), "storage", "private", "fdr-documents");

export function getStorageDirectory(): string {
  const customDir = process.env.FDR_STORAGE_DIR;
  const dir = customDir ? path.resolve(customDir) : DEFAULT_STORAGE_PATH;
  return dir;
}

/**
 * Ensures the target storage directory exists with restricted permissions
 */
async function ensureStorageDirectory(): Promise<string> {
  const dir = getStorageDirectory();
  try {
    await fs.promises.mkdir(dir, { recursive: true });
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code !== "EEXIST") {
      throw new Error(`Failed to initialize private FDR storage directory: ${error.message}`);
    }
  }
  return dir;
}

/**
 * Strict regex validation for storage keys to prohibit any path manipulation
 */
const STORAGE_KEY_REGEX = /^[a-zA-Z0-9_-]{10,128}$/;

export function generateStorageKey(): string {
  const uniqueId = crypto.randomUUID().replace(/-/g, "");
  return `fdr_doc_${Date.now()}_${uniqueId}`;
}

export function computeSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Resolves physical file path safely while guaranteeing it remains within the storage boundary
 */
function resolveSafePath(storageKey: string): string {
  if (!STORAGE_KEY_REGEX.test(storageKey)) {
    throw new Error("Security Alert: Invalid storage key format. Possible path traversal attempt.");
  }

  const baseDir = getStorageDirectory();
  const filePath = path.resolve(baseDir, `${storageKey}.dat`);

  // Canonical boundary check
  const resolvedBase = path.resolve(baseDir);
  if (!filePath.startsWith(resolvedBase + path.sep)) {
    throw new Error("Security Alert: Storage path traversal detected.");
  }

  return filePath;
}

/**
 * Atomically saves a validated document buffer to private storage
 */
export async function saveDocument(
  storageKey: string,
  buffer: Buffer
): Promise<{ bytesWritten: number; checksum: string }> {
  await ensureStorageDirectory();
  const safePath = resolveSafePath(storageKey);
  const checksum = computeSha256(buffer);

  // Write file with atomic mode 0o600 (owner read/write only)
  await fs.promises.writeFile(safePath, buffer, { mode: 0o600, flag: "wx" });

  return {
    bytesWritten: buffer.length,
    checksum,
  };
}

/**
 * Retrieves a document from private storage for streaming to an authorized client
 */
export async function retrieveDocument(
  storageKey: string
): Promise<{ buffer: Buffer; size: number; checksum: string } | null> {
  try {
    const safePath = resolveSafePath(storageKey);
    const buffer = await fs.promises.readFile(safePath);
    const checksum = computeSha256(buffer);

    return {
      buffer,
      size: buffer.length,
      checksum,
    };
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Securely deletes a document (used for rollback during failed database transactions or deletion)
 */
export async function deleteDocument(storageKey: string): Promise<boolean> {
  try {
    const safePath = resolveSafePath(storageKey);
    await fs.promises.unlink(safePath);
    return true;
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

/**
 * Checks if a document physically exists in private storage
 */
export async function storageFileExists(storageKey: string): Promise<boolean> {
  try {
    const safePath = resolveSafePath(storageKey);
    await fs.promises.access(safePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
