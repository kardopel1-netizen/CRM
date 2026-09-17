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

/** Stub provider: marks as SENT. Swap for SMS/WhatsApp gateway later. */
async function deliverStub(notificationId: string, toAddress: string, body: string) {
  const provider = (process.env.NOTIFY_PROVIDER || "stub").toLowerCase();
  if (provider !== "stub") {
    // Placeholder for real providers — fail soft into FAILED with message
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.FAILED,
        error: `Провайдер ${provider} ещё не подключён. Используйте NOTIFY_PROVIDER=stub`,
      },
    });
    return;
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: {
      status: NotificationStatus.SENT,
      sentAt: new Date(),
      providerRef: `stub:${Date.now()}`,
      channel: NotificationChannel.STUB,
    },
  });

  // Mirror into patient timeline
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

  if (!patient.phoneNormalized) {
    return prisma.notification.create({
      data: {
        patientId: patient.id,
        appointmentId: input.appointmentId,
        inquiryId: input.inquiryId ?? appointment?.inquiryId ?? null,
        kind: input.kind,
        channel: NotificationChannel.STUB,
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
      channel: NotificationChannel.STUB,
      status: NotificationStatus.PENDING,
      toAddress: patient.phone,
      body,
    },
  });

  await deliverStub(notification.id, patient.phone, body);
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
