import { InteractionType, InquiryStatus, TaskStatus } from "@prisma/client";
import { DomainError } from "@/server/errors";
import { prisma } from "@/server/db";

export async function logPatientInteraction(input: {
  patientId: string;
  inquiryId?: string;
  authorId: string;
  type: InteractionType;
  body: string;
  /** Count as contact attempt and set firstContactAt if empty */
  countsAsContactAttempt?: boolean;
}) {
  const body = input.body.trim();
  if (!body) throw new DomainError("Введите текст контакта");

  const patient = await prisma.patient.findUnique({ where: { id: input.patientId } });
  if (!patient) throw new DomainError("Пациент не найден");

  let inquiryId = input.inquiryId;
  if (inquiryId) {
    const inquiry = await prisma.inquiry.findFirst({
      where: { id: inquiryId, patientId: input.patientId },
    });
    if (!inquiry) throw new DomainError("Обращение не принадлежит пациенту");
  } else {
    const open = await prisma.inquiry.findFirst({
      where: {
        patientId: input.patientId,
        status: { in: [InquiryStatus.OPEN, InquiryStatus.DEFERRED] },
      },
      orderBy: { createdAt: "desc" },
    });
    inquiryId = open?.id;
  }

  const counts =
    input.countsAsContactAttempt ??
    (input.type === InteractionType.CALL || input.type === InteractionType.MESSAGE);

  return prisma.$transaction(async (tx) => {
    const interaction = await tx.interaction.create({
      data: {
        patientId: input.patientId,
        inquiryId: inquiryId || null,
        authorId: input.authorId,
        type: input.type,
        body,
      },
    });

    if (inquiryId && counts) {
      const inquiry = await tx.inquiry.findUniqueOrThrow({ where: { id: inquiryId } });
      await tx.inquiry.update({
        where: { id: inquiryId },
        data: {
          contactAttempts: { increment: 1 },
          firstContactAt: inquiry.firstContactAt ?? new Date(),
        },
      });

      // Auto-move from "new" to "contacted" if transition exists
      if (!inquiry.firstContactAt) {
        const stage = await tx.funnelStage.findUnique({ where: { id: inquiry.stageId } });
        if (stage?.code === "new") {
          const contacted = await tx.funnelStage.findFirst({
            where: { funnelId: inquiry.funnelId, code: "contacted", active: true },
          });
          if (contacted) {
            const edge = await tx.stageTransition.findUnique({
              where: {
                fromStageId_toStageId: {
                  fromStageId: inquiry.stageId,
                  toStageId: contacted.id,
                },
              },
            });
            if (edge) {
              const nextDue = new Date(Date.now() + 60 * 60 * 1000);
              await tx.inquiry.update({
                where: { id: inquiryId },
                data: {
                  stageId: contacted.id,
                  nextActionAt: inquiry.nextActionAt && inquiry.nextActionAt > new Date()
                    ? inquiry.nextActionAt
                    : nextDue,
                  nextActionText: inquiry.nextActionText || "Уточнить потребность и предложить запись",
                },
              });
            }
          }
        }
      }
    }

    await tx.auditLog.create({
      data: {
        actorId: input.authorId,
        entityType: "Interaction",
        entityId: interaction.id,
        action: "created",
        payload: JSON.stringify({ type: input.type, inquiryId }),
      },
    });

    return interaction;
  });
}

/** After patient arrived — close primary path and open aftercare inquiry. */
export async function startAftercareAfterVisit(input: {
  patientId: string;
  fromInquiryId?: string | null;
  actorId: string;
}) {
  const aftercare = await prisma.funnel.findFirst({
    where: { code: "aftercare", active: true },
    include: { stages: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!aftercare || aftercare.stages.length === 0) {
    throw new DomainError("Воронка aftercare не настроена");
  }

  const firstStage = aftercare.stages[0];
  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Avoid duplicate open aftercare for same patient
  const existing = await prisma.inquiry.findFirst({
    where: {
      patientId: input.patientId,
      funnelId: aftercare.id,
      status: { in: [InquiryStatus.OPEN, InquiryStatus.DEFERRED] },
    },
  });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    if (input.fromInquiryId) {
      const from = await tx.inquiry.findUnique({ where: { id: input.fromInquiryId } });
      if (from && from.status === InquiryStatus.OPEN) {
        const arrivedStage = await tx.funnelStage.findFirst({
          where: { funnelId: from.funnelId, code: "arrived", active: true },
        });
        await tx.inquiry.update({
          where: { id: from.id },
          data: {
            status: InquiryStatus.WON,
            closedAt: new Date(),
            stageId: arrivedStage?.id ?? from.stageId,
            nextActionAt: null,
            nextActionText: null,
          },
        });
      }
    }

    const inquiry = await tx.inquiry.create({
      data: {
        patientId: input.patientId,
        funnelId: aftercare.id,
        stageId: firstStage.id,
        assigneeId: input.actorId,
        createdById: input.actorId,
        status: InquiryStatus.OPEN,
        reasonText: "Продолжение после первичного приёма",
        firstContactAt: new Date(),
        nextActionAt: dueAt,
        nextActionText: "Составить / обсудить план лечения",
      },
    });

    await tx.task.create({
      data: {
        title: "План лечения после первичного приёма",
        dueAt,
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
        action: "aftercare_started",
        payload: JSON.stringify({ fromInquiryId: input.fromInquiryId }),
      },
    });

    return inquiry;
  });
}
