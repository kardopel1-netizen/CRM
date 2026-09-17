import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DueBadge, formatWhen } from "@/components/Time";
import { updateAppointmentStatusAction } from "@/app/actions";
import { displayName } from "@/lib/phone";
import { canSeeAllInquiries, getSessionUser } from "@/server/auth";
import { appointmentStatusLabel } from "@/server/appointments";
import { prisma } from "@/server/db";
import { AppointmentStatusForm } from "@/app/patients/[id]/AppointmentStatusForm";

export default async function AppointmentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

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

  const cancelReasons = await prisma.cancelReason.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <AppShell user={user}>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Записи</h1>
      <p className="mt-1 text-[var(--muted)]">
        Статусы визита. Отмена и неявка — только с причиной из классификатора.
      </p>

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
