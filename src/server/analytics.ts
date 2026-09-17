import { AppointmentStatus, InquiryStatus, Role, TaskStatus } from "@prisma/client";
import { prisma } from "@/server/db";

function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function avg(nums: number[]) {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export async function getManagementAnalytics(opts?: { assigneeId?: string }) {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  const website = await prisma.channel.findFirst({ where: { code: "website" } });
  const form = await prisma.channel.findFirst({ where: { code: "form" } });
  const siteChannelIds = [website?.id, form?.id].filter(Boolean) as string[];

  const assigneeScope = opts?.assigneeId ? { assigneeId: opts.assigneeId } : {};
  const taskAssigneeScope = opts?.assigneeId ? { assigneeId: opts.assigneeId } : {};
  const appointmentScope = opts?.assigneeId
    ? { inquiry: { assigneeId: opts.assigneeId } }
    : {};

  const [
    inquiriesTotal,
    patientsTotal,
    openInquiries,
    overdueTasks,
    withoutNextAction,
    appointmentsBookedLike,
    appointmentsArrived,
    appointmentsNoShow,
    appointmentsCancelled,
    lostInquiries,
    inquiriesToday,
    inquiriesWeek,
    fromSiteToday,
    withExternalId,
    byChannel,
    byLossReason,
    contactedInquiries,
    inquiriesWithAssignee,
    tasksByAssignee,
  ] = await Promise.all([
    prisma.inquiry.count({ where: assigneeScope }),
    opts?.assigneeId
      ? prisma.patient.count({
          where: { inquiries: { some: { assigneeId: opts.assigneeId } } },
        })
      : prisma.patient.count(),
    prisma.inquiry.count({ where: { status: InquiryStatus.OPEN, ...assigneeScope } }),
    prisma.task.count({
      where: { status: TaskStatus.OPEN, dueAt: { lt: now }, ...taskAssigneeScope },
    }),
    prisma.inquiry.count({
      where: { status: InquiryStatus.OPEN, nextActionAt: null, ...assigneeScope },
    }),
    prisma.appointment.count({
      where: {
        ...appointmentScope,
        status: {
          in: [
            AppointmentStatus.BOOKED,
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.ARRIVED,
          ],
        },
      },
    }),
    prisma.appointment.count({
      where: { status: AppointmentStatus.ARRIVED, ...appointmentScope },
    }),
    prisma.appointment.count({
      where: { status: AppointmentStatus.NO_SHOW, ...appointmentScope },
    }),
    prisma.appointment.count({
      where: {
        ...appointmentScope,
        status: {
          in: [AppointmentStatus.CANCELLED_BY_PATIENT, AppointmentStatus.RESCHEDULED_BY_CLINIC],
        },
      },
    }),
    prisma.inquiry.count({ where: { status: InquiryStatus.LOST, ...assigneeScope } }),
    prisma.inquiry.count({ where: { createdAt: { gte: dayStart }, ...assigneeScope } }),
    prisma.inquiry.count({ where: { createdAt: { gte: weekStart }, ...assigneeScope } }),
    siteChannelIds.length
      ? prisma.inquiry.count({
          where: {
            channelId: { in: siteChannelIds },
            createdAt: { gte: dayStart },
            ...assigneeScope,
          },
        })
      : Promise.resolve(0),
    prisma.inquiry.count({ where: { externalId: { not: null }, ...assigneeScope } }),
    prisma.inquiry.groupBy({
      by: ["channelId"],
      where: assigneeScope,
      _count: { _all: true },
    }),
    prisma.inquiry.groupBy({
      by: ["lossReasonId"],
      where: { status: InquiryStatus.LOST, lossReasonId: { not: null }, ...assigneeScope },
      _count: { _all: true },
    }),
    prisma.inquiry.findMany({
      where: {
        firstContactAt: { not: null },
        firstContactDueAt: { not: null },
        ...assigneeScope,
      },
      select: {
        createdAt: true,
        firstContactAt: true,
        firstContactDueAt: true,
      },
      take: 2000,
    }),
    prisma.inquiry.groupBy({
      by: ["assigneeId"],
      where: { assigneeId: { not: null }, ...assigneeScope },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["assigneeId"],
      where: { status: TaskStatus.OPEN, dueAt: { lt: now }, ...taskAssigneeScope },
      _count: { _all: true },
    }),
  ]);

  const channels = await prisma.channel.findMany();
  const channelMap = Object.fromEntries(channels.map((c) => [c.id, c.name]));
  const lossReasons = await prisma.lossReason.findMany();
  const lossMap = Object.fromEntries(lossReasons.map((r) => [r.id, r.name]));

  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true },
  });

  const firstResponseMinutes = contactedInquiries
    .filter((i) => i.firstContactAt)
    .map((i) => (i.firstContactAt!.getTime() - i.createdAt.getTime()) / 60000);

  const slaBreaches = contactedInquiries.filter(
    (i) => i.firstContactAt && i.firstContactDueAt && i.firstContactAt > i.firstContactDueAt,
  ).length;

  const openWithoutFirstContact = await prisma.inquiry.count({
    where: { status: InquiryStatus.OPEN, firstContactAt: null, ...assigneeScope },
  });

  const inquiriesWithAppt = await prisma.inquiry.count({
    where: { appointments: { some: {} }, ...assigneeScope },
  });

  const wonInquiries = await prisma.inquiry.count({
    where: { status: InquiryStatus.WON, ...assigneeScope },
  });

  const byEmployee = users
    .filter((u) => {
      if (opts?.assigneeId) return u.id === opts.assigneeId;
      return u.role === Role.OPERATOR || u.role === Role.MANAGER;
    })
    .map((u) => {
      const assigned = inquiriesWithAssignee.find((r) => r.assigneeId === u.id)?._count._all ?? 0;
      const overdue = tasksByAssignee.find((r) => r.assigneeId === u.id)?._count._all ?? 0;
      return { id: u.id, name: u.name, role: u.role, assigned, overdueTasks: overdue };
    })
    .sort((a, b) => b.assigned - a.assigned);

  return {
    scoped: Boolean(opts?.assigneeId),
    totals: {
      inquiriesTotal,
      patientsTotal,
      openInquiries,
      overdueTasks,
      withoutNextAction,
      appointmentsBookedLike,
      appointmentsArrived,
      appointmentsNoShow,
      appointmentsCancelled,
      lostInquiries,
      inquiriesToday,
      inquiriesWeek,
      fromSiteToday,
      withExternalId,
      openWithoutFirstContact,
      wonInquiries,
      inquiriesWithAppt,
    },
    rates: {
      inquiryToAppointment: pct(inquiriesWithAppt, inquiriesTotal),
      appointmentToVisit: pct(appointmentsArrived, appointmentsBookedLike),
      inquiryToVisit: pct(appointmentsArrived, inquiriesTotal),
      lostRate: pct(lostInquiries, inquiriesTotal),
      noShowRate: pct(
        appointmentsNoShow,
        appointmentsBookedLike + appointmentsNoShow + appointmentsCancelled,
      ),
    },
    sla: {
      avgFirstResponseMinutes: avg(firstResponseMinutes),
      sampleSize: firstResponseMinutes.length,
      slaBreaches,
    },
    byChannel: byChannel.map((row) => ({
      name: row.channelId ? channelMap[row.channelId] ?? "—" : "Без канала",
      count: row._count._all,
    })),
    byLossReason: byLossReason
      .map((row) => ({
        name: row.lossReasonId ? lossMap[row.lossReasonId] ?? "—" : "—",
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    byEmployee,
  };
}

export async function getMarketingAnalytics(opts?: { days?: number }) {
  const days = opts?.days ?? 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const inquiries = await prisma.inquiry.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      status: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      sourceCampaign: true,
      sourceSystem: true,
      channelId: true,
      appointments: {
        select: { status: true },
      },
    },
  });

  type Agg = {
    key: string;
    label: string;
    inquiries: number;
    withAppointment: number;
    arrived: number;
    lost: number;
  };

  const buckets = new Map<string, Agg>();

  function bump(key: string, label: string, row: (typeof inquiries)[number]) {
    const cur = buckets.get(key) ?? {
      key,
      label,
      inquiries: 0,
      withAppointment: 0,
      arrived: 0,
      lost: 0,
    };
    cur.inquiries += 1;
    if (row.appointments.length > 0) cur.withAppointment += 1;
    if (row.appointments.some((a) => a.status === AppointmentStatus.ARRIVED)) cur.arrived += 1;
    if (row.status === InquiryStatus.LOST) cur.lost += 1;
    buckets.set(key, cur);
  }

  for (const row of inquiries) {
    const source = row.utmSource || row.sourceSystem || "—";
    const campaign = row.utmCampaign || row.sourceCampaign || "—";
    const medium = row.utmMedium || "—";
    bump(`src:${source}`, `Источник: ${source}`, row);
    bump(`camp:${campaign}`, `Кампания: ${campaign}`, row);
    bump(`med:${medium}`, `Канал UTM: ${medium}`, row);
  }

  const rows = [...buckets.values()]
    .filter((r) => r.inquiries > 0)
    .map((r) => ({
      ...r,
      toAppointmentPct: pct(r.withAppointment, r.inquiries),
      toVisitPct: pct(r.arrived, r.inquiries),
      lostPct: pct(r.lost, r.inquiries),
    }))
    .sort((a, b) => b.inquiries - a.inquiries);

  const bySource = rows.filter((r) => r.key.startsWith("src:"));
  const byCampaign = rows.filter((r) => r.key.startsWith("camp:"));
  const byMedium = rows.filter((r) => r.key.startsWith("med:"));

  const withUtm = inquiries.filter(
    (i) => i.utmSource || i.utmCampaign || i.sourceCampaign || i.sourceSystem,
  ).length;

  return {
    days,
    totals: {
      inquiries: inquiries.length,
      withAttribution: withUtm,
      withoutAttribution: inquiries.length - withUtm,
    },
    bySource,
    byCampaign,
    byMedium,
  };
}

export async function listAuditLog(opts?: { take?: number; entityType?: string }) {
  const take = opts?.take ?? 100;
  return prisma.auditLog.findMany({
    where: opts?.entityType ? { entityType: opts.entityType } : undefined,
    include: { actor: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export { canSeeManagementDashboard } from "@/lib/roles";
