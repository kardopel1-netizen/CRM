import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DueBadge, formatWhen } from "@/components/Time";
import {
  changeStageAction,
  createAppointmentAction,
  logInteractionAction,
  updateAppointmentStatusAction,
} from "@/app/actions";
import { displayName } from "@/lib/phone";
import { getSessionUser } from "@/server/auth";
import { appointmentStatusLabel } from "@/server/appointments";
import { prisma } from "@/server/db";
import { StageForm } from "./StageForm";
import { CreateAppointmentForm } from "./CreateAppointmentForm";
import { AppointmentStatusForm } from "./AppointmentStatusForm";
import { InteractionForm } from "./InteractionForm";

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      inquiries: {
        include: {
          stage: true,
          funnel: true,
          channel: true,
          serviceDirection: true,
          lossReason: true,
          assignee: true,
          appointments: { include: { cancelReason: true }, orderBy: { createdAt: "desc" } },
          tasks: { where: { status: "OPEN" }, orderBy: { dueAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      },
      interactions: {
        include: { author: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
    },
  });
  if (!patient) notFound();

  const [lossReasons, cancelReasons] = await Promise.all([
    prisma.lossReason.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.cancelReason.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const openInquiry = patient.inquiries.find((i) => i.status === "OPEN" || i.status === "DEFERRED");
  let transitions: { id: string; name: string; requiresReason: boolean }[] = [];
  if (openInquiry) {
    const edges = await prisma.stageTransition.findMany({
      where: { fromStageId: openInquiry.stageId },
      include: { toStage: true },
    });
    transitions = edges.map((e) => ({
      id: e.toStage.id,
      name: e.toStage.name,
      requiresReason: e.toStage.requiresReason,
    }));
  }

  return (
    <AppShell user={user}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.16em] text-[var(--accent)]">Пациент</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl">
            {displayName(patient)}
          </h1>
          <p className="mt-1 text-[var(--muted)]">
            {patient.phone}
            {patient.email ? ` · ${patient.email}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Обращения</h2>
          {patient.inquiries.map((inquiry) => (
            <article
              key={inquiry.id}
              className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {inquiry.funnel.name} · {inquiry.stage.name}
                  </div>
                  <div className="mt-1 text-sm text-[var(--muted)]">
                    {inquiry.channel?.name ?? "Канал не указан"}
                    {inquiry.serviceDirection ? ` · ${inquiry.serviceDirection.name}` : ""}
                    {" · "}
                    {inquiry.assignee?.name ?? "без ответственного"}
                  </div>
                </div>
                <span className="rounded-md bg-[var(--bg-accent)] px-2 py-0.5 text-xs">
                  {inquiry.status}
                </span>
              </div>
              {inquiry.reasonText ? (
                <p className="mt-3 text-sm">{inquiry.reasonText}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <DueBadge date={inquiry.nextActionAt} />
                <span className="text-[var(--muted)]">
                  {inquiry.nextActionText ?? "нет следующего действия"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                <span>
                  Первый контакт:{" "}
                  {inquiry.firstContactAt ? formatWhen(inquiry.firstContactAt) : "ещё нет"}
                </span>
                <span>Попыток связи: {inquiry.contactAttempts}</span>
                {inquiry.firstContactDueAt ? (
                  <span>
                    SLA первого ответа до: {formatWhen(inquiry.firstContactDueAt)}
                    {inquiry.firstContactDueAt.getTime() < Date.now() && !inquiry.firstContactAt
                      ? " · просрочен"
                      : ""}
                  </span>
                ) : null}
              </div>
              {inquiry.utmSource || inquiry.sourceSystem ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Источник: {[inquiry.sourceSystem, inquiry.utmSource, inquiry.utmCampaign]
                    .filter(Boolean)
                    .join(" / ")}
                </p>
              ) : null}
              {inquiry.lossReason ? (
                <p className="mt-2 text-sm text-[var(--danger)]">
                  Причина потери: {inquiry.lossReason.name}
                </p>
              ) : null}

              <div className="mt-4 border-t border-[var(--line)] pt-3">
                <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Записи</div>
                {inquiry.appointments.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--muted)]">Пока нет записей</p>
                ) : (
                  <ul className="mt-2 space-y-3">
                    {inquiry.appointments.map((a) => (
                      <li key={a.id} className="rounded-lg bg-[var(--bg)]/60 p-3">
                        <div className="text-sm font-medium">
                          {appointmentStatusLabel[a.status]}
                          {a.startsAt ? ` · ${formatWhen(a.startsAt)}` : ""}
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          {[a.doctorName, a.serviceName, a.cancelReason?.name]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                        <AppointmentStatusForm
                          appointmentId={a.id}
                          patientId={patient.id}
                          currentStatus={a.status}
                          cancelReasons={cancelReasons}
                          action={updateAppointmentStatusAction}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {inquiry.tasks.length > 0 ? (
                <div className="mt-4 border-t border-[var(--line)] pt-3">
                  <div className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    Открытые задачи
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {inquiry.tasks.map((t) => (
                      <li key={t.id} className="flex items-center gap-2">
                        {t.title} <DueBadge date={t.dueAt} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
        </section>

        <aside className="space-y-4">
          {openInquiry ? (
            <>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
                <h2 className="font-[family-name:var(--font-display)] text-xl">Новая запись</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Создаёт задачу на подтверждение и обновляет следующий шаг
                </p>
                <CreateAppointmentForm
                  patientId={patient.id}
                  inquiryId={openInquiry.id}
                  action={createAppointmentAction}
                />
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
                <h2 className="font-[family-name:var(--font-display)] text-xl">Смена этапа</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Только разрешённые переходы. Потеря — с причиной.
                </p>
                <StageForm
                  inquiryId={openInquiry.id}
                  patientId={patient.id}
                  transitions={transitions}
                  lossReasons={lossReasons}
                  action={changeStageAction}
                />
              </div>
            </>
          ) : null}

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <h2 className="font-[family-name:var(--font-display)] text-xl">История контактов</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Звонок или сообщение фиксирует первый контакт и может перевести этап «Новое → Контакт
              установлен»
            </p>
            <InteractionForm
              patientId={patient.id}
              inquiryId={openInquiry?.id}
              action={logInteractionAction}
            />
            <ul className="mt-4 space-y-3">
              {patient.interactions.length === 0 ? (
                <li className="text-sm text-[var(--muted)]">Пока нет записей</li>
              ) : (
                patient.interactions.map((item) => (
                  <li key={item.id} className="border-b border-[var(--line)]/60 pb-3 last:border-0">
                    <div className="text-xs text-[var(--muted)]">
                      {item.type} · {formatWhen(item.createdAt)}
                      {item.author ? ` · ${item.author.name}` : ""}
                    </div>
                    <p className="mt-1 text-sm">{item.body}</p>
                  </li>
                ))
              )}
            </ul>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
