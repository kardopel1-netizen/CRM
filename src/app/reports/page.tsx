import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { InquiryStatus, TaskStatus } from "@prisma/client";

export default async function ReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const website = await prisma.channel.findFirst({ where: { code: "website" } });
  const form = await prisma.channel.findFirst({ where: { code: "form" } });
  const siteChannelIds = [website?.id, form?.id].filter(Boolean) as string[];

  const [
    newInquiries,
    uniquePatients,
    openInquiries,
    overdueTasks,
    withoutNextAction,
    booked,
    lost,
    byChannel,
    fromSiteToday,
    withExternalId,
  ] = await Promise.all([
    prisma.inquiry.count(),
    prisma.patient.count(),
    prisma.inquiry.count({ where: { status: InquiryStatus.OPEN } }),
    prisma.task.count({ where: { status: TaskStatus.OPEN, dueAt: { lt: now } } }),
    prisma.inquiry.count({
      where: { status: InquiryStatus.OPEN, nextActionAt: null },
    }),
    prisma.appointment.count({
      where: { status: { in: ["BOOKED", "CONFIRMED", "ARRIVED"] } },
    }),
    prisma.inquiry.count({ where: { status: InquiryStatus.LOST } }),
    prisma.inquiry.groupBy({
      by: ["channelId"],
      _count: { _all: true },
    }),
    siteChannelIds.length
      ? prisma.inquiry.count({
          where: { channelId: { in: siteChannelIds }, createdAt: { gte: dayStart } },
        })
      : Promise.resolve(0),
    prisma.inquiry.count({ where: { externalId: { not: null } } }),
  ]);

  const channels = await prisma.channel.findMany();
  const channelMap = Object.fromEntries(channels.map((c) => [c.id, c.name]));

  return (
    <AppShell user={user}>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Отчёты</h1>
      <p className="mt-1 text-[var(--muted)]">Базовые управленческие показатели MVP</p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Обращений всего" value={newInquiries} />
        <Card label="Уникальных пациентов" value={uniquePatients} />
        <Card label="Открытых обращений" value={openInquiries} />
        <Card label="Просроченных задач" value={overdueTasks} danger={overdueTasks > 0} />
        <Card label="Без следующего действия" value={withoutNextAction} danger={withoutNextAction > 0} />
        <Card label="Записей (активные статусы)" value={booked} />
        <Card label="Потерянных" value={lost} />
        <Card label="С сайта/форм сегодня" value={fromSiteToday} />
        <Card label="Через вебхук (externalId)" value={withExternalId} />
      </div>

      <div className="mt-8 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-xl">По каналам</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {byChannel.map((row) => (
            <li key={String(row.channelId)} className="flex justify-between border-b border-[var(--line)]/50 py-2">
              <span>{row.channelId ? channelMap[row.channelId] ?? "—" : "Без канала"}</span>
              <span className="font-medium">{row._count._all}</span>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}

function Card({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div
        className={`mt-2 font-[family-name:var(--font-display)] text-3xl ${
          danger ? "text-[var(--danger)]" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
