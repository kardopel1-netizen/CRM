import { InquiryStatus, TaskStatus } from "@prisma/client";
import { DomainError } from "@/server/errors";
import { prisma } from "@/server/db";

export type ReturnReasonCode =
  | "continue_treatment"
  | "checkup"
  | "hygiene"
  | "deferred_decision"
  | "other";

const REASON_LABEL: Record<ReturnReasonCode, string> = {
  continue_treatment: "Продолжение лечения",
  checkup: "Контрольный осмотр",
  hygiene: "Профилактика / гигиена",
  deferred_decision: "Отложенное решение",
  other: "Другое",
};

export const returnReasonOptions = (
  Object.entries(REASON_LABEL) as [ReturnReasonCode, string][]
).map(([code, name]) => ({ code, name }));

/**
 * Enroll patient into return funnel with a planned contact date.
 * Idempotent if an open return inquiry already exists — updates due date.
 */
export async function schedulePatientReturn(input: {
  patientId: string;
  actorId: string;
  dueAt: Date;
  reasonCode?: ReturnReasonCode;
  comment?: string;
  fromInquiryId?: string;
}) {
  if (Number.isNaN(input.dueAt.getTime())) {
    throw new DomainError("Укажите корректную дату возврата");
  }

  const patient = await prisma.patient.findUnique({ where: { id: input.patientId } });
  if (!patient) throw new DomainError("Пациент не найден");

  const funnel = await prisma.funnel.findFirst({
    where: { code: "return", active: true },
    include: { stages: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!funnel || funnel.stages.length === 0) {
    throw new DomainError("Воронка возврата не настроена");
  }

  const dueStage =
    funnel.stages.find((s) => s.code === "due") ?? funnel.stages[0];
  const reasonCode = input.reasonCode ?? "continue_treatment";
  const reasonLabel = REASON_LABEL[reasonCode];
  const reasonText = [reasonLabel, input.comment].filter(Boolean).join(" · ");

  const existing = await prisma.inquiry.findFirst({
    where: {
      patientId: input.patientId,
      funnelId: funnel.id,
      status: { in: [InquiryStatus.OPEN, InquiryStatus.DEFERRED] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.inquiry.update({
        where: { id: existing.id },
        data: {
          stageId: dueStage.id,
          status: InquiryStatus.OPEN,
          nextActionAt: input.dueAt,
          nextActionText: `Связаться: ${reasonLabel}`,
          reasonText,
          assigneeId: existing.assigneeId ?? input.actorId,
        },
      });

      await tx.task.create({
        data: {
          title: `Возврат пациента: ${reasonLabel}`,
          description: input.comment || undefined,
          dueAt: input.dueAt,
          inquiryId: updated.id,
          assigneeId: updated.assigneeId ?? input.actorId,
          createdById: input.actorId,
          status: TaskStatus.OPEN,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          entityType: "Inquiry",
          entityId: updated.id,
          action: "return_rescheduled",
          payload: JSON.stringify({
            dueAt: input.dueAt.toISOString(),
            reasonCode,
            fromInquiryId: input.fromInquiryId,
          }),
        },
      });

      return { inquiry: updated, created: false as const };
    });
  }

  return prisma.$transaction(async (tx) => {
    const inquiry = await tx.inquiry.create({
      data: {
        patientId: input.patientId,
        funnelId: funnel.id,
        stageId: dueStage.id,
        assigneeId: input.actorId,
        createdById: input.actorId,
        status: InquiryStatus.OPEN,
        reasonText,
        nextActionAt: input.dueAt,
        nextActionText: `Связаться: ${reasonLabel}`,
      },
    });

    await tx.task.create({
      data: {
        title: `Возврат пациента: ${reasonLabel}`,
        description: input.comment || undefined,
        dueAt: input.dueAt,
        inquiryId: inquiry.id,
        assigneeId: input.actorId,
        createdById: input.actorId,
        status: TaskStatus.OPEN,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        entityType: "Inquiry",
        entityId: inquiry.id,
        action: "return_scheduled",
        payload: JSON.stringify({
          dueAt: input.dueAt.toISOString(),
          reasonCode,
          fromInquiryId: input.fromInquiryId,
        }),
      },
    });

    return { inquiry, created: true as const };
  });
}

/** Days until contact when aftercare is deferred. */
export function defaultReturnDelayDays() {
  const raw = Number(process.env.RETURN_DEFAULT_DELAY_DAYS || "14");
  return Number.isFinite(raw) && raw > 0 ? raw : 14;
}

export async function listReturnBoard(opts?: { assigneeId?: string }) {
  const funnel = await prisma.funnel.findFirst({ where: { code: "return" } });
  if (!funnel) return { upcoming: [], overdue: [] };

  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const base = {
    funnelId: funnel.id,
    status: { in: [InquiryStatus.OPEN, InquiryStatus.DEFERRED] as InquiryStatus[] },
    ...(opts?.assigneeId ? { assigneeId: opts.assigneeId } : {}),
  };

  const [overdue, upcoming] = await Promise.all([
    prisma.inquiry.findMany({
      where: { ...base, nextActionAt: { lt: now } },
      include: { patient: true, stage: true, assignee: true },
      orderBy: { nextActionAt: "asc" },
      take: 50,
    }),
    prisma.inquiry.findMany({
      where: { ...base, nextActionAt: { gte: now, lte: in7 } },
      include: { patient: true, stage: true, assignee: true },
      orderBy: { nextActionAt: "asc" },
      take: 50,
    }),
  ]);

  return { overdue, upcoming };
}
