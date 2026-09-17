import { AppointmentStatus, NotificationKind, TaskStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { enqueueAndSendPatientNotification } from "@/server/notifications";

export function reminderWindowHours() {
  const raw = Number(process.env.APPOINTMENT_REMINDER_HOURS || "48");
  return Number.isFinite(raw) && raw > 0 ? raw : 48;
}

/**
 * For BOOKED appointments within the reminder window:
 * - send confirm-request notification (stub SMS)
 * - ensure open task for assignee
 * Idempotent per appointment (skips if confirm notification already exists).
 */
export async function processAppointmentReminders(opts?: { actorId?: string }) {
  const now = new Date();
  const hours = reminderWindowHours();
  const until = new Date(now.getTime() + hours * 60 * 60 * 1000);

  const candidates = await prisma.appointment.findMany({
    where: {
      status: AppointmentStatus.BOOKED,
      startsAt: { gt: now, lte: until },
    },
    include: {
      inquiry: { select: { id: true, assigneeId: true } },
      patient: { select: { id: true, firstName: true } },
    },
    take: 100,
  });

  let notified = 0;
  let tasksCreated = 0;
  let skipped = 0;

  for (const appt of candidates) {
    const already = await prisma.notification.findFirst({
      where: {
        appointmentId: appt.id,
        kind: NotificationKind.APPOINTMENT_CONFIRM_REQUEST,
      },
    });
    if (already) {
      skipped += 1;
      continue;
    }

    await enqueueAndSendPatientNotification({
      patientId: appt.patientId,
      appointmentId: appt.id,
      inquiryId: appt.inquiryId,
      kind: NotificationKind.APPOINTMENT_CONFIRM_REQUEST,
    });
    notified += 1;

    const assigneeId = appt.inquiry?.assigneeId || opts?.actorId;
    if (assigneeId) {
      const openTask = await prisma.task.findFirst({
        where: {
          appointmentId: appt.id,
          status: TaskStatus.OPEN,
          title: { contains: "Подтвердить" },
        },
      });
      if (!openTask) {
        const dueAt = new Date(
          Math.min(appt.startsAt!.getTime() - 2 * 60 * 60 * 1000, now.getTime() + 4 * 60 * 60 * 1000),
        );
        await prisma.task.create({
          data: {
            title: "Подтвердить запись (напоминание)",
            description: `Визит ${appt.startsAt?.toLocaleString("ru-RU")}`,
            dueAt: dueAt > now ? dueAt : new Date(now.getTime() + 60 * 60 * 1000),
            inquiryId: appt.inquiryId,
            appointmentId: appt.id,
            assigneeId,
            createdById: opts?.actorId ?? null,
            status: TaskStatus.OPEN,
          },
        });
        tasksCreated += 1;
      }

      if (appt.inquiryId) {
        await prisma.inquiry.update({
          where: { id: appt.inquiryId },
          data: {
            nextActionText: "Подтвердить запись пациента (напоминание)",
            nextActionAt: appt.startsAt,
          },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        actorId: opts?.actorId ?? null,
        entityType: "Appointment",
        entityId: appt.id,
        action: "reminder_sent",
        payload: JSON.stringify({ kind: "APPOINTMENT_CONFIRM_REQUEST", hours }),
      },
    });
  }

  return {
    windowHours: hours,
    candidates: candidates.length,
    notified,
    tasksCreated,
    skipped,
  };
}

export async function listUpcomingUnconfirmed(limit = 30) {
  const now = new Date();
  const until = new Date(now.getTime() + reminderWindowHours() * 60 * 60 * 1000);
  return prisma.appointment.findMany({
    where: {
      status: AppointmentStatus.BOOKED,
      startsAt: { gt: now, lte: until },
    },
    include: { patient: true },
    orderBy: { startsAt: "asc" },
    take: limit,
  });
}
