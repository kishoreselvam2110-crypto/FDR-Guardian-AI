import { NextResponse } from "next/server";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import { getCommandCenterData } from "@/lib/fdr/service";
import { syncPersistentAlerts, resolveAlert, resolveAllAlerts } from "@/lib/fdr/alertEngine";
import type { FdrSyncResponseDto } from "@/lib/fdr/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/fdr/sync
 * Protected Next.js Route Handler for live controlled polling (default 30s interval).
 * Reuses server-side authentication and institutional authorization scoping.
 */
export async function GET(req: Request) {
  // 1. Authenticate actor
  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required to query live FDR operations." },
      { status: 401 }
    );
  }

  // 2. Extract and authorize query scope
  const { searchParams } = new URL(req.url);
  let requestedInstitutionId = searchParams.get("institutionId") || undefined;

  // Institutional users are strictly scoped to their own institution
  if (!auth.isRegulatoryOfficer) {
    if (!auth.institutionId) {
      return NextResponse.json(
        { error: "Forbidden", message: "User account lacks institutional affiliation." },
        { status: 403 }
      );
    }
    if (requestedInstitutionId && requestedInstitutionId !== auth.institutionId) {
      return NextResponse.json(
        { error: "Forbidden", message: "Cross-institution access denied." },
        { status: 403 }
      );
    }
    requestedInstitutionId = auth.institutionId;
  } else if (requestedInstitutionId) {
    const access = verifyFdrAccess(auth, requestedInstitutionId);
    if (!access.allowed) {
      return NextResponse.json(
        { error: "Forbidden", message: access.reason || "Access denied." },
        { status: 403 }
      );
    }
  }

  try {
    // 3. Fetch latest metrics snapshot
    const metrics = await getCommandCenterData(requestedInstitutionId);

    // 4. Synchronize persistent database-backed alerts with idempotent deduplication
    const alertSync = await syncPersistentAlerts(
      metrics.instruments,
      metrics.unresolvedDiscrepancies,
      requestedInstitutionId
    );

    const activeAlerts = alertSync.activeAlerts;
    const criticalAlertsCount = activeAlerts.filter((a) => a.severity === "CRITICAL").length;

    // Use server's exact timestamp, not client animation timing
    const serverTimestamp = new Date().toISOString();

    const responsePayload: FdrSyncResponseDto = {
      success: true,
      serverTimestamp,
      intervalSeconds: 30,
      syncMode: "CONTROLLED_POLLING",
      metrics: {
        ...metrics,
        timestamp: serverTimestamp,
        criticalAlerts: activeAlerts.filter((a) => a.severity === "CRITICAL"),
      },
      alerts: activeAlerts,
      activeAlertsCount: activeAlerts.length,
      criticalAlertsCount,
      recentAuditEvents: metrics.recentAuditEvents,
    };

    return NextResponse.json(responsePayload, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "X-Sync-Interval": "30",
        "X-Server-Time": serverTimestamp,
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      {
        success: false,
        error: "Internal Server Error",
        message: `Failed to synchronize FDR Command Center: ${error.message}`,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/fdr/sync
 * Performs live state actions (e.g. resolve alert, dismiss notice).
 */
export async function POST(req: Request) {
  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required." },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { action, alertId, institutionId } = body;

    if (action === "RESOLVE_ALERT") {
      if (!alertId) {
        return NextResponse.json(
          { error: "Bad Request", message: "Missing required parameter: alertId" },
          { status: 400 }
        );
      }

      const res = await resolveAlert(alertId, auth.userId, auth.userName, auth.userRole);
      if (!res.success) {
        return NextResponse.json(
          { error: "Not Found", message: res.error || "Alert not found." },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Alert marked as resolved.",
        alert: res.alert,
      });
    }

    if (action === "RESOLVE_ALL_ALERTS") {
      const targetInstitution = auth.isRegulatoryOfficer ? institutionId : auth.institutionId;
      const res = await resolveAllAlerts(targetInstitution);
      return NextResponse.json({
        success: true,
        message: `Resolved ${res.resolvedCount} alerts in scope.`,
        resolvedCount: res.resolvedCount,
      });
    }

    return NextResponse.json(
      { error: "Bad Request", message: `Unsupported action: ${action}` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: "Internal Server Error", message: error.message },
      { status: 500 }
    );
  }
}
