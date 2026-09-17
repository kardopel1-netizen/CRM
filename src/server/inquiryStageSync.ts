import { AppointmentStatus, InquiryStatus, type FunnelStage } from "@prisma/client";
import { prisma } from "@/server/db";

/** Appointment status → funnel stage code by funnel. */
const STAGE_BY_FUNNEL: Record<string, Partial<Record<AppointmentStatus, string>>> = {
  primary: {
    [AppointmentStatus.OFFERED]: "offer_made",
    [AppointmentStatus.BOOKED]: "booked",
    [AppointmentStatus.CONFIRMED]: "confirmed",
    [AppointmentStatus.ARRIVED]: "arrived",
    [AppointmentStatus.NO_SHOW]: "no_show",
    [AppointmentStatus.RESCHEDULED_BY_CLINIC]: "booked",
    [AppointmentStatus.NEEDS_REBOOK]: "no_show",
  },
  aftercare: {
    [AppointmentStatus.OFFERED]: "booked_next",
    [AppointmentStatus.BOOKED]: "booked_next",
    [AppointmentStatus.CONFIRMED]: "booked_next",
    [AppointmentStatus.ARRIVED]: "treatment_started",
    [AppointmentStatus.RESCHEDULED_BY_CLINIC]: "booked_next",
  },
  return: {
    [AppointmentStatus.OFFERED]: "booked",
    [AppointmentStatus.BOOKED]: "booked",
    [AppointmentStatus.CONFIRMED]: "booked",
    [AppointmentStatus.ARRIVED]: "arrived",
    [AppointmentStatus.RESCHEDULED_BY_CLINIC]: "booked",
  },
};

const NEXT_ACTION_BY_STAGE: Record<string, string> = {
  offer_made: "Дождаться согласия на запись / зафиксировать слот",
  booked: "Подтвердить запись пациента",
  booked_next: "Подтвердить запись на следующий этап",
  confirmed: "Дождаться визита / отметить факт прихода",
  arrived: "Визит состоялся",
  no_show: "Связаться после неявки",
  treatment_started: "Контроль продолжения лечения",
};

/**
 * Extra edges so appointment sync can reach booked/confirmed/no_show
 * without walking through arrived (linear seed alone is not enough).
 */
async function ensureAppointmentSyncEdges(funnelId: string, stages: FunnelStage[]) {
  const byCode = Object.fromEntries(stages.map((s) => [s.code, s]));
  const pairs: [string, string][] = [
    ["new", "booked"],
    ["contacted", "booked"],
    ["need_defined", "booked"],
    ["offer_made", "booked"],
    ["booked", "confirmed"],
    ["booked", "no_show"],
    ["confirmed", "no_show"],
    ["confirmed", "arrived"],
    ["due", "booked"],
    ["contacted", "booked"],
    ["needs_continue", "booked_next"],
    ["plan_ready", "booked_next"],
    ["first_visit_done", "booked_next"],
    ["booked_next", "treatment_started"],
  ];

  for (const [fromCode, toCode] of pairs) {
    const from = byCode[fromCode];
    const to = byCode[toCode];
    if (!from || !to || from.funnelId !== funnelId) continue;
    await prisma.stageTransition.upsert({
      where: {
        fromStageId_toStageId: { fromStageId: from.id, toStageId: to.id },
      },
      create: { fromStageId: from.id, toStageId: to.id },
      update: {},
    });
  }
}

