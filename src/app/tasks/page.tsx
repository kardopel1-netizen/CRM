import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DueBadge } from "@/components/Time";
import { completeTaskAction } from "@/app/actions";
import { canSeeAllInquiries, getSessionUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { TaskStatus } from "@prisma/client";
import { displayName } from "@/lib/phone";

export default async function TasksPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const where = canSeeAllInquiries(user.role)
    ? { status: TaskStatus.OPEN }
    : { status: TaskStatus.OPEN, assigneeId: user.id };

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignee: true,
      inquiry: { include: { patient: true } },
    },
    orderBy: { dueAt: "asc" },
  });

  return (
    <AppShell user={user}>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Задачи</h1>
      <p className="mt-1 text-[var(--muted)]">Открытые задачи с контролем сроков</p>

      <ul className="mt-8 space-y-3">
        {tasks.length === 0 ? (
          <li className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-10 text-center text-[var(--muted)]">
            Нет открытых задач
          </li>
        ) : (
          tasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4"
            >
              <div>
                <div className="font-medium">{task.title}</div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  {task.inquiry?.patient ? (
                    <Link
                      href={`/patients/${task.inquiry.patientId}`}
                      className="hover:text-[var(--accent)]"
                    >
                      {displayName(task.inquiry.patient)}
                    </Link>
                  ) : (
                    "Без обращения"
                  )}
                  {" · "}
                  {task.assignee.name}
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
    </AppShell>
  );
}
