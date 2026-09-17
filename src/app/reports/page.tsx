import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/server/auth";
import { getManagementAnalytics, getMarketingAnalytics } from "@/server/analytics";

export default async function ReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [a, m] = await Promise.all([
    getManagementAnalytics(),
    getMarketingAnalytics({ days: 30 }),
  ]);

  return (
    <AppShell user={user}>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Отчёты</h1>
      <p className="mt-1 text-[var(--muted)]">
        Обращения, конверсии, SLA, маркетинг (UTM) и нагрузка сотрудников
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Обращений всего" value={a.totals.inquiriesTotal} />
        <Card label="Уникальных пациентов" value={a.totals.patientsTotal} />
        <Card label="Открытых" value={a.totals.openInquiries} />
        <Card label="Просроченных задач" value={a.totals.overdueTasks} danger={a.totals.overdueTasks > 0} />
        <Card
          label="Без следующего действия"
          value={a.totals.withoutNextAction}
          danger={a.totals.withoutNextAction > 0}
        />
        <Card label="Записей (активные)" value={a.totals.appointmentsBookedLike} />
        <Card label="Визиты" value={a.totals.appointmentsArrived} />
        <Card label="Потерянных" value={a.totals.lostInquiries} />
        <Card label="С сайта/форм сегодня" value={a.totals.fromSiteToday} />
        <Card label="Через вебхук" value={a.totals.withExternalId} />
        <Card label="Конверсия в запись %" value={a.rates.inquiryToAppointment} />
        <Card label="Запись → визит %" value={a.rates.appointmentToVisit} />
        <Card
          label="Ср. первый ответ (мин)"
          value={a.sla.avgFirstResponseMinutes ?? 0}
          hint={a.sla.avgFirstResponseMinutes == null ? "нет данных" : undefined}
        />
        <Card label="Нарушений SLA ответа" value={a.sla.slaBreaches} danger={a.sla.slaBreaches > 0} />
        <Card label="Неявки" value={a.totals.appointmentsNoShow} />
        <Card label="Отмены/переносы" value={a.totals.appointmentsCancelled} />
      </div>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Маркетинг · {m.days} дн.</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Разрез по UTM / кампаниям. С атрибуцией: {m.totals.withAttribution} из{" "}
          {m.totals.inquiries}.
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <MarketingTable title="По источнику" rows={m.bySource} />
          <MarketingTable title="По кампании" rows={m.byCampaign} />
          <MarketingTable title="По UTM medium" rows={m.byMedium} />
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl">По каналам</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {a.byChannel.map((row) => (
              <li
                key={row.name}
                className="flex justify-between border-b border-[var(--line)]/50 py-2"
              >
                <span>{row.name}</span>
                <span className="font-medium">{row.count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Причины потерь</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {a.byLossReason.length === 0 ? (
              <li className="text-[var(--muted)]">Пока нет закрытий с причиной</li>
            ) : (
              a.byLossReason.map((row) => (
                <li
                  key={row.name}
                  className="flex justify-between border-b border-[var(--line)]/50 py-2"
                >
                  <span>{row.name}</span>
                  <span className="font-medium">{row.count}</span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <section className="mt-8 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-xl">По сотрудникам</h2>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="pb-2 font-medium">Сотрудник</th>
              <th className="pb-2 font-medium">Обращений</th>
              <th className="pb-2 font-medium">Просроченные задачи</th>
            </tr>
          </thead>
          <tbody>
            {a.byEmployee.map((row) => (
              <tr key={row.id} className="border-t border-[var(--line)]/60">
                <td className="py-2">{row.name}</td>
                <td className="py-2">{row.assigned}</td>
                <td className={`py-2 ${row.overdueTasks > 0 ? "text-[var(--danger)]" : ""}`}>
                  {row.overdueTasks}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}

function MarketingTable({
  title,
  rows,
}: {
  title: string;
  rows: {
    key: string;
    label: string;
    inquiries: number;
    toAppointmentPct: number;
    toVisitPct: number;
    lostPct: number;
  }[];
}) {
  const visible = rows.slice(0, 12);
  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <h3 className="font-[family-name:var(--font-display)] text-lg">{title}</h3>
      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--muted)]">Нет данных за период</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="pb-2 font-medium">Разрез</th>
              <th className="pb-2 font-medium">N</th>
              <th className="pb-2 font-medium">→зап%</th>
              <th className="pb-2 font-medium">→виз%</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key} className="border-t border-[var(--line)]/60">
                <td className="py-2 pr-2">{row.label.replace(/^[^:]+:\s*/, "")}</td>
                <td className="py-2">{row.inquiries}</td>
                <td className="py-2">{row.toAppointmentPct}</td>
                <td className="py-2">{row.toVisitPct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Card({
  label,
  value,
  danger,
  hint,
}: {
  label: string;
  value: number;
  danger?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div
        className={`mt-2 font-[family-name:var(--font-display)] text-3xl ${
          danger ? "text-[var(--danger)]" : ""
        }`}
      >
        {hint ?? value}
      </div>
    </div>
  );
}
