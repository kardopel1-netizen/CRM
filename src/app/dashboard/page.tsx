import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/server/auth";
import {
  canSeeManagementDashboard,
  getManagementAnalytics,
} from "@/server/analytics";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const scoped = !canSeeManagementDashboard(user.role);
  const a = await getManagementAnalytics(
    scoped ? { assigneeId: user.id } : undefined,
  );

  return (
    <AppShell user={user}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.16em] text-[var(--accent)]">Управление</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl">Дашборд</h1>
          <p className="mt-1 text-[var(--muted)]">
            {scoped
              ? "Ваши показатели по назначенным обращениям и задачам"
              : "Ключевые показатели без погружения в каждую карточку"}
          </p>
        </div>
        <Link href="/reports" className="text-sm text-[var(--accent)] hover:underline">
          Подробные отчёты →
        </Link>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Обращений сегодня" value={String(a.totals.inquiriesToday)} />
        <Kpi label="За 7 дней" value={String(a.totals.inquiriesWeek)} />
        <Kpi label="Открыто сейчас" value={String(a.totals.openInquiries)} />
        <Kpi
          label="Просроченные задачи"
          value={String(a.totals.overdueTasks)}
          danger={a.totals.overdueTasks > 0}
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Конверсия в запись"
          value={`${a.rates.inquiryToAppointment}%`}
          hint={`${a.totals.inquiriesWithAppt} из ${a.totals.inquiriesTotal}`}
        />
        <Kpi
          label="Запись → визит"
          value={`${a.rates.appointmentToVisit}%`}
          hint={`${a.totals.appointmentsArrived} визитов`}
        />
        <Kpi
          label="Доля потерь"
          value={`${a.rates.lostRate}%`}
          danger={a.rates.lostRate > 30}
          hint={`${a.totals.lostInquiries} потерянных`}
        />
        <Kpi
          label="Ср. первый ответ"
          value={
            a.sla.avgFirstResponseMinutes == null
              ? "—"
              : `${a.sla.avgFirstResponseMinutes} мин`
          }
          hint={
            a.sla.sampleSize
              ? `по ${a.sla.sampleSize} обращениям · SLA нарушен: ${a.sla.slaBreaches}`
              : "пока мало данных"
          }
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Воронка</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <FunnelRow label="Обращения" value={a.totals.inquiriesTotal} max={a.totals.inquiriesTotal} />
            <FunnelRow
              label="С записью"
              value={a.totals.inquiriesWithAppt}
              max={a.totals.inquiriesTotal}
            />
            <FunnelRow
              label="Визиты"
              value={a.totals.appointmentsArrived}
              max={a.totals.inquiriesTotal}
            />
            <FunnelRow
              label="Успешно закрыты (WON)"
              value={a.totals.wonInquiries}
              max={a.totals.inquiriesTotal}
            />
            <FunnelRow
              label="Потеряны"
              value={a.totals.lostInquiries}
              max={a.totals.inquiriesTotal}
              danger
            />
          </ul>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Риски</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <Risk
              label="Без следующего действия"
              value={a.totals.withoutNextAction}
              href="/control"
            />
            <Risk
              label="Без первого контакта"
              value={a.totals.openWithoutFirstContact}
              href="/queue"
            />
            <Risk label="Неявки" value={a.totals.appointmentsNoShow} href="/appointments" />
            <Risk label="Отмены / переносы" value={a.totals.appointmentsCancelled} href="/appointments" />
            <Risk label="С сайта сегодня" value={a.totals.fromSiteToday} href="/queue" />
          </ul>
        </section>
      </div>

      <section className="mt-8 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Сотрудники</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="pb-2 font-medium">Сотрудник</th>
                <th className="pb-2 font-medium">Назначено обращений</th>
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
        </div>
      </section>
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
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
      {hint ? <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div> : null}
    </div>
  );
}

function FunnelRow({
  label,
  value,
  max,
  danger,
}: {
  label: string;
  value: number;
  max: number;
  danger?: boolean;
}) {
  const width = max ? Math.max(8, Math.round((value / max) * 100)) : 0;
  return (
    <li>
      <div className="mb-1 flex justify-between">
        <span>{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-accent)]">
        <div
          className={`h-full rounded-full ${danger ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </li>
  );
}

function Risk({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <li className="flex items-center justify-between border-b border-[var(--line)]/50 py-2">
      <Link href={href} className="hover:text-[var(--accent)]">
        {label}
      </Link>
      <span className={value > 0 ? "font-medium text-[var(--danger)]" : "font-medium"}>{value}</span>
    </li>
  );
}
