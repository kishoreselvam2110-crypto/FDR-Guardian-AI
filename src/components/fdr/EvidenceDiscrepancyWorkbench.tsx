"use client";

import React, { useState, useMemo } from "react";
import type {
  FdrInstrumentDto,
  DocumentDto,
  BankVerificationResponseDto,
  EvidenceDiscrepancyField,
} from "@/lib/fdr/types";
import { OCR_CONFIDENCE_STATUTORY_DISCLAIMER } from "@/lib/fdr/types";
import { compareEvidenceFields } from "@/lib/fdr/lifecycleService";
import { submitFieldCorrectionAction } from "@/lib/fdr/service";

interface EvidenceDiscrepancyWorkbenchProps {
  instruments: FdrInstrumentDto[];
  initialFdrId?: string;
  documents: DocumentDto[];
  bankVerifications: BankVerificationResponseDto[];
  currentRole: string;
  onOpenUploadModal: (fdrId: string) => void;
  showToast: (toast: {
    title: string;
    message: string;
    type: "success" | "info" | "warning" | "error";
  }) => void;
  onSelectInstrument?: (fdrId: string) => void;
}

export function EvidenceDiscrepancyWorkbench({
  instruments,
  initialFdrId,
  documents,
  bankVerifications,
  currentRole,
  onOpenUploadModal,
  showToast,
  onSelectInstrument,
}: EvidenceDiscrepancyWorkbenchProps) {
  const [selectedFdrId, setSelectedFdrId] = useState<string>(
    initialFdrId || instruments[0]?.id || ""
  );

  const selectedInstrument = useMemo(() => {
    return instruments.find((i) => i.id === selectedFdrId) || instruments[0];
  }, [instruments, selectedFdrId]);

  const activeDocuments = useMemo(() => {
    return documents.filter((d) => d.fdrId === selectedInstrument?.id);
  }, [documents, selectedInstrument]);

  const activeBankVerifications = useMemo(() => {
    return bankVerifications.filter((bv) => bv.fdrId === selectedInstrument?.id);
  }, [bankVerifications, selectedInstrument]);

  const primaryDoc = activeDocuments[0] || null;
  const latestBankVerification = activeBankVerifications[0] || null;

  // Compute the 5 evidence comparison fields
  const discrepancyFields: EvidenceDiscrepancyField[] = useMemo(() => {
    if (!selectedInstrument) return [];
    return compareEvidenceFields(selectedInstrument, primaryDoc, latestBankVerification);
  }, [selectedInstrument, primaryDoc, latestBankVerification]);

  // Correction Modal State
  const [correctionModal, setCorrectionModal] = useState<{
    isOpen: boolean;
    field: EvidenceDiscrepancyField | null;
    correctedValue: string;
    justification: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    field: null,
    correctedValue: "",
    justification: "",
    isSubmitting: false,
  });

  const handleOpenCorrection = (field: EvidenceDiscrepancyField) => {
    setCorrectionModal({
      isOpen: true,
      field,
      correctedValue: field.extractedValue || field.submittedValue,
      justification: "",
      isSubmitting: false,
    });
  };

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionModal.field || !primaryDoc?.extractedData?.id) {
      showToast({
        title: "Correction Unavailable",
        message: "No active extraction record is linked to this document scan.",
        type: "error",
      });
      return;
    }

    if (correctionModal.justification.trim().length < 10) {
      showToast({
        title: "Justification Required",
        message: "A mandatory regulatory explanation (minimum 10 characters) is required to correct OCR readings.",
        type: "error",
      });
      return;
    }

    setCorrectionModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      await submitFieldCorrectionAction({
        extractionId: primaryDoc.extractedData.id,
        fdrId: selectedInstrument.id,
        institutionId: selectedInstrument.institutionId,
        fieldName: correctionModal.field.fieldKey,
        correctedValue: correctionModal.correctedValue,
        justification: correctionModal.justification,
        officerId: "usr-officer",
        officerName: "Regulatory Scrutiny Officer",
        officerRole: currentRole || "Regulatory Scrutiny Officer",
      });

      showToast({
        title: "Field Correction Recorded",
        message: `Value for '${correctionModal.field.fieldLabel}' corrected and logged in audit ledger. Original value preserved.`,
        type: "success",
      });

      setCorrectionModal({
        isOpen: false,
        field: null,
        correctedValue: "",
        justification: "",
        isSubmitting: false,
      });
    } catch (err: unknown) {
      const error = err as Error;
      setCorrectionModal((prev) => ({ ...prev, isSubmitting: false }));
      showToast({
        title: "Correction Failed",
        message: error.message,
        type: "error",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. MANDATED REGULATORY STATUTORY DISCLAIMER */}
      <div className="p-4 rounded-2xl border border-amber-300 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/20 text-xs text-amber-900 dark:text-amber-200">
        <div className="flex items-start gap-2.5">
          <span className="text-lg">⚖️</span>
          <div>
            <h4 className="font-bold uppercase tracking-wider font-mono text-[11px] text-amber-950 dark:text-amber-100">
              Statutory Evidence Non-Authenticity Disclosures
            </h4>
            <p className="mt-1 leading-relaxed text-slate-700 dark:text-slate-300">
              {OCR_CONFIDENCE_STATUTORY_DISCLAIMER}
            </p>
            <p className="mt-1 text-[11px] font-mono text-amber-800 dark:text-amber-400">
              Rule 14-B AICTE Regulations: Direct bank confirmation (via SFMS or issuing branch letter) is mandatory for legal release.
            </p>
          </div>
        </div>
      </div>

      {/* 2. INSTRUMENT SELECTION & EVIDENCE OVERVIEW BAR */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
              Active Scrutiny Dossier
            </span>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <select
                value={selectedFdrId}
                onChange={(e) => {
                  setSelectedFdrId(e.target.value);
                  if (onSelectInstrument) onSelectInstrument(e.target.value);
                }}
                className="px-3 py-1.5 text-xs font-mono font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-600"
              >
                {instruments.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.fdrNumber} — {inst.institutionName} (₹{(inst.amount / 100000).toFixed(1)}L)
                  </option>
                ))}
              </select>

              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {selectedInstrument?.bankName} ({selectedInstrument?.ifscCode})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenUploadModal(selectedInstrument.id)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-teal-600 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/50 transition-colors cursor-pointer"
            >
              + Ingest Document Scan
            </button>
          </div>
        </div>
      </div>

      {/* 3. SIDE-BY-SIDE EVIDENCE COMPARISON MATRIX */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Triangulated Evidence Comparison Matrix
            </h3>
            <p className="text-xs text-slate-500">
              Cross-validating Registry Values vs. OCR Extracted Text vs. Independent Bank Records
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-slate-500">
            {discrepancyFields.filter((f) => f.isMismatch).length} Mismatch{discrepancyFields.filter((f) => f.isMismatch).length === 1 ? "" : "es"} Detected
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="p-3 pl-4">Field Attribute</th>
                <th className="p-3">Submitted (Registry)</th>
                <th className="p-3">OCR Extracted (Scan)</th>
                <th className="p-3">Bank Verified (Gateway)</th>
                <th className="p-3">Extraction Confidence</th>
                <th className="p-3">Review Status</th>
                <th className="p-3 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {discrepancyFields.map((field) => (
                <tr
                  key={field.fieldKey}
                  className={`transition-colors duration-150 motion-reduce:transition-none ${
                    field.isMismatch
                      ? "bg-rose-50/40 dark:bg-rose-950/10 hover:bg-rose-50/60"
                      : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <td className="p-3 pl-4">
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">
                      {field.fieldLabel}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {field.documentReference || "No scan attached"}
                    </span>
                  </td>

                  {/* Submitted Value */}
                  <td className="p-3 font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {field.submittedValue}
                  </td>

                  {/* OCR Extracted Value */}
                  <td className="p-3 font-mono">
                    {field.extractedValue ? (
                      <span
                        className={`font-semibold ${
                          field.isMismatch
                            ? "text-rose-700 dark:text-rose-300 underline decoration-rose-500 font-bold"
                            : "text-slate-800 dark:text-slate-200"
                        }`}
                      >
                        {field.extractedValue}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Not detected</span>
                    )}

                    {field.corrections.length > 0 && (
                      <span className="block text-[9px] font-mono text-teal-600 font-bold mt-0.5">
                        ✎ Corrected ({field.corrections.length}x)
                      </span>
                    )}
                  </td>

                  {/* Bank Verified Value */}
                  <td className="p-3 font-mono">
                    {field.verifiedValue ? (
                      <span className="text-teal-700 dark:text-teal-300 font-semibold">
                        {field.verifiedValue}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px] italic">Pending inquiry</span>
                    )}
                  </td>

                  {/* Extraction Confidence */}
                  <td className="p-3">
                    {field.extractionConfidence !== null ? (
                      <div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className={`h-full ${
                                field.extractionConfidence >= 0.85
                                  ? "bg-teal-500"
                                  : field.extractionConfidence >= 0.6
                                  ? "bg-amber-500"
                                  : "bg-rose-500"
                              }`}
                              style={{ width: `${Math.min(100, field.extractionConfidence * 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            {(field.extractionConfidence * 100).toFixed(1)}%
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400 block mt-0.5">
                          Glyph certainty only
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px]">—</span>
                    )}
                  </td>

                  {/* Review Status */}
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        field.reviewStatus === "MATCH"
                          ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                          : field.reviewStatus === "MANUALLY_CORRECTED"
                          ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                          : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                      }`}
                    >
                      {field.reviewStatus === "MATCH"
                        ? "✓ Matched"
                        : field.reviewStatus === "MANUALLY_CORRECTED"
                        ? "✎ Corrected"
                        : "⚠ Discrepancy"}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="p-3 pr-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleOpenCorrection(field)}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                    >
                      Correct OCR
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. GRANULAR DISCREPANCY CARDS WITH RULE CONTRACT & NEXT STEPS */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Discrepancy Analysis & Regulatory Prescriptions
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {discrepancyFields.map((field) => (
            <div
              key={`detail-${field.fieldKey}`}
              className={`p-4 rounded-2xl border ${
                field.isMismatch
                  ? "border-rose-300 dark:border-rose-900 bg-rose-50/30 dark:bg-rose-950/10"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              } shadow-2xs space-y-3`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {field.fieldLabel}
                </span>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                    field.isMismatch
                      ? "bg-rose-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {field.isMismatch ? "DISCREPANCY DETECTED" : "VERIFIED CONSISTENT"}
                </span>
              </div>

              <div className="text-xs space-y-1.5">
                <div>
                  <span className="text-slate-400 font-mono text-[10px] block uppercase">
                    Comparison Rule
                  </span>
                  <p className="text-slate-700 dark:text-slate-300">{field.comparisonRule}</p>
                </div>

                <div>
                  <span className="text-slate-400 font-mono text-[10px] block uppercase">
                    Analytical Finding
                  </span>
                  <p className="text-slate-700 dark:text-slate-300">{field.explanation}</p>
                </div>

                <div>
                  <span className="text-teal-700 dark:text-teal-400 font-mono text-[10px] block uppercase font-bold">
                    Required Regulatory Next Step
                  </span>
                  <p className="text-teal-800 dark:text-teal-300 font-medium">
                    {field.requiredNextStep}
                  </p>
                </div>
              </div>

              {/* Correction History */}
              {field.corrections.length > 0 && (
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1">
                  <span className="font-bold font-mono text-teal-700 dark:text-teal-400 block">
                    Correction Audit History:
                  </span>
                  {field.corrections.map((corr) => (
                    <div key={corr.id} className="text-slate-600 dark:text-slate-400 font-mono">
                      <span>
                        • Changed from <s>&apos;{corr.originalValue || "blank"}&apos;</s> to &apos;{corr.correctedValue}&apos; by {corr.correctedByUserName} ({corr.correctedByUserRole})
                      </span>
                      <p className="italic text-slate-500 text-[10px]">
                        Reason: &quot;{corr.justification}&quot;
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 5. REVIEWER EXTRACTION CORRECTION MODAL */}
      {correctionModal.isOpen && correctionModal.field && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Correct Extraction: {correctionModal.field.fieldLabel}
              </h3>
              <p className="text-xs text-slate-500">
                Authorized scrutiny officer adjustment. Original scanned extraction remains immutable in the audit ledger.
              </p>
            </div>

            <form onSubmit={handleCorrectionSubmit} className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono">
                <span className="text-slate-400 block text-[10px]">ORIGINAL EXTRACTED VALUE:</span>
                <span className="text-slate-900 dark:text-slate-100 font-bold block mt-0.5">
                  {correctionModal.field.extractedValue || "NOT DETECTED / BLANK"}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Corrected Value:
                </label>
                <input
                  type="text"
                  required
                  value={correctionModal.correctedValue}
                  onChange={(e) =>
                    setCorrectionModal((prev) => ({ ...prev, correctedValue: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-600 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mandatory Regulatory Justification (Min 10 characters):
                </label>
                <textarea
                  required
                  rows={3}
                  value={correctionModal.justification}
                  onChange={(e) =>
                    setCorrectionModal((prev) => ({ ...prev, justification: e.target.value }))
                  }
                  placeholder="Explain why the raw OCR reading was adjusted (e.g. 'Verified against issuing branch letterhead seal; OCR misread numeral 8 as 0')."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() =>
                    setCorrectionModal({
                      isOpen: false,
                      field: null,
                      correctedValue: "",
                      justification: "",
                      isSubmitting: false,
                    })
                  }
                  className="px-3.5 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={correctionModal.isSubmitting}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-teal-700 hover:bg-teal-800 text-white cursor-pointer disabled:opacity-50"
                >
                  {correctionModal.isSubmitting ? "Recording Audit..." : "Save Correction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
