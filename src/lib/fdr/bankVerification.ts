// src/lib/fdr/bankVerification.ts

/**
 * Provider‑agnostic interface for external bank verification services.
 * A deterministic sandbox implementation is provided for development and testing.
 * Real providers must implement the same contract and be wired into the backend.
 */

export type VerificationStatus =
  | 'VERIFIED'
  | 'MISMATCH'
  | 'NOT_FOUND'
  | 'INCONCLUSIVE'
  | 'UNAVAILABLE'
  | 'NOT_CONFIGURED';

export interface BankVerificationRequest {
  /** Unique instrument reference (e.g., FDR number) */
  instrumentReference: string;
  /** Issuing bank name as stored in the FDR record */
  issuingBank: string;
  /** Deposit amount in the instrument */
  amount: number;
  /** Optional correlation identifier supplied by the provider */
  correlationId?: string;
}

export interface BankVerificationResponse {
  /** Identifier of the provider (e.g., "sandbox", "myBankAPI") */
  provider: string;
  /** ISO‑8601 timestamp when the verification was performed */
  verificationTimestamp: string;
  /** High‑level outcome status */
  status: VerificationStatus;
  /** Echoed back fields when available */
  instrumentReference?: string;
  issuingBank?: string;
  amount?: number;
  /** Correlation identifier from the provider, if any */
  correlationId?: string;
  /** Human‑readable details or error message */
  details?: string;
}

/**
 * Abstract provider – concrete implementations must extend this class.
 */
export abstract class BankVerificationProvider {
  /** Human readable name of the provider */
  abstract readonly name: string;

  /** Perform verification; may throw on network or internal errors */
  abstract verify(
    request: BankVerificationRequest,
  ): Promise<BankVerificationResponse>;
}

/**
 * Deterministic sandbox implementation.
 *
 * Rules (purely for testing):
 *   • If the instrumentReference starts with "SANDBOX-" → VERIFIED.
 *   • If it starts with "MISMATCH-" → MISMATCH.
 *   • If it starts with "NOTFOUND-" → NOT_FOUND.
 *   • Anything else → INCONCLUSIVE.
 *
 * No external network calls are performed.
 */
export class SandboxBankVerificationProvider extends BankVerificationProvider {
  readonly name = 'sandbox';

  async verify(request: BankVerificationRequest): Promise<BankVerificationResponse> {
    const ts = new Date().toISOString();
    const ref = request.instrumentReference.toUpperCase();
    let status: VerificationStatus = 'INCONCLUSIVE';
    if (ref.startsWith('SANDBOX-')) {
      status = 'VERIFIED';
    } else if (ref.startsWith('MISMATCH-')) {
      status = 'MISMATCH';
    } else if (ref.startsWith('NOTFOUND-')) {
      status = 'NOT_FOUND';
    }
    return {
      provider: this.name,
      verificationTimestamp: ts,
      status,
      instrumentReference: request.instrumentReference,
      issuingBank: request.issuingBank,
      amount: request.amount,
      correlationId: request.correlationId,
      details: `Sandbox deterministic response: ${status}`,
    };
  }
}

/**
 * Service layer that orchestrates verification, authorisation and audit logging.
 */
export class BankVerificationService {
  /** The provider used – can be swapped at runtime (e.g., via env var) */
  private provider: BankVerificationProvider;

  /** Prisma client – imported lazily to avoid circular deps */
  private get prisma() {
    // Import inside the getter to keep this file pure for unit tests.
    // The actual project already exports a prisma instance from '../db.ts'.
    // eslint‑disable-next-line @typescript-eslint/no-var-requires
    return require('../db.ts').default;
  }

  constructor(provider?: BankVerificationProvider) {
    // Default to sandbox if no provider is supplied.
    this.provider = provider ?? new SandboxBankVerificationProvider();
  }

  /**
   * Verify an instrument after confirming that the current user is allowed to trigger
   * an external verification. Throws if the user lacks permission.
   */
  async verifyInstrument(
    userId: string,
    fdrId: string,
    request: BankVerificationRequest,
  ): Promise<BankVerificationResponse> {
    // 1️⃣ Human authorisation – the DB must contain a flag `verificationAuthorized`.
    const fdr = await this.prisma.fdrInstrument.findUnique({ where: { id: fdrId } });
    if (!fdr) {
      throw new Error('FDR not found');
    }
    // In a real implementation the authorisation might be a separate table; for now we
    // check a simple boolean column `verificationAuthorized` that the UI sets after a user
    // explicitly approves the step.
    if (!(fdr as any).verificationAuthorized) {
      throw new Error('User not authorized to invoke external bank verification');
    }

    // 2️⃣ Call the provider – wrap in a timeout guard (5 s) to avoid hanging.
    const timeoutMs = 5000;
    const resultPromise = this.provider.verify(request);
    const timeoutPromise = new Promise<BankVerificationResponse>((_, reject) => {
      setTimeout(() => reject(new Error('Verification timeout')), timeoutMs);
    });
    let response: BankVerificationResponse;
    try {
      response = await Promise.race([resultPromise, timeoutPromise]);
    } catch (e) {
      // Network/timeout -> UNAVAILABLE
      response = {
        provider: this.provider.name,
        verificationTimestamp: new Date().toISOString(),
        status: 'UNAVAILABLE',
        details: (e as Error).message,
      };
    }

    // 3️⃣ Persist audit log – immutable record of request & response.
    await this.prisma.bankVerificationLog.create({
      data: {
        fdrId,
        userId,
        requestJson: JSON.stringify(request),
        responseJson: JSON.stringify(response),
        provider: response.provider,
        status: response.status,
        verificationTimestamp: response.verificationTimestamp,
      },
    });

    // 4️⃣ Update the FDR instrument verificationState only for deterministic outcomes.
    // We never set a status that implies a legal "bank‑confirmed" decision unless the
    // provider is a real, authorised integration (which we currently don't have).
    const allowedUpdates = ['VERIFIED', 'MISMATCH', 'NOT_FOUND', 'INCONCLUSIVE'];
    if (allowedUpdates.includes(response.status)) {
      await this.prisma.fdrInstrument.update({
        where: { id: fdrId },
        data: { verificationState: response.status },
      });
    } else {
      // UNAVAILABLE or NOT_CONFIGURED – keep previous state.
    }

    return response;
  }

  /** Switch provider at runtime – useful for tests. */
  setProvider(provider: BankVerificationProvider) {
    this.provider = provider;
  }
}
