import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DueBadge, formatWhen } from "@/components/Time";
import { runRemindersAction, updateAppointmentStatusAction } from "@/app/actions";
import { displayName } from "@/lib/phone";
import { canSeeAllInquiries, getSessionUser } from "@/server/auth";
import { appointmentStatusLabel } from "@/server/appointments";
import { prisma } from "@/server/db";
import { AppointmentStatusForm } from "@/app/patients/[id]/AppointmentStatusForm";
import {
  listUpcomingUnconfirmed,
  processAppointmentReminders,
  reminderWindowHours,
} from "@/server/reminders";

export default async function AppointmentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const reminderResult = await processAppointmentReminders({ actorId: user.id });

  const appointments = await prisma.appointment.findMany({
    where: canSeeAllInquiries(user.role)
      ? undefined
      : {
          OR: [
            { inquiry: { assigneeId: user.id } },
            { inquiryId: null },
          ],
        },
    include: {
      patient: true,
      cancelReason: true,
      inquiry: { select: { assigneeId: true } },
    },
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  const [cancelReasons, upcoming] = await Promise.all([
    prisma.cancelReason.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    listUpcomingUnconfirmed(20),
  ]);

  return (
    <AppShell user={user}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">Записи</h1>
          <p className="mt-1 text-[var(--muted)]">
            Статусы визита. Отмена и неявка — только с причиной из классификатора.
          </p>
        </div>
        <form action={runRemindersAction}>
          <button
            type="submit"
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm hover:border-[var(--accent)]"
          >
            Запустить напоминания
          </button>
        </form>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat
          label={`К подтверждению (≤${reminderWindowHours()}ч)`}
          value={upcoming.length}
        />
        <Stat label="Напоминаний отправлено сейчас" value={reminderResult.notified} />
        <Stat label="Пропущено (уже было)" value={reminderResult.skipped} />
      </div>

      {upcoming.length > 0 ? (
        <section className="mt-8 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl">
            Ожидают подтверждения
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            {upcoming.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--line)]/50 py-2">
                <Link href={`/patients/${a.patientId}`} className="hover:text-[var(--accent)]">
                  {displayName(a.patient)}
                </Link>
                <span className="text-[var(--muted)]">
                  {a.startsAt ? formatWhen(a.startsAt) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ul className="mt-8 space-y-3">
        {appointments.length === 0 ? (
          <li className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-10 text-center text-[var(--muted)]">
            Нет записей
          </li>
        ) : (
          appointments.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/patients/${a.patientId}`}
                    className="font-medium hover:text-[var(--accent)]"
                  >
                    {displayName(a.patient)}
                  </Link>
                  <div className="mt-1 text-sm text-[var(--muted)]">
                    {appointmentStatusLabel[a.status]}
                    {a.startsAt ? ` · ${formatWhen(a.startsAt)}` : ""}
                    {a.doctorName ? ` · ${a.doctorName}` : ""}
                  </div>
                  {a.cancelReason ? (
                    <div className="mt-1 text-sm text-[var(--danger)]">{a.cancelReason.name}</div>
                  ) : null}
                  {a.startsAt ? (
                    <div className="mt-2">
                      <DueBadge date={a.startsAt} />
                    </div>
                  ) : null}
                </div>
              </div>
              <AppointmentStatusForm
                appointmentId={a.id}
                patientId={a.patientId}
                currentStatus={a.status}
                cancelReasons={cancelReasons}
                action={updateAppointmentStatusAction}
              />
            </li>
          ))
        )}
      </ul>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-1 font-[family-name:var(--font-display)] text-3xl">{value}</div>
    </div>
  );
}
