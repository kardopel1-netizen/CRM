import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { canAccessAdmin, getSessionUser } from "@/server/auth";
import { prisma } from "@/server/db";
import {
  adminCreateClassifierAction,
  adminCreateUserAction,
  adminToggleClassifierAction,
  adminUpdateUserAction,
} from "./actions";
import { ClassifierSection, CreateUserForm, UserRowForm } from "./AdminForms";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canAccessAdmin(user.role)) redirect("/queue");

  const [users, departments, lossReasons, cancelReasons, channels, services] =
    await Promise.all([
      prisma.user.findMany({
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          departmentId: true,
        },
      }),
      prisma.department.findMany({ orderBy: { name: "asc" } }),
      prisma.lossReason.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.cancelReason.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.channel.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.serviceDirection.findMany({ orderBy: { sortOrder: "asc" } }),
    ]);

  return (
    <AppShell user={user}>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Администрирование</h1>
      <p className="mt-1 text-[var(--muted)]">
        Пользователи, роли и классификаторы. Доступ: админ / управляющий / собственник.
      </p>

      <section className="mt-8 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Пользователи</h2>
        <div className="mt-2">
          {users.map((u) => (
            <UserRowForm
              key={u.id}
              user={u}
              departments={departments}
              action={adminUpdateUserAction}
            />
          ))}
        </div>
        <div className="mt-6 border-t border-[var(--line)] pt-4">
          <h3 className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
            Новый пользователь
          </h3>
          <CreateUserForm departments={departments} action={adminCreateUserAction} />
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <ClassifierSection
          title="Причины потерь"
          kind="loss"
          items={lossReasons}
          createAction={adminCreateClassifierAction}
          toggleAction={adminToggleClassifierAction}
        />
        <ClassifierSection
          title="Причины отмены записи"
          kind="cancel"
          items={cancelReasons}
          createAction={adminCreateClassifierAction}
          toggleAction={adminToggleClassifierAction}
        />
        <ClassifierSection
          title="Каналы обращений"
          kind="channel"
          items={channels}
          createAction={adminCreateClassifierAction}
          toggleAction={adminToggleClassifierAction}
        />
        <ClassifierSection
          title="Направления услуг"
          kind="service"
          items={services}
          createAction={adminCreateClassifierAction}
          toggleAction={adminToggleClassifierAction}
        />
      </div>
    </AppShell>
  );
}
