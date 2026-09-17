import { NextResponse } from "next/server";
import { DomainError } from "@/server/errors";
import { assertMisApiKey, ingestMisEvent } from "@/server/mis";

export const runtime = "nodejs";

/**
 * POST /api/mis/events
 * Header: x-api-key: <MIS_API_KEY>
 * Body: inbound MIS event (see docs/mis.md)
 */
export async function POST(request: Request) {
  try {
    assertMisApiKey(request.headers.get("x-api-key"));
    const body = await request.json();
    const result = await ingestMisEvent(body);
    return NextResponse.json(
      { ok: true, ...result },
      { status: result.duplicated ? 200 : 201 },
    );
  } catch (e) {
    if (e instanceof DomainError) {
      const status = (e as DomainError & { status?: number }).status ?? 400;
      return NextResponse.json({ ok: false, error: e.message }, { status });
    }
    console.error("MIS ingest error", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "mis-events",
    usage: "POST /api/mis/events with header x-api-key",
  });
}
