import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { formatWhen } from "@/components/Time";
import { displayName } from "@/lib/phone";
import { getSessionUser } from "@/server/auth";
import { prisma } from "@/server/db";
import {
  notificationChannelLabel,
  notificationKindLabel,
  notificationStatusLabel,
} from "@/server/notifications";
import { retryNotificationAction } from "@/app/actions";

export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const provider = (process.env.NOTIFY_PROVIDER || "stub").toLowerCase();
  const providerLabel =
    provider === "http" || provider === "webhook"
      ? `HTTP (${process.env.NOTIFY_CHANNEL || "SMS"})`
      : "stub";

  const notifications = await prisma.notification.findMany({
    include: { patient: true, appointment: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const sent = notifications.filter((n) => n.status === "SENT").length;
  const failed = notifications.filter((n) => n.status === "FAILED").length;
  const pending = notifications.filter((n) => n.status === "PENDING").length;

  return (
    <AppShell user={user}>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Уведомления</h1>
      <p className="mt-1 text-[var(--muted)]">
        Сообщения пациентам по событиям записи. Провайдер:{" "}
        <span className="text-[var(--ink)]">{providerLabel}</span>
        {" — "}
        {provider === "http" || provider === "webhook"
          ? "отправка на NOTIFY_WEBHOOK_URL."
          : "локальная фиксация без SMS; для шлюза задайте NOTIFY_PROVIDER=http (см. docs/ops.md)."}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Отправлено" value={sent} />
        <Stat label="В очереди" value={pending} />
        <Stat label="Ошибки" value={failed} danger={failed > 0} />
      </div>

      <ul className="mt-8 space-y-3">
        {notifications.length === 0 ? (
          <li className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-10 text-center text-[var(--muted)]">
            Пока нет уведомлений. Создайте или измените запись пациента.
          </li>
        ) : (
          notifications.map((n) => (
            <li
              key={n.id}
              className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/patients/${n.patientId}`}
                    className="font-medium hover:text-[var(--accent)]"
                  >
                    {displayName(n.patient)}
                  </Link>
                  <div className="mt-1 text-sm text-[var(--muted)]">
                    {notificationKindLabel[n.kind]} · {notificationChannelLabel[n.channel]} ·{" "}
                    {n.toAddress || "без адреса"} · {formatWhen(n.createdAt)}
                  </div>
                </div>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs ${
                    n.status === "FAILED"
                      ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                      : n.status === "SENT"
                        ? "bg-[var(--accent-soft)] text-[var(--accent-deep)]"
                        : "bg-[var(--bg-accent)] text-[var(--muted)]"
                  }`}
                >
                  {notificationStatusLabel[n.status]}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed">{n.body}</p>
              {n.error ? (
                <p className="mt-2 text-xs text-[var(--danger)]">{n.error}</p>
              ) : null}
              {n.status === "FAILED" ? (
                <form action={retryNotificationAction} className="mt-3">
                  <input type="hidden" name="notificationId" value={n.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
                  >
                    Повторить отправку
                  </button>
                </form>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div
        className={`mt-1 font-[family-name:var(--font-display)] text-3xl ${
          danger ? "text-[var(--danger)]" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
