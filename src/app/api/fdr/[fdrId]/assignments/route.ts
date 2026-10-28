import { NextResponse } from "next/server";
import { resolveAuthContext } from "@/lib/fdr/auth";
import { assignReviewerToInstrument } from "@/lib/fdr/lifecycleService";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ fdrId: string }> }
) {
  const auth = resolveAuthContext(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required." },
      { status: 401 }
    );
  }

  const { fdrId } = await params;

  try {
    const body = await req.json();
    const { officerId, officerName, officerRole } = body;

    if (!officerId || !officerName || !officerRole) {
      return NextResponse.json(
        { error: "Bad Request", message: "Missing required officer identification fields." },
        { status: 400 }
      );
    }

    const res = await assignReviewerToInstrument({
      fdrId,
      officerId,
      officerName,
      officerRole,
      actor: auth,
    });

    return NextResponse.json(res);
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: "Forbidden", message: error.message },
      { status: 403 }
    );
  }
}
