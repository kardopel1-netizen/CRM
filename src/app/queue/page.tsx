import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DueBadge, formatWhen } from "@/components/Time";
import { displayName } from "@/lib/phone";
import { canSeeAllInquiries, getSessionUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { InquiryStatus } from "@prisma/client";

export default async function QueuePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const where = canSeeAllInquiries(user.role)
    ? { status: InquiryStatus.OPEN }
    : { status: InquiryStatus.OPEN, assigneeId: user.id };

  const inquiries = await prisma.inquiry.findMany({
    where,
    include: {
      patient: true,
      stage: true,
      channel: true,
      assignee: true,
      serviceDirection: true,
    },
    orderBy: [{ nextActionAt: "asc" }, { createdAt: "desc" }],
  });

  const overdue = inquiries.filter(
    (i) => i.nextActionAt && i.nextActionAt.getTime() < Date.now(),
  ).length;

  const websiteChannel = await prisma.channel.findFirst({ where: { code: "website" } });
  const phoneChannel = await prisma.channel.findFirst({ where: { code: "phone" } });
  const fromSite = websiteChannel
    ? inquiries.filter((i) => i.channelId === websiteChannel.id).length
    : 0;
  const fromPhone = phoneChannel
    ? inquiries.filter((i) => i.channelId === phoneChannel.id).length
    : 0;

  return (
    <AppShell user={user}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">Очередь обращений</h1>
          <p className="mt-1 text-[var(--muted)]">
            Открытые обращения с контролем следующего действия
          </p>
        </div>
        <Link
          href="/patients/new"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-deep)]"
        >
          Новое обращение
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Открыто" value={String(inquiries.length)} />
        <Stat label="С сайта / форм" value={String(fromSite)} />
        <Stat label="С телефона" value={String(fromPhone)} />
        <Stat label="Просрочен следующий шаг" value={String(overdue)} danger={overdue > 0} />
        <Stat
          label="Без следующего действия"
          value={String(inquiries.filter((i) => !i.nextActionAt).length)}
          danger
        />
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--bg-accent)]/60 text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Пациент</th>
              <th className="px-4 py-3 font-medium">Этап</th>
              <th className="px-4 py-3 font-medium">Канал</th>
              <th className="px-4 py-3 font-medium">Следующее действие</th>
              <th className="px-4 py-3 font-medium">Ответственный</th>
            </tr>
          </thead>
          <tbody>
            {inquiries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--muted)]">
                  Нет открытых обращений
                </td>
              </tr>
            ) : (
              inquiries.map((item) => (
                <tr key={item.id} className="border-b border-[var(--line)]/70 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/patients/${item.patientId}`} className="font-medium hover:text-[var(--accent)]">
                      {displayName(item.patient)}
                    </Link>
                    <div className="text-xs text-[var(--muted)]">{item.patient.phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{item.stage.name}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {item.serviceDirection?.name ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">{item.channel?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="mb-1">{item.nextActionText ?? "—"}</div>
                    <DueBadge date={item.nextActionAt} />
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {item.assignee?.name ?? "—"}
                    <div className="text-xs">{formatWhen(item.createdAt)}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div
        className={`mt-1 font-[family-name:var(--font-display)] text-3xl ${
          danger ? "text-[var(--danger)]" : "text-[var(--ink)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
