import { InquiryStatus, Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { normalizePhone } from "@/lib/phone";

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

type CreateInquiryInput = {
  firstName: string;
  lastName: string;
  middleName?: string;
  phone: string;
  email?: string;
  channelId?: string;
  serviceDirectionId?: string;
  reasonText?: string;
  funnelCode?: string;
  assigneeId: string;
  createdById: string;
  utm?: {
    sourceSystem?: string;
    sourceCampaign?: string;
    sourceAd?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
  };
};

export async function findOrCreatePatient(input: {
  firstName: string;
  lastName: string;
  middleName?: string;
  phone: string;
  email?: string;
}) {
  const phoneNormalized = normalizePhone(input.phone);
  if (!phoneNormalized || phoneNormalized.length < 10) {
    throw new DomainError("Укажите корректный телефон пациента");
  }

  const existing = await prisma.patient.findFirst({
    where: { phoneNormalized },
  });
  if (existing) return { patient: existing, created: false };

  const patient = await prisma.patient.create({
    data: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      middleName: input.middleName?.trim() || null,
      phone: input.phone.trim(),
      phoneNormalized,
      email: input.email?.trim() || null,
    },
  });
  return { patient, created: true };
}

export async function createInquiryWithTask(input: CreateInquiryInput) {
  const funnelCode = input.funnelCode ?? "primary";
  const funnel = await prisma.funnel.findFirst({
    where: { code: funnelCode, active: true },
    include: { stages: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!funnel || funnel.stages.length === 0) {
    throw new DomainError("Воронка не настроена");
  }
  const firstStage = funnel.stages[0];
  const slaMinutes = firstStage.slaMinutes ?? 15;
  const firstContactDueAt = new Date(Date.now() + slaMinutes * 60 * 1000);

  const { patient } = await findOrCreatePatient(input);

  return prisma.$transaction(async (tx) => {
    const inquiry = await tx.inquiry.create({
      data: {
        patientId: patient.id,
        funnelId: funnel.id,
        stageId: firstStage.id,
        channelId: input.channelId || null,
        serviceDirectionId: input.serviceDirectionId || null,
        assigneeId: input.assigneeId,
        createdById: input.createdById,
        reasonText: input.reasonText || null,
        status: InquiryStatus.OPEN,
        firstContactDueAt,
        nextActionAt: firstContactDueAt,
        nextActionText: "Установить первый контакт",
        sourceSystem: input.utm?.sourceSystem,
        sourceCampaign: input.utm?.sourceCampaign,
        sourceAd: input.utm?.sourceAd,
        utmSource: input.utm?.utmSource,
        utmMedium: input.utm?.utmMedium,
        utmCampaign: input.utm?.utmCampaign,
        utmContent: input.utm?.utmContent,
        utmTerm: input.utm?.utmTerm,
      },
    });

    await tx.task.create({
      data: {
        title: "Обработать новое обращение",
        description: input.reasonText || undefined,
        dueAt: firstContactDueAt,
        inquiryId: inquiry.id,
        assigneeId: input.assigneeId,
        createdById: input.createdById,
        status: TaskStatus.OPEN,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.createdById,
        entityType: "Inquiry",
        entityId: inquiry.id,
        action: "created",
        payload: JSON.stringify({ patientId: patient.id, stage: firstStage.code }),
      },
    });

    return inquiry;
  });
}

export async function moveInquiryStage(opts: {
  inquiryId: string;
  toStageId: string;
  actorId: string;
  lossReasonId?: string;
  comment?: string;
  nextActionAt?: Date;
  nextActionText?: string;
}) {
  const inquiry = await prisma.inquiry.findUniqueOrThrow({
    where: { id: opts.inquiryId },
    include: { stage: true },
  });

  const toStage = await prisma.funnelStage.findUniqueOrThrow({
    where: { id: opts.toStageId },
  });
  if (toStage.funnelId !== inquiry.funnelId) {
    throw new DomainError("Этап принадлежит другой воронке");
  }

  const allowed = await prisma.stageTransition.findUnique({
    where: {
      fromStageId_toStageId: {
        fromStageId: inquiry.stageId,
        toStageId: opts.toStageId,
      },
    },
  });
  if (!allowed && inquiry.stageId !== opts.toStageId) {
    throw new DomainError("Переход на этот этап не разрешён");
  }

  if (toStage.requiresReason && !opts.lossReasonId) {
    throw new DomainError("Укажите причину потери / отказа");
  }

  const isLost = toStage.requiresReason || toStage.code === "lost" || toStage.code === "refused";
  const data: Prisma.InquiryUpdateInput = {
    stage: { connect: { id: toStage.id } },
    nextActionAt: toStage.isTerminal && !isLost ? null : opts.nextActionAt ?? inquiry.nextActionAt,
    nextActionText:
      toStage.isTerminal && !isLost ? null : opts.nextActionText ?? inquiry.nextActionText,
  };

  if (isLost) {
    data.status = InquiryStatus.LOST;
    data.closedAt = new Date();
    data.nextActionAt = null;
    data.nextActionText = null;
    if (opts.lossReasonId) {
      data.lossReason = { connect: { id: opts.lossReasonId } };
    }
  } else if (toStage.code === "arrived" || toStage.code === "treatment_started") {
    data.status = InquiryStatus.WON;
    data.closedAt = new Date();
  } else if (toStage.code === "deferred") {
    data.status = InquiryStatus.DEFERRED;
  }

  if (opts.comment) {
    data.reasonText = opts.comment;
  }

  if (!inquiry.firstContactAt && toStage.code !== "new") {
    data.firstContactAt = new Date();
  }

  if (!toStage.isTerminal && !opts.nextActionAt && !inquiry.nextActionAt) {
    throw new DomainError("У открытого обращения должно быть следующее действие");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.inquiry.update({
      where: { id: inquiry.id },
      data,
    });
    await tx.auditLog.create({
      data: {
        actorId: opts.actorId,
        entityType: "Inquiry",
        entityId: inquiry.id,
        action: "stage_changed",
        payload: JSON.stringify({
          from: inquiry.stageId,
          to: opts.toStageId,
          lossReasonId: opts.lossReasonId,
        }),
      },
    });
    return updated;
  });
}
