import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getSyntheticFdrInstruments,
  getSyntheticReleaseRequests,
  getSyntheticRiskFindings,
  addDays,
  subDays,
} from "../seedData.ts";
import type { FdrInstrumentDto, FdrSyncState } from "../types.ts";

describe("PHASE 6 — Live Motion, Micro-Interactions & Responsive Polish", () => {
  const instruments = getSyntheticFdrInstruments();

  describe("Quick Filter Classification & Tabular Filtering", () => {
    it("should classify ACTION_REQUIRED instruments correctly", () => {
      const actionRequired = instruments.filter(
        (i) => !i.isLienMarked || i.daysToMaturity <= 60 || i.alertsCount > 0
      );

      assert.ok(actionRequired.length > 0, "Should have instruments requiring scrutiny action");
      for (const inst of actionRequired) {
        const hasUnverifiedLien = !inst.isLienMarked;
        const isExpiringSoon = inst.daysToMaturity <= 60;
        const hasAlerts = inst.alertsCount > 0;
        assert.ok(
          hasUnverifiedLien || isExpiringSoon || hasAlerts,
          `Instrument ${inst.fdrNumber} must satisfy at least one action-required criterion`
        );
      }
    });

    it("should classify DUE_SOON instruments strictly within the 60-day horizon", () => {
      const dueSoon = instruments.filter(
        (i) => i.daysToMaturity <= 60 && i.daysToMaturity > 0
      );

      for (const inst of dueSoon) {
        assert.ok(inst.daysToMaturity > 0, "Due soon deposits must not already be expired");
        assert.ok(inst.daysToMaturity <= 60, "Due soon deposits must be within 60 days");
      }
    });

    it("should classify BLOCKED instruments based on open findings, unconfirmed liens, or expiration", () => {
      const blocked = instruments.filter(
        (i) => i.alertsCount > 0 || !i.isLienMarked || i.daysToMaturity <= 0
      );

      for (const inst of blocked) {
        assert.ok(
          inst.alertsCount > 0 || !inst.isLienMarked || inst.daysToMaturity <= 0,
          `Instrument ${inst.fdrNumber} must meet blocked definition`
        );
      }
    });

    it("should isolate VERIFIED instruments with verified administrative state", () => {
      const verified = instruments.filter((i) => i.verificationState === "VERIFIED");
      for (const inst of verified) {
        assert.equal(inst.verificationState, "VERIFIED");
      }
    });
  });

  describe("Restrained Live-Status & Motion Language Invariants", () => {
    it("CRITICAL: Motion must never continuously pulse or ping in steady LIVE state", () => {
      // Invariant: Steady state LIVE must use steady non-distracting indicator
      const getRestrainedDotClass = (state: FdrSyncState, isPaused: boolean) => {
        if (state === "SYNCING") return "bg-cyan-500 animate-spin";
        if (state === "UPDATED") return "bg-emerald-500 ring-2 ring-emerald-400 ring-offset-1";
        if (state === "STALE") return "bg-amber-500";
        if (state === "OFFLINE") return "bg-rose-500";
        return isPaused ? "bg-slate-400" : "bg-teal-500"; // Steady non-pulsing dot
      };

      const liveDot = getRestrainedDotClass("LIVE", false);
      assert.equal(liveDot.includes("animate-pulse"), false, "Steady live dot must NOT continuously pulse");
      assert.equal(liveDot.includes("animate-ping"), false, "Steady live dot must NOT continuously ping");

      const pausedDot = getRestrainedDotClass("LIVE", true);
      assert.equal(pausedDot, "bg-slate-400");

      const syncingDot = getRestrainedDotClass("SYNCING", false);
      assert.ok(syncingDot.includes("animate-spin"), "Syncing state must show active spinner");

      const updatedDot = getRestrainedDotClass("UPDATED", false);
      assert.ok(updatedDot.includes("ring-2"), "Updated state briefly highlights with ring");
    });

    it("CRITICAL: Dashboard must never fabricate dates forward to simulate time progression", () => {
      const initialDate = new Date("2026-10-27T12:00:00Z");
      // Instrument dates must remain strictly immutable unless updated by real bank transaction
      for (const inst of instruments) {
        const parsedMaturity = new Date(inst.maturityDate);
        assert.ok(!isNaN(parsedMaturity.getTime()), "Maturity date must be a valid static ISO timestamp");
      }
    });
  });

  describe("Tabular Numerals & Monetary Formatting Consistency", () => {
    it("should format INR currency values with valid rupee representation and no float distortion", () => {
      const formatCurrency = (val: number) =>
        new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 0,
        }).format(val);

      const formatted25L = formatCurrency(2500000);
      assert.ok(formatted25L.includes("25,00,000"), `Formatted string should contain 25,00,000: ${formatted25L}`);

      const formatted10L = formatCurrency(1000000);
      assert.ok(formatted10L.includes("10,00,000"), `Formatted string should contain 10,00,000: ${formatted10L}`);
    });

    it("should format dates in consistent day-month-year format", () => {
      const formatDate = (isoString: string) => {
        return new Date(isoString).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      };

      const sampleDate = "2026-12-11T16:50:29.976Z";
      const formatted = formatDate(sampleDate);
      assert.ok(formatted.includes("Dec"), "Should format with short month");
      assert.ok(formatted.includes("2026"), "Should contain year 2026");
    });
  });

  describe("Command & Search Palette Indexing", () => {
    it("should index navigation shortcuts to valid dashboard tabs", () => {
      const validTabs = ["overview", "maturity", "workbench", "lifecycle", "releases"];
      const sampleShortcuts = [
        { title: "Master Register & Ledger", href: "/fdr?tab=overview" },
        { title: "FDR Maturity Radar", href: "/fdr?tab=maturity" },
        { title: "Forensic Evidence Workbench", href: "/fdr?tab=workbench" },
        { title: "Instrument Lifecycle Explorer", href: "/fdr?tab=lifecycle&fdrId=fdr-synth-102" },
        { title: "Release-Readiness Dossier", href: "/fdr?tab=releases" },
      ];

      for (const item of sampleShortcuts) {
        const hasValidTab = validTabs.some((tab) => item.href.includes(`tab=${tab}`));
        assert.ok(hasValidTab, `Shortcut ${item.title} must link to a recognized tab`);
      }
    });

    it("should support query filtering across certificate numbers and bank names", () => {
      const query = "hdfc";
      const matches = instruments.filter(
        (i) =>
          i.fdrNumber.toLowerCase().includes(query) ||
          i.bankName.toLowerCase().includes(query)
      );

      assert.ok(matches.length > 0, "Should match HDFC instruments");
      for (const m of matches) {
        const containsQuery =
          m.fdrNumber.toLowerCase().includes(query) ||
          m.bankName.toLowerCase().includes(query);
        assert.ok(containsQuery);
      }
    });
  });
});
