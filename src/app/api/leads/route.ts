import { NextResponse } from "next/server";
import { DomainError } from "@/server/inquiries";
import { assertLeadApiKey, ingestLead } from "@/server/leads";

export const runtime = "nodejs";

/**
 * POST /api/leads
 * Header: x-api-key: <LEAD_INGEST_API_KEY>
 * Body: JSON lead payload (see docs/webhook.md)
 */
export async function POST(request: Request) {
  try {
    assertLeadApiKey(request.headers.get("x-api-key"));
    const body = await request.json();
    const result = await ingestLead(body);
    return NextResponse.json(
      {
        ok: true,
        ...result,
      },
      { status: result.duplicated ? 200 : 201 },
    );
  } catch (e) {
    if (e instanceof DomainError) {
      const status = (e as DomainError & { status?: number }).status ?? 400;
      return NextResponse.json({ ok: false, error: e.message }, { status });
    }
    console.error("Lead ingest error", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "lead-ingest",
    usage: "POST /api/leads with header x-api-key",
  });
}
