import { z } from "zod";
import { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import { updateAppointmentStatus } from "@/server/appointments";
import { normalizePhone } from "@/lib/phone";

export type MisOutboundEvent =
  | "appointment.created"
  | "appointment.status_changed";

/**
 * Push appointment snapshot to MIS / middleware.
 * No-op when MIS_WEBHOOK_URL is empty. Failures are logged, never throw to callers.
 */
export async function pushAppointmentToMis(
  appointmentId: string,
  event: MisOutboundEvent,
  extra?: { fromStatus?: string; toStatus?: string },
) {
  const url = process.env.MIS_WEBHOOK_URL?.trim();
  if (!url) {
    return { skipped: true as const };
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: true,
      cancelReason: true,
    },
  });
  if (!appointment) {
    return { skipped: true as const, reason: "not_found" as const };
  }

  const token =
    process.env.MIS_WEBHOOK_TOKEN?.trim() || process.env.MIS_API_KEY?.trim() || "";

  const payload = {
    event,
    source: "aurelia-crm",
    at: new Date().toISOString(),
    appointment: {
      id: appointment.id,
      status: appointment.status,
      startsAt: appointment.startsAt?.toISOString() ?? null,
      doctorName: appointment.doctorName,
      serviceName: appointment.serviceName,
      comment: appointment.comment,
      cancelReasonCode: appointment.cancelReason?.code ?? null,
      inquiryId: appointment.inquiryId,
      fromStatus: extra?.fromStatus ?? null,
      toStatus: extra?.toStatus ?? appointment.status,
    },
    patient: {
      id: appointment.patient.id,
      phone: appointment.patient.phone,
      phoneNormalized: appointment.patient.phoneNormalized,
      firstName: appointment.patient.firstName,
      lastName: appointment.patient.lastName,
      middleName: appointment.patient.middleName,
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
              "x-api-key": token,
            }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    const text = await res.text();
    await prisma.auditLog.create({
      data: {
        entityType: "MisSync",
        entityId: appointment.id,
        action: res.ok ? "outbound_ok" : "outbound_failed",
        payload: JSON.stringify({
          event,
          status: res.status,
          body: text.slice(0, 400),
        }),
      },
    });

    return { skipped: false as const, ok: res.ok, status: res.status };
  } catch (e) {
    const message = e instanceof Error ? e.message : "network_error";
    await prisma.auditLog.create({
      data: {
        entityType: "MisSync",
        entityId: appointment.id,
        action: "outbound_failed",
        payload: JSON.stringify({ event, error: message }),
      },
    });
    return { skipped: false as const, ok: false, error: message };
  }
}

export function assertMisApiKey(headerValue: string | null) {
  const expected = process.env.MIS_API_KEY || process.env.LEAD_INGEST_API_KEY;
  if (!expected) {
    throw new DomainError("MIS_API_KEY не настроен");
  }
  if (!headerValue || headerValue !== expected) {
    const err = new DomainError("Неверный API-ключ");
    (err as DomainError & { status: number }).status = 401;
    throw err;
  }
}

const misInboundSchema = z.object({
  /** appointment.arrived | appointment.no_show | appointment.cancelled | appointment.confirmed */
  event: z.enum([
    "appointment.arrived",
    "appointment.no_show",
    "appointment.cancelled",
    "appointment.confirmed",
  ]),
  appointmentId: z.string().min(1).max(64).optional(),
  /** Fallback lookup: phone + optional startsAt ISO */
  phone: z.string().min(5).max(40).optional(),
  startsAt: z.string().datetime().optional(),
  comment: z.string().max(2000).optional(),
  /** External idempotency key from MIS */
  externalEventId: z.string().min(1).max(200).optional(),
});

const EVENT_TO_STATUS: Record<
  z.infer<typeof misInboundSchema>["event"],
  AppointmentStatus
> = {
  "appointment.arrived": AppointmentStatus.ARRIVED,
  "appointment.no_show": AppointmentStatus.NO_SHOW,
  "appointment.cancelled": AppointmentStatus.CANCELLED_BY_PATIENT,
  "appointment.confirmed": AppointmentStatus.CONFIRMED,
};

async function resolveMisActorId() {
  const email = process.env.MIS_DEFAULT_ACTOR_EMAIL || "admin@clinic.local";
  const user =
    (await prisma.user.findFirst({ where: { email, active: true } })) ||
    (await prisma.user.findFirst({ where: { role: "ADMIN", active: true } })) ||
    (await prisma.user.findFirst({ where: { active: true } }));
  if (!user) throw new DomainError("Нет пользователя для событий МИС");
  return user.id;
}

/**
 * Inbound event from MIS / middleware → update CRM appointment status.
 */
export async function ingestMisEvent(raw: unknown) {
  const parsed = misInboundSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainError(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const data = parsed.data;

  if (data.externalEventId) {
    const existing = await prisma.auditLog.findFirst({
      where: {
        entityType: "MisInbound",
        action: "processed",
        payload: { contains: `"externalEventId":"${data.externalEventId}"` },
      },
    });
    if (existing) {
      return {
        duplicated: true as const,
        appointmentId: existing.entityId,
      };
    }
  }

  let appointmentId = data.appointmentId;
  if (!appointmentId && data.phone) {
    const phoneNormalized = normalizePhone(data.phone);
    const patient = await prisma.patient.findFirst({
      where: { phoneNormalized },
    });
    if (!patient) throw new DomainError("Пациент по телефону не найден");

    const startsAt = data.startsAt ? new Date(data.startsAt) : null;
    const appointment = await prisma.appointment.findFirst({
      where: {
        patientId: patient.id,
        ...(startsAt
          ? {
              startsAt: {
                gte: new Date(startsAt.getTime() - 30 * 60 * 1000),
                lte: new Date(startsAt.getTime() + 30 * 60 * 1000),
              },
            }
          : {}),
        status: {
          in: [
            AppointmentStatus.BOOKED,
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.OFFERED,
          ],
        },
      },
      orderBy: { startsAt: "asc" },
    });
    if (!appointment) {
      throw new DomainError("Активная запись для пациента не найдена");
    }
    appointmentId = appointment.id;
  }

  if (!appointmentId) {
    throw new DomainError("Укажите appointmentId или phone");
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });
  if (!appointment) throw new DomainError("Запись не найдена");

  const status = EVENT_TO_STATUS[data.event];
  const actorId = await resolveMisActorId();

  // Cancel/no-show from MIS without classifier: use first active cancel reason if needed
  let cancelReasonId: string | undefined;
  if (
    status === AppointmentStatus.CANCELLED_BY_PATIENT ||
    status === AppointmentStatus.NO_SHOW
  ) {
    const reason = await prisma.cancelReason.findFirst({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
    if (!reason) {
      throw new DomainError("Нет активной причины отмены для события МИС");
    }
    cancelReasonId = reason.id;
  }

  const updated = await updateAppointmentStatus({
    appointmentId,
    status,
    cancelReasonId,
    comment: data.comment ?? `МИС: ${data.event}`,
    actorId,
    skipMisSync: true,
  });

  await prisma.auditLog.create({
    data: {
      actorId,
      entityType: "MisInbound",
      entityId: updated.id,
      action: "processed",
      payload: JSON.stringify({
        event: data.event,
        externalEventId: data.externalEventId ?? null,
        status: updated.status,
      }),
    },
  });

  return {
    duplicated: false as const,
    appointmentId: updated.id,
    status: updated.status,
    patientId: updated.patientId,
  };
}
