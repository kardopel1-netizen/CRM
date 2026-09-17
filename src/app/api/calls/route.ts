import { NextResponse } from "next/server";
import { DomainError } from "@/server/inquiries";
import { assertTelephonyApiKey, ingestCall } from "@/server/telephony";

export const runtime = "nodejs";

/**
 * POST /api/calls
 * Header: x-api-key: <TELEPHONY_API_KEY or LEAD_INGEST_API_KEY>
 * Softphone / PBX bridge — open patient card on ringing.
 */
export async function POST(request: Request) {
  try {
    assertTelephonyApiKey(request.headers.get("x-api-key"));
    const body = await request.json();
    const result = await ingestCall(body);
    return NextResponse.json(
      { ok: true, ...result },
      { status: result.duplicated ? 200 : 201 },
    );
  } catch (e) {
    if (e instanceof DomainError) {
      const status = (e as DomainError & { status?: number }).status ?? 400;
      return NextResponse.json({ ok: false, error: e.message }, { status });
    }
    console.error("Call ingest error", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "telephony-ingest",
    usage: "POST /api/calls with header x-api-key",
  });
}
