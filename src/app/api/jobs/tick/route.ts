import { NextResponse } from "next/server";
import { DomainError } from "@/server/errors";
import { assertJobsApiKey, runAutomationTick } from "@/server/jobs";
import { prisma } from "@/server/db";

export const runtime = "nodejs";

/**
 * POST /api/jobs/tick
 * Header: x-api-key: <JOBS_API_KEY>
 * Cron entry: reminders + SLA escalation.
 */
export async function POST(request: Request) {
  try {
    assertJobsApiKey(request.headers.get("x-api-key"));

    const actorEmail =
      process.env.JOBS_ACTOR_EMAIL ||
      process.env.MIS_DEFAULT_ACTOR_EMAIL ||
      "admin@clinic.local";
    const actor =
      (await prisma.user.findFirst({ where: { email: actorEmail, active: true } })) ||
      (await prisma.user.findFirst({ where: { role: "ADMIN", active: true } }));

    const result = await runAutomationTick({ actorId: actor?.id });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof DomainError) {
      const status = (e as DomainError & { status?: number }).status ?? 400;
      return NextResponse.json({ ok: false, error: e.message }, { status });
    }
    console.error("Jobs tick error", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "jobs-tick",
    usage: "POST /api/jobs/tick with header x-api-key",
  });
}
