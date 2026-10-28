import { NextResponse } from "next/server";
import { resolveAuthContext, verifyFdrAccess } from "@/lib/fdr/auth";
import { getInstrumentLifecycleDetail } from "@/lib/fdr/lifecycleService";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ fdrId: string }> }
) {
  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required to access instrument lifecycle." },
      { status: 401 }
    );
  }

  const { fdrId } = await params;
  if (!fdrId) {
    return NextResponse.json(
      { error: "Bad Request", message: "Missing required route parameter: fdrId" },
      { status: 400 }
    );
  }

  try {
    const detail = await getInstrumentLifecycleDetail(fdrId);

    // Verify institutional access scope
    const access = verifyFdrAccess(auth, detail.instrument.institutionId);
    if (!access.allowed) {
      return NextResponse.json(
        { error: "Forbidden", message: access.reason || "Access denied to this FDR record." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: detail,
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: "Internal Server Error", message: error.message },
      { status: 500 }
    );
  }
}
