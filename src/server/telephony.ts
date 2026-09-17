import { z } from "zod";
import { InquiryStatus, InteractionType } from "@prisma/client";
import { prisma } from "@/server/db";
import { normalizePhone } from "@/lib/phone";
import { createInquiryWithTask } from "@/server/inquiries";
import { DomainError } from "@/server/errors";
import { logPatientInteraction } from "@/server/interactions";

export const inboundCallSchema = z.object({
  phone: z.string().min(5).max(40),
  /** inbound | outbound | missed */
  direction: z.enum(["inbound", "outbound", "missed"]).default("inbound"),
  /** Unique id from PBX / telephony provider */
  externalCallId: z.string().min(1).max(200).optional(),
  /** Optional recording URL from PBX */
  recordingUrl: z.string().max(2000).optional(),
  callerName: z.string().max(120).optional(),
  note: z.string().max(2000).optional(),
});

async function resolveAssigneeId() {
  const email =
    process.env.TELEPHONY_DEFAULT_ASSIGNEE_EMAIL ||
    process.env.LEAD_DEFAULT_ASSIGNEE_EMAIL ||
    "operator@clinic.local";
  const user =
    (await prisma.user.findFirst({ where: { email, active: true } })) ||
    (await prisma.user.findFirst({ where: { role: "OPERATOR", active: true } }));
  if (!user) throw new DomainError("Нет активного оператора для звонка");
  return user.id;
}

export function assertTelephonyApiKey(headerValue: string | null) {
  const expected =
    process.env.TELEPHONY_API_KEY || process.env.LEAD_INGEST_API_KEY;
  if (!expected) {
    throw new DomainError("TELEPHONY_API_KEY / LEAD_INGEST_API_KEY не настроен");
  }
  if (!headerValue || headerValue !== expected) {
    const err = new DomainError("Неверный API-ключ");
    (err as DomainError & { status: number }).status = 401;
    throw err;
  }
}

/**
 * Inbound/outbound call from PBX / softphone bridge.
 * Finds patient by phone (or creates stub), ensures open inquiry, logs CALL.
 */
export async function ingestCall(raw: unknown) {
  const parsed = inboundCallSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainError(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const data = parsed.data;
  const phoneNormalized = normalizePhone(data.phone);
  if (!phoneNormalized || phoneNormalized.length < 10) {
    throw new DomainError("Некорректный номер телефона");
  }

  if (data.externalCallId) {
    const existing = await prisma.interaction.findFirst({
      where: { recordingUrl: `call:${data.externalCallId}` },
      include: { patient: true },
    });
    if (existing) {
      return {
        duplicated: true as const,
        patientId: existing.patientId,
        inquiryId: existing.inquiryId,
        interactionId: existing.id,
        isNewPatient: false,
        isNewInquiry: false,
        patientUrl: `/patients/${existing.patientId}`,
      };
    }
  }

  const channel = await prisma.channel.findFirst({
    where: { code: "phone", active: true },
  });
  if (!channel) throw new DomainError("Канал phone не настроен");

  const assigneeId = await resolveAssigneeId();

  let patient = await prisma.patient.findFirst({ where: { phoneNormalized } });
  let isNewPatient = false;
  if (!patient) {
    const nameParts = (data.callerName || "").trim().split(/\s+/).filter(Boolean);
    patient = await prisma.patient.create({
      data: {
        lastName: nameParts[0] || "Звонок",
        firstName: nameParts[1] || "входящий",
        middleName: nameParts.slice(2).join(" ") || null,
        phone: data.phone.trim(),
        phoneNormalized,
      },
    });
    isNewPatient = true;
  }

  let inquiry = await prisma.inquiry.findFirst({
    where: {
      patientId: patient.id,
      status: { in: [InquiryStatus.OPEN, InquiryStatus.DEFERRED] },
    },
    orderBy: { createdAt: "desc" },
  });

  let isNewInquiry = false;
  if (!inquiry) {
    const created = await createInquiryWithTask({
      firstName: patient.firstName,
      lastName: patient.lastName,
      middleName: patient.middleName || undefined,
      phone: patient.phone,
      channelId: channel.id,
      reasonText:
        data.note ||
        (data.direction === "missed"
          ? "Пропущенный звонок"
          : data.direction === "outbound"
            ? "Исходящий звонок"
            : "Входящий звонок"),
      assigneeId,
      createdById: null,
      externalId: data.externalCallId ? `call-inq-${data.externalCallId}` : undefined,
      utm: { sourceSystem: "telephony" },
    });
    inquiry = created.inquiry;
    isNewInquiry = !created.duplicated;
  }

  const directionLabel =
    data.direction === "missed"
      ? "Пропущенный"
      : data.direction === "outbound"
        ? "Исходящий"
        : "Входящий";

  const body = [
    `${directionLabel} звонок`,
    data.note ? `· ${data.note}` : null,
    data.externalCallId ? `· id ${data.externalCallId}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  // logPatientInteraction handles first contact / stage move
  const interactionBase = await logPatientInteraction({
    patientId: patient.id,
    inquiryId: inquiry.id,
    authorId: assigneeId,
    type: InteractionType.CALL,
    body,
    countsAsContactAttempt: data.direction !== "missed",
  });

  const recordingRef = data.externalCallId
    ? `call:${data.externalCallId}`
    : data.recordingUrl || null;

  const interaction = await prisma.interaction.update({
    where: { id: interactionBase.id },
    data: {
      recordingUrl: recordingRef || data.recordingUrl || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: assigneeId,
      entityType: "Call",
      entityId: interaction.id,
      action: "telephony_ingest",
      payload: JSON.stringify({
        direction: data.direction,
        externalCallId: data.externalCallId,
        patientId: patient.id,
        inquiryId: inquiry.id,
      }),
    },
  });

  return {
    duplicated: false as const,
    patientId: patient.id,
    inquiryId: inquiry.id,
    interactionId: interaction.id,
    isNewPatient,
    isNewInquiry,
    patientUrl: `/patients/${patient.id}`,
  };
}
