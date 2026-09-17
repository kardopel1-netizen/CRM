import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DueBadge } from "@/components/Time";
import { completeTaskAction } from "@/app/actions";
import { displayName } from "@/lib/phone";
import { getSessionUser } from "@/server/auth";
import { listControlBoard } from "@/server/escalation";

export default async function ControlPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const board = await listControlBoard({
    role: user.role,
    userId: user.id,
    departmentId: user.departmentId,
  });

  return (
    <AppShell user={user}>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Контроль</h1>
      <p className="mt-1 text-[var(--muted)]">
        Просроченные задачи и обращения без движения. Просроченные задачи помечаются как
        эскалированные для руководителя.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Просроченные задачи" value={board.overdueTasks.length} danger />
        <Stat label="Эскалировано" value={board.escalatedTasks} danger />
        <Stat label="Просрочен следующий шаг" value={board.overdueInquiries.length} danger />
      </div>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Просроченные задачи</h2>
        <ul className="mt-4 space-y-3">
          {board.overdueTasks.length === 0 ? (
            <li className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-8 text-center text-[var(--muted)]">
              Нет просроченных задач
            </li>
          ) : (
            board.overdueTasks.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4"
              >
                <div>
                  <div className="font-medium">{task.title}</div>
                  <div className="mt-1 text-sm text-[var(--muted)]">
                    {task.assignee.name}
                    {task.inquiry?.patient ? (
                      <>
                        {" · "}
                        <Link
                          href={`/patients/${task.inquiry.patientId}`}
                          className="hover:text-[var(--accent)]"
                        >
                          {displayName(task.inquiry.patient)}
                        </Link>
                      </>
                    ) : null}
                    {task.escalatedAt ? " · эскалировано" : null}
                  </div>
                  <div className="mt-2">
                    <DueBadge date={task.dueAt} />
                  </div>
                </div>
                <form action={completeTaskAction}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
                  >
                    Готово
                  </button>
                </form>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-display)] text-xl">
          Обращения с просроченным следующим шагом
        </h2>
        <ul className="mt-4 space-y-3">
          {board.overdueInquiries.length === 0 ? (
            <li className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-8 text-center text-[var(--muted)]">
              Все открытые обращения в сроке
            </li>
          ) : (
            board.overdueInquiries.map((inq) => (
              <li
                key={inq.id}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4"
              >
                <Link
                  href={`/patients/${inq.patientId}`}
                  className="font-medium hover:text-[var(--accent)]"
                >
                  {displayName(inq.patient)}
                </Link>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  {inq.stage.name} · {inq.assignee?.name ?? "без ответственного"}
                  {inq.nextActionText ? ` · ${inq.nextActionText}` : ""}
                </div>
                <div className="mt-2">
                  <DueBadge date={inq.nextActionAt} />
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
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
          danger && value > 0 ? "text-[var(--danger)]" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
