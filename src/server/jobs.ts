import { DomainError } from "@/server/errors";
import { escalateOverdueTasks } from "@/server/escalation";
import { processAppointmentReminders } from "@/server/reminders";

export function assertJobsApiKey(headerValue: string | null) {
  const expected =
    process.env.JOBS_API_KEY ||
    process.env.LEAD_INGEST_API_KEY ||
    process.env.MIS_API_KEY;
  if (!expected) {
    throw new DomainError("JOBS_API_KEY не настроен");
  }
  if (!headerValue || headerValue !== expected) {
    const err = new DomainError("Неверный API-ключ");
    (err as DomainError & { status: number }).status = 401;
    throw err;
  }
}

/**
 * Background tick: reminders + overdue task escalation.
 * Intended for cron / Task Scheduler: POST /api/jobs/tick
 */
export async function runAutomationTick(opts?: { actorId?: string }) {
  const startedAt = new Date();
  const [reminders, escalated] = await Promise.all([
    processAppointmentReminders({ actorId: opts?.actorId }),
    escalateOverdueTasks(),
  ]);

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    reminders,
    escalatedTasks: escalated,
  };
}