function findPath(
  fromId: string,
  toId: string,
  edges: Map<string, string[]>,
): string[] | null {
  if (fromId === toId) return [fromId];
  const queue: string[] = [fromId];
  const prev = new Map<string, string | null>([[fromId, null]]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of edges.get(cur) ?? []) {
      if (prev.has(next)) continue;
      // Avoid walking through arrived when targeting no_show
      prev.set(next, cur);
      if (next === toId) {
        const path = [toId];
        let p: string | null = cur;
        while (p) {
          path.push(p);
          p = prev.get(p) ?? null;
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

/**
 * Move inquiry funnel stage to match appointment status.
 * Idempotent; soft no-op when mapping/path missing or inquiry terminal (except reopen-ish cases).
 */
export async function syncInquiryStageFromAppointment(input: {
  inquiryId: string | null | undefined;
  appointmentStatus: AppointmentStatus;
  actorId: string;
  appointmentId?: string;
}) {
  if (!input.inquiryId) {
    return { synced: false as const, reason: "no_inquiry" as const };
  }

  const inquiry = await prisma.inquiry.findUnique({
    where: { id: input.inquiryId },
    include: {
      stage: true,
      funnel: true,
    },
  });
  if (!inquiry) {
    return { synced: false as const, reason: "inquiry_missing" as const };
  }

  const map = STAGE_BY_FUNNEL[inquiry.funnel.code];
  const targetCode = map?.[input.appointmentStatus];
  if (!targetCode) {
    return { synced: false as const, reason: "no_mapping" as const };
  }

  if (inquiry.stage.code === targetCode) {
    return { synced: false as const, reason: "already_there" as const };
  }

  // Don't pull closed lost inquiries back; allow WON→noop for arrived re-sync
  if (inquiry.status === InquiryStatus.LOST) {
    return { synced: false as const, reason: "inquiry_lost" as const };
  }

  const stages = await prisma.funnelStage.findMany({
    where: { funnelId: inquiry.funnelId, active: true },
    orderBy: { sortOrder: "asc" },
  });
  await ensureAppointmentSyncEdges(inquiry.funnelId, stages);

  const target = stages.find((s) => s.code === targetCode);
  if (!target) {
    return { synced: false as const, reason: "stage_missing" as const };
  }

  // If already past target on the happy path (higher sortOrder) and target isn't no_show — skip
  if (
    targetCode !== "no_show" &&
    inquiry.stage.sortOrder > target.sortOrder &&
    inquiry.status === InquiryStatus.WON
  ) {
    return { synced: false as const, reason: "already_past" as const };
  }

  const transitions = await prisma.stageTransition.findMany({
    where: { fromStageId: { in: stages.map((s) => s.id) } },
  });
  const edges = new Map<string, string[]>();
  for (const t of transitions) {
    const list = edges.get(t.fromStageId) ?? [];
    list.push(t.toStageId);
    edges.set(t.fromStageId, list);
  }

  // Prefer path that does not go through arrived when targeting no_show
  let path = findPath(inquiry.stageId, target.id, edges);
  if (targetCode === "no_show" && path?.some((id) => stages.find((s) => s.id === id)?.code === "arrived")) {
    path = null;
  }

  if (!path) {
    // Direct edge fallback already ensured; try again or force direct
    const direct = await prisma.stageTransition.findUnique({
      where: {
        fromStageId_toStageId: {
          fromStageId: inquiry.stageId,
          toStageId: target.id,
        },
      },
    });
    if (!direct) {
      // Force sync: appointment is source of truth for these statuses
      await prisma.stageTransition.upsert({
        where: {
          fromStageId_toStageId: {
            fromStageId: inquiry.stageId,
            toStageId: target.id,
          },
        },
        create: { fromStageId: inquiry.stageId, toStageId: target.id },
        update: {},
      });
    }
    path = [inquiry.stageId, target.id];
  }

  const slaMinutes = target.slaMinutes;
  const nextActionAt =
    target.isTerminal && targetCode !== "no_show"
      ? null
      : slaMinutes
        ? new Date(Date.now() + slaMinutes * 60 * 1000)
        : inquiry.nextActionAt;

  const nextActionText =
    target.isTerminal && targetCode !== "no_show"
      ? null
      : NEXT_ACTION_BY_STAGE[targetCode] ?? inquiry.nextActionText;

  const isLost = target.requiresReason || target.code === "lost" || target.code === "refused";
  let status: InquiryStatus = inquiry.status;
  let closedAt: Date | null = inquiry.closedAt;

  if (isLost) {
    // appointment sync never auto-loses without reason
    return { synced: false as const, reason: "requires_reason" as const };
  }

  if (targetCode === "arrived" || targetCode === "treatment_started") {
    status = InquiryStatus.WON;
    closedAt = new Date();
  } else if (inquiry.status === InquiryStatus.WON && targetCode === "no_show") {
    status = InquiryStatus.OPEN;
    closedAt = null;
  } else if (status === InquiryStatus.DEFERRED) {
    status = InquiryStatus.OPEN;
  }

  await prisma.$transaction(async (tx) => {
    await tx.inquiry.update({
      where: { id: inquiry.id },
      data: {
        stageId: target.id,
        status,
        closedAt,
        nextActionAt,
        nextActionText,
        firstContactAt: inquiry.firstContactAt ?? new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        entityType: "Inquiry",
        entityId: inquiry.id,
        action: "appointment_stage_sync",
        payload: JSON.stringify({
          appointmentId: input.appointmentId ?? null,
          appointmentStatus: input.appointmentStatus,
          fromStage: inquiry.stage.code,
          toStage: targetCode,
          path: path!.map((id) => stages.find((s) => s.id === id)?.code ?? id),
        }),
      },
    });
  });

  return {
    synced: true as const,
    fromStage: inquiry.stage.code,
    toStage: targetCode,
  };
}
