import {
  NotificationChannel,
  NotificationKind,
  NotificationStatus,
  type Appointment,
  type Patient,
} from "@prisma/client";
import { prisma } from "@/server/db";

const CLINIC = () => process.env.CLINIC_NAME || "Aurelia Стоматология";

function formatWhenRu(date: Date | null | undefined) {
  if (!date) return "указанное время";
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildNotificationBody(
  kind: NotificationKind,
  patient: Pick<Patient, "firstName" | "lastName">,
  appointment?: Pick<Appointment, "startsAt" | "doctorName" | "serviceName"> | null,
): string {
  const name = patient.firstName;
  const when = formatWhenRu(appointment?.startsAt ?? null);
  const doctor = appointment?.doctorName ? ` к ${appointment.doctorName}` : "";
  const service = appointment?.serviceName ? ` (${appointment.serviceName})` : "";
  const clinic = CLINIC();

  switch (kind) {
    case NotificationKind.APPOINTMENT_BOOKED:
      return `${name}, вы записаны в ${clinic} на ${when}${doctor}${service}. Если нужно перенести — ответьте на это сообщение или позвоните в клинику.`;
    case NotificationKind.APPOINTMENT_CONFIRM_REQUEST:
      return `${name}, подтвердите, пожалуйста, визит в ${clinic} на ${when}${doctor}. Ответьте «Да» или перезвоните нам.`;
    case NotificationKind.APPOINTMENT_CONFIRMED:
      return `${name}, ваша запись в ${clinic} на ${when} подтверждена. Ждём вас!`;
    case NotificationKind.APPOINTMENT_CANCELLED:
      return `${name}, ваша запись в ${clinic} на ${when} отменена. Если хотите записаться снова — напишите или позвоните.`;
    case NotificationKind.APPOINTMENT_RESCHEDULED:
      return `${name}, клиника перенесла вашу запись. Новое время: ${when}${doctor}. При необходимости свяжитесь с нами.`;
    case NotificationKind.APPOINTMENT_NO_SHOW:
      return `${name}, вы не пришли на приём в ${clinic} (${when}). Давайте подберём удобное время — ответьте на сообщение или позвоните.`;
  }
}

function resolveNotifyChannel(): NotificationChannel {
  const raw = (process.env.NOTIFY_CHANNEL || "SMS").toUpperCase();
  if (raw === "WHATSAPP") return NotificationChannel.WHATSAPP;
  if (raw === "EMAIL") return NotificationChannel.EMAIL;
  return NotificationChannel.SMS;
}

async function mirrorToTimeline(
  notificationId: string,
  toAddress: string,
  body: string,
) {
  const n = await prisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
  await prisma.interaction.create({
    data: {
      patientId: n.patientId,
      inquiryId: n.inquiryId,
      type: "MESSAGE",
      body: `[уведомление → ${toAddress}] ${body}`,
    },
  });
}

async function markSent(
  notificationId: string,
  channel: NotificationChannel,
  providerRef: string,
) {
  await prisma.notification.update({
    where: { id: notificationId },
    data: {
      status: NotificationStatus.SENT,
      sentAt: new Date(),
      providerRef,
      channel,
      error: null,
    },
  });
}

async function markFailed(notificationId: string, error: string, channel?: NotificationChannel) {
  await prisma.notification.update({
    where: { id: notificationId },
    data: {
      status: NotificationStatus.FAILED,
      error: error.slice(0, 500),
      ...(channel ? { channel } : {}),
    },
  });
}

/** Local stub: marks SENT without calling an external gateway. */
async function deliverStub(notificationId: string, toAddress: string, body: string) {
  await markSent(notificationId, NotificationChannel.STUB, `stub:${Date.now()}`);
  await mirrorToTimeline(notificationId, toAddress, body);
}

/**
 * Generic HTTP gateway (SMS/WhatsApp via n8n, Make, SMSC, Twilio bridge, etc.).
 * POST NOTIFY_WEBHOOK_URL with JSON payload; 2xx = success.
 */
async function deliverHttp(
  notificationId: string,
  toAddress: string,
  body: string,
  kind: NotificationKind,
  meta: { patientId: string; appointmentId?: string | null; inquiryId?: string | null },
) {
  const url = process.env.NOTIFY_WEBHOOK_URL?.trim();
  const channel = resolveNotifyChannel();

  if (!url) {
    await markFailed(
      notificationId,
      "NOTIFY_WEBHOOK_URL не задан при NOTIFY_PROVIDER=http",
      channel,
    );
    return;
  }

  const token =
    process.env.NOTIFY_WEBHOOK_TOKEN?.trim() ||
    process.env.NOTIFY_API_KEY?.trim() ||
    "";

  const payload = {
    id: notificationId,
    to: toAddress,
    phone: toAddress,
    body,
    kind,
    channel,
    clinic: CLINIC(),
    patientId: meta.patientId,
    appointmentId: meta.appointmentId ?? null,
    inquiryId: meta.inquiryId ?? null,
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
    let providerRef = `http:${res.status}`;
    try {
      const json = JSON.parse(text) as { id?: string; providerRef?: string; messageId?: string };
      providerRef =
        json.providerRef || json.messageId || json.id || providerRef;
    } catch {
      /* non-JSON body is fine */
    }

    if (!res.ok) {
      await markFailed(
        notificationId,
        `HTTP ${res.status}: ${text.slice(0, 300) || res.statusText}`,
        channel,
      );
      return;
    }

    await markSent(notificationId, channel, String(providerRef).slice(0, 200));
    await mirrorToTimeline(notificationId, toAddress, body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "network_error";
    await markFailed(notificationId, message, channel);
  }
}

async function deliverNotification(input: {
  notificationId: string;
  toAddress: string;
  body: string;
  kind: NotificationKind;
  patientId: string;
  appointmentId?: string | null;
  inquiryId?: string | null;
}) {
  const provider = (process.env.NOTIFY_PROVIDER || "stub").toLowerCase();

  if (provider === "http" || provider === "webhook") {
    await deliverHttp(input.notificationId, input.toAddress, input.body, input.kind, {
      patientId: input.patientId,
      appointmentId: input.appointmentId,
      inquiryId: input.inquiryId,
    });
    return;
  }

  if (provider !== "stub") {
    await markFailed(
      input.notificationId,
      `Провайдер ${provider} не поддерживается. Используйте stub или http.`,
    );
    return;
  }

  await deliverStub(input.notificationId, input.toAddress, input.body);
}

export async function enqueueAndSendPatientNotification(input: {
  patientId: string;
  appointmentId?: string;
  inquiryId?: string | null;
  kind: NotificationKind;
}) {
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: input.patientId } });
  const appointment = input.appointmentId
    ? await prisma.appointment.findUnique({ where: { id: input.appointmentId } })
    : null;

  const provider = (process.env.NOTIFY_PROVIDER || "stub").toLowerCase();
  const initialChannel =
    provider === "http" || provider === "webhook"
      ? resolveNotifyChannel()
      : NotificationChannel.STUB;

  if (!patient.phoneNormalized) {
    return prisma.notification.create({
      data: {
        patientId: patient.id,
        appointmentId: input.appointmentId,
        inquiryId: input.inquiryId ?? appointment?.inquiryId ?? null,
        kind: input.kind,
        channel: initialChannel,
        status: NotificationStatus.SKIPPED,
        toAddress: "",
        body: "Нет телефона пациента",
        error: "phone_missing",
      },
    });
  }

  const body = buildNotificationBody(input.kind, patient, appointment);
  const notification = await prisma.notification.create({
    data: {
      patientId: patient.id,
      appointmentId: input.appointmentId,
      inquiryId: input.inquiryId ?? appointment?.inquiryId ?? null,
      kind: input.kind,
      channel: initialChannel,
      status: NotificationStatus.PENDING,
      toAddress: patient.phone,
      body,
    },
  });

  await deliverNotification({
    notificationId: notification.id,
    toAddress: patient.phone,
    body,
    kind: input.kind,
    patientId: patient.id,
    appointmentId: input.appointmentId ?? appointment?.id,
    inquiryId: input.inquiryId ?? appointment?.inquiryId,
  });

  return prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
}

