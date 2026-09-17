import { AppointmentStatus, Prisma, TaskStatus, NotificationKind } from "@prisma/client";
import { DomainError } from "@/server/inquiries";
import { prisma } from "@/server/db";
import { enqueueAndSendPatientNotification } from "@/server/notifications";

const STATUSES_NEEDING_REASON: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED_BY_PATIENT,
  AppointmentStatus.RESCHEDULED_BY_CLINIC,
  AppointmentStatus.NO_SHOW,
];

export const appointmentStatusLabel: Record<AppointmentStatus, string> = {
  OFFERED: "Предложена запись",
  BOOKED: "Записан",
  CONFIRMED: "Подтверждён",
  ARRIVED: "Пришёл",
  CANCELLED_BY_PATIENT: "Отменил пациент",
  RESCHEDULED_BY_CLINIC: "Перенос клиникой",
  NO_SHOW: "Не пришёл",
  NEEDS_REBOOK: "Требуется повторная запись",
};

export async function createAppointment(input: {
  patientId: string;
  inquiryId?: string;
  startsAt?: Date;
  doctorName?: string;
  serviceName?: string;
  status?: AppointmentStatus;
  actorId: string;
}) {
  const patient = await prisma.patient.findUnique({ where: { id: input.patientId } });
  if (!patient) throw new DomainError("Пациент не найден");

  if (input.inquiryId) {
    const inquiry = await prisma.inquiry.findFirst({
      where: { id: input.inquiryId, patientId: input.patientId },
    });
    if (!inquiry) throw new DomainError("Обращение не принадлежит этому пациенту");
  }

  const status = input.status ?? AppointmentStatus.BOOKED;

  const appointment = await prisma.$transaction(async (tx) => {
    const created = await tx.appointment.create({
      data: {
        patientId: input.patientId,
        inquiryId: input.inquiryId || null,
        startsAt: input.startsAt || null,
        doctorName: input.doctorName || null,
        serviceName: input.serviceName || null,
        status,
      },
    });

    if (input.inquiryId && status === AppointmentStatus.BOOKED) {
      const confirmDue = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await tx.task.create({
        data: {
          title: "Подтвердить запись",
          description: input.startsAt
            ? `Запись на ${input.startsAt.toLocaleString("ru-RU")}`
            : undefined,
          dueAt: input.startsAt
            ? new Date(Math.min(input.startsAt.getTime() - 2 * 60 * 60 * 1000, confirmDue.getTime()))
            : confirmDue,
          inquiryId: input.inquiryId,
          appointmentId: created.id,
          assigneeId: input.actorId,
          createdById: input.actorId,
          status: TaskStatus.OPEN,
        },
      });

      await tx.inquiry.update({
        where: { id: input.inquiryId },
        data: {
          nextActionAt: input.startsAt ?? confirmDue,
          nextActionText: "Подтвердить запись пациента",
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        entityType: "Appointment",
        entityId: created.id,
        action: "created",
        payload: JSON.stringify({ status, inquiryId: input.inquiryId }),
      },
    });

    return created;
  });

  if (status === AppointmentStatus.BOOKED || status === AppointmentStatus.OFFERED) {
    await enqueueAndSendPatientNotification({
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      inquiryId: appointment.inquiryId,
      kind: NotificationKind.APPOINTMENT_BOOKED,
    });
  }

  return appointment;
}

export async function updateAppointmentStatus(input: {
  appointmentId: string;
  status: AppointmentStatus;
  cancelReasonId?: string;
  comment?: string;
  actorId: string;
}) {
  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: input.appointmentId },
  });

  if (STATUSES_NEEDING_REASON.includes(input.status) && !input.cancelReasonId) {
    throw new DomainError("Укажите причину из классификатора");
  }

  const data: Prisma.AppointmentUpdateInput = {
    status: input.status,
    comment: input.comment ?? appointment.comment,
  };

  if (input.cancelReasonId) {
    data.cancelReason = { connect: { id: input.cancelReasonId } };
  } else if (!STATUSES_NEEDING_REASON.includes(input.status)) {
    data.cancelReason = { disconnect: true };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.appointment.update({
      where: { id: appointment.id },
      data,
    });

    // After cancel / no-show — follow-up task
    if (
      input.status === AppointmentStatus.CANCELLED_BY_PATIENT ||
      input.status === AppointmentStatus.NO_SHOW ||
      input.status === AppointmentStatus.NEEDS_REBOOK
    ) {
      const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const title =
        input.status === AppointmentStatus.NO_SHOW
          ? "Связаться после неявки"
          : "Связаться после отмены / перезаписать";

      await tx.task.create({
        data: {
          title,
          dueAt,
          inquiryId: appointment.inquiryId,
          appointmentId: appointment.id,
          assigneeId: input.actorId,
          createdById: input.actorId,
          status: TaskStatus.OPEN,
        },
      });

      if (appointment.inquiryId) {
        await tx.inquiry.update({
          where: { id: appointment.inquiryId },
          data: {
            nextActionAt: dueAt,
            nextActionText: title,
          },
        });
      }
    }

    if (input.status === AppointmentStatus.CONFIRMED && appointment.inquiryId) {
      await tx.inquiry.update({
        where: { id: appointment.inquiryId },
        data: {
          nextActionText: "Дождаться визита / отметить факт прихода",
        },
      });
    }

    if (input.status === AppointmentStatus.ARRIVED && appointment.inquiryId) {
      await tx.inquiry.update({
        where: { id: appointment.inquiryId },
        data: {
          nextActionText: "Перевести в воронку после первичного приёма",
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        entityType: "Appointment",
        entityId: appointment.id,
        action: "status_changed",
        payload: JSON.stringify({
          from: appointment.status,
          to: input.status,
          cancelReasonId: input.cancelReasonId,
        }),
      },
    });

    return next;
  });

  const kindByStatus: Partial<Record<AppointmentStatus, NotificationKind>> = {
    CONFIRMED: NotificationKind.APPOINTMENT_CONFIRMED,
    CANCELLED_BY_PATIENT: NotificationKind.APPOINTMENT_CANCELLED,
    RESCHEDULED_BY_CLINIC: NotificationKind.APPOINTMENT_RESCHEDULED,
    NO_SHOW: NotificationKind.APPOINTMENT_NO_SHOW,
    BOOKED: NotificationKind.APPOINTMENT_CONFIRM_REQUEST,
  };

  const kind = kindByStatus[input.status];
  if (kind) {
    await enqueueAndSendPatientNotification({
      patientId: updated.patientId,
      appointmentId: updated.id,
      inquiryId: updated.inquiryId,
      kind,
    });
  }

  return updated;
}
