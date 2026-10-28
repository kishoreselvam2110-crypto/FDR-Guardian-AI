"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  CommandCenterMetricsDto,
  AlertDto,
  FdrSyncResponseDto,
  FdrSyncState,
} from "./types.ts";

export interface UseFdrSyncOptions {
  initialData: CommandCenterMetricsDto;
  institutionId?: string;
  pollingIntervalMs?: number; // default: 30000 (30s)
  staleThresholdMs?: number; // default: 45000 (45s)
  enabled?: boolean;
}

export interface UseFdrSyncReturn {
  data: CommandCenterMetricsDto;
  setData: React.Dispatch<React.SetStateAction<CommandCenterMetricsDto>>;
  alerts: AlertDto[];
  syncState: FdrSyncState;
  lastSyncTime: Date | null;
  lastSuccessfulSyncTime: Date | null;
  error: string | null;
  isPaused: boolean;
  changedFields: Set<string>;
  unreadAlertsCount: number;
  intervalSeconds: number;
  refreshNow: () => Promise<void>;
  isSyncing: boolean;
  resolveAlertItem: (alertId: string) => Promise<boolean>;
  resolveAllAlertsList: () => Promise<boolean>;
  liveAnnouncement: string | null;
}

export function useFdrSync({
  initialData,
  institutionId,
  pollingIntervalMs = 30000,
  staleThresholdMs = 45000,
  enabled = true,
}: UseFdrSyncOptions): UseFdrSyncReturn {
  const [data, setData] = useState<CommandCenterMetricsDto>(initialData);
  const [alerts, setAlerts] = useState<AlertDto[]>(initialData.criticalAlerts || []);
  const [syncState, setSyncState] = useState<FdrSyncState>("LIVE");
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(
    initialData.timestamp ? new Date(initialData.timestamp) : new Date()
  );
  const [lastSuccessfulSyncTime, setLastSuccessfulSyncTime] = useState<Date | null>(
    initialData.timestamp ? new Date(initialData.timestamp) : new Date()
  );
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [changedFields, setChangedFields] = useState<Set<string>>(new Set());
  const [liveAnnouncement, setLiveAnnouncement] = useState<string | null>(null);

  // In-flight locking and request sequence refs to prevent race conditions & overlapping calls
  const inFlightRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef<number>(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const staleCheckTimerRef = useRef<NodeJS.Timeout | null>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const announcementTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep latest state in ref to compare changes accurately
  const latestDataRef = useRef<CommandCenterMetricsDto>(data);
  latestDataRef.current = data;
  const lastSuccessfulSyncRef = useRef<Date | null>(lastSuccessfulSyncTime);
  lastSuccessfulSyncRef.current = lastSuccessfulSyncTime;

  /**
   * Executes the fetch to /api/fdr/sync with cancellation of obsolete requests
   */
  const executeSync = useCallback(
    async (isManual = false): Promise<void> => {
      // 1. Prevent overlapping in-flight requests
      if (inFlightRef.current) {
        if (!isManual) {
          // If automatic poll and another request is already in-flight, skip to avoid queue backlog
          return;
        }
        // If manual refresh, abort the previous obsolete request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      }

      inFlightRef.current = true;
      const currentSeq = ++requestSeqRef.current;
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setSyncState("SYNCING");
      setError(null);

      try {
        const queryParams = new URLSearchParams();
        if (institutionId) {
          queryParams.set("institutionId", institutionId);
        }
        queryParams.set("_t", Date.now().toString());

        const res = await fetch(`/api/fdr/sync?${queryParams.toString()}`, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal: abortController.signal,
        });

        // Ignore obsolete responses if another request was triggered subsequently
        if (currentSeq !== requestSeqRef.current) {
          return;
        }

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.message || `Server returned status ${res.status}`);
        }

        const payload: FdrSyncResponseDto = await res.json();

        if (currentSeq !== requestSeqRef.current) {
          return;
        }

        const serverTime = payload.serverTimestamp
          ? new Date(payload.serverTimestamp)
          : new Date();

        // 2. Diff changes between previous and new metrics
        const prev = latestDataRef.current;
        const next = payload.metrics;
        const diffs = new Set<string>();
        const changesText: string[] = [];

        if (prev.overview.totalPledgedCapital !== next.overview.totalPledgedCapital) {
          diffs.add("totalPledgedCapital");
          changesText.push("Pledged Capital");
        }
        if (prev.overview.activeInstrumentCount !== next.overview.activeInstrumentCount) {
          diffs.add("activeInstrumentCount");
          changesText.push("Active Instruments");
        }
        if (prev.overview.upcomingMaturitiesCount30D !== next.overview.upcomingMaturitiesCount30D) {
          diffs.add("upcomingMaturitiesCount30D");
          changesText.push("30-Day Maturities");
        }
        if (prev.overview.lienConfirmationRate !== next.overview.lienConfirmationRate) {
          diffs.add("lienConfirmationRate");
          changesText.push("Lien Rate");
        }
        if (prev.overview.openReleaseRequestsCount !== next.overview.openReleaseRequestsCount) {
          diffs.add("openReleaseRequestsCount");
          changesText.push("Release Petitions");
        }
        if (prev.overview.unresolvedDiscrepanciesCount !== next.overview.unresolvedDiscrepanciesCount) {
          diffs.add("unresolvedDiscrepanciesCount");
          changesText.push("Forensic Discrepancies");
        }

        // Apply changes
        setData(next);
        setAlerts(payload.alerts);
        setLastSyncTime(serverTime);
        setLastSuccessfulSyncTime(serverTime);
        setSyncState("UPDATED");

        if (diffs.size > 0) {
          setChangedFields(diffs);
          const announcement = `Command Center updated: ${changesText.join(", ")} changed.`;
          setLiveAnnouncement(announcement);

          // Clear highlight effect after 3.5 seconds
          if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
          highlightTimeoutRef.current = setTimeout(() => {
            setChangedFields(new Set());
          }, 3500);

          if (announcementTimeoutRef.current) clearTimeout(announcementTimeoutRef.current);
          announcementTimeoutRef.current = setTimeout(() => {
            setLiveAnnouncement(null);
          }, 5000);
        }

        // Return to "LIVE" after showing brief "UPDATED" status
        setTimeout(() => {
          setSyncState((curr) => (curr === "UPDATED" ? "LIVE" : curr));
        }, 2000);
      } catch (err: unknown) {
        if (currentSeq !== requestSeqRef.current) {
          return;
        }

        const errorObj = err as Error;
        // Don't mark offline if user explicitly aborted
        if (errorObj.name === "AbortError") {
          return;
        }

        // Failure behavior: Keep last successful data visible, mark stale & offline
        setSyncState("OFFLINE");
        setError(errorObj.message || "Failed to reach live banking gateway.");
      } finally {
        if (currentSeq === requestSeqRef.current) {
          inFlightRef.current = false;
          abortControllerRef.current = null;
        }
      }
    },
    [institutionId]
  );

  /**
   * Manual refresh handler exposed to the user
   */
  const refreshNow = useCallback(async (): Promise<void> => {
    await executeSync(true);
  }, [executeSync]);

  /**
   * Resolves an alert item via the sync API
   */
  const resolveAlertItem = useCallback(
    async (alertId: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/fdr/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "RESOLVE_ALERT", alertId }),
        });
        if (!res.ok) return false;

        // Optimistically update alerts list
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
        // Trigger background refresh
        executeSync(false);
        return true;
      } catch {
        return false;
      }
    },
    [executeSync]
  );

  /**
   * Resolves all alerts in scope
   */
  const resolveAllAlertsList = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/fdr/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RESOLVE_ALL_ALERTS", institutionId }),
      });
      if (!res.ok) return false;

      setAlerts([]);
      executeSync(false);
      return true;
    } catch {
      return false;
    }
  }, [institutionId, executeSync]);

  /**
   * Polling timer setup and visibility change listener
   */
  useEffect(() => {
    if (!enabled) return;

    // Helper to start recurring polling
    const startPolling = () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(() => {
        // Only trigger poll if document is visible
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          return;
        }
        executeSync(false);
      }, pollingIntervalMs);
    };

    // Helper to check staleness every 5s
    const startStaleChecker = () => {
      if (staleCheckTimerRef.current) clearInterval(staleCheckTimerRef.current);
      staleCheckTimerRef.current = setInterval(() => {
        const lastSuccess = lastSuccessfulSyncRef.current;
        if (!lastSuccess) return;

        const elapsedMs = Date.now() - lastSuccess.getTime();
        if (elapsedMs > staleThresholdMs) {
          setSyncState((curr) => {
            if (curr === "LIVE" || curr === "UPDATED") {
              return "STALE";
            }
            return curr;
          });
        }
      }, 5000);
    };

    // Visibility change handler: pause unnecessary polling when page is hidden
    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;

      if (document.visibilityState === "hidden") {
        setIsPaused(true);
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      } else {
        setIsPaused(false);
        // If tab was hidden for longer than poll interval, sync immediately on resume
        const lastSuccess = lastSuccessfulSyncRef.current;
        if (lastSuccess && Date.now() - lastSuccess.getTime() >= pollingIntervalMs) {
          executeSync(false);
        }
        startPolling();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    startPolling();
    startStaleChecker();

    // Clean up timers and subscriptions on component unmount
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (staleCheckTimerRef.current) clearInterval(staleCheckTimerRef.current);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      if (announcementTimeoutRef.current) clearTimeout(announcementTimeoutRef.current);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, pollingIntervalMs, staleThresholdMs, executeSync]);

  return {
    data,
    setData,
    alerts,
    syncState,
    lastSyncTime,
    lastSuccessfulSyncTime,
    error,
    isPaused,
    changedFields,
    unreadAlertsCount: alerts.length,
    intervalSeconds: Math.round(pollingIntervalMs / 1000),
    refreshNow,
    isSyncing: syncState === "SYNCING",
    resolveAlertItem,
    resolveAllAlertsList,
    liveAnnouncement,
  };
}
