import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { formatWhen } from "@/components/Time";
import { canSeeManagementDashboard } from "@/lib/roles";
import { getSessionUser } from "@/server/auth";
import { listAuditLog } from "@/server/analytics";

const actionLabel: Record<string, string> = {
  created: "Создание",
  stage_changed: "Смена этапа",
  status_changed: "Смена статуса",
  appointment_stage_sync: "Синхронизация этапа с записью",
  reminder_sent: "Напоминание о подтверждении",
  aftercare_started: "Старт aftercare",
  outbound_ok: "МИС: исходящий OK",
  outbound_failed: "МИС: исходящий сбой",
  processed: "Входящее событие МИС",
};

export default async function AuditPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canSeeManagementDashboard(user.role)) redirect("/queue");

  const logs = await listAuditLog({ take: 150 });

  return (
    <AppShell user={user}>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Аудит</h1>
      <p className="mt-1 text-[var(--muted)]">
        Журнал изменений: этапы, записи, интеграции. Доступен руководителям.
      </p>

      <ul className="mt-8 space-y-2">
        {logs.length === 0 ? (
          <li className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-10 text-center text-[var(--muted)]">
            Пока нет записей аудита
          </li>
        ) : (
          logs.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
            >
              <div className="font-medium">
                {actionLabel[row.action] ?? row.action}
                <span className="ml-2 text-sm font-normal text-[var(--muted)]">
                  {row.entityType} · {row.entityId.slice(0, 10)}…
                </span>
              </div>
              <div className="mt-1 text-sm text-[var(--muted)]">
                {row.actor?.name ?? "система"} · {formatWhen(row.createdAt)}
              </div>
              {row.payload ? (
                <pre className="mt-2 overflow-x-auto rounded-md bg-[var(--bg-accent)] px-3 py-2 text-xs text-[var(--muted)]">
                  {prettyPayload(row.payload)}
                </pre>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </AppShell>
  );
}

function prettyPayload(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