export const notificationKindLabel: Record<NotificationKind, string> = {
  APPOINTMENT_BOOKED: "Запись создана",
  APPOINTMENT_CONFIRM_REQUEST: "Запрос подтверждения",
  APPOINTMENT_CONFIRMED: "Запись подтверждена",
  APPOINTMENT_CANCELLED: "Отмена записи",
  APPOINTMENT_NO_SHOW: "Неявка",
  APPOINTMENT_RESCHEDULED: "Перенос клиникой",
};

export const notificationStatusLabel: Record<NotificationStatus, string> = {
  PENDING: "В очереди",
  SENT: "Отправлено",
  FAILED: "Ошибка",
  SKIPPED: "Пропущено",
};

export const notificationChannelLabel: Record<NotificationChannel, string> = {
  STUB: "Stub",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
};

/** Re-deliver a FAILED notification through the current provider. */
export async function retryFailedNotification(notificationId: string) {
  const n = await prisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
  if (n.status !== NotificationStatus.FAILED) {
    return n;
  }
  if (!n.toAddress) {
    await markFailed(notificationId, "phone_missing");
    return prisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { status: NotificationStatus.PENDING, error: null },
  });

  await deliverNotification({
    notificationId: n.id,
    toAddress: n.toAddress,
    body: n.body,
    kind: n.kind,
    patientId: n.patientId,
    appointmentId: n.appointmentId,
    inquiryId: n.inquiryId,
  });

  return prisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
}
