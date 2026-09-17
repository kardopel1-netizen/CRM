import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { canAccessAdmin, roleLabel } from "@/lib/roles";
import type { SessionUser } from "@/server/auth";

const baseNav = [
  { href: "/dashboard", label: "Дашборд" },
  { href: "/queue", label: "Очередь" },
  { href: "/patients", label: "Пациенты" },
  { href: "/tasks", label: "Задачи" },
  { href: "/appointments", label: "Записи" },
  { href: "/notifications", label: "Уведомления" },
  { href: "/control", label: "Контроль" },
  { href: "/patients/new", label: "Новое обращение" },
  { href: "/reports", label: "Отчёты" },
];

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const nav = canAccessAdmin(user.role)
    ? [...baseNav, { href: "/admin", label: "Админ" }]
    : baseNav;

  return (
    <div className="min-h-full">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-8">
            <Link
              href="/queue"
              className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)]"
            >
              Aurelia<span className="text-[var(--accent)]">.</span>CRM
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-sm text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
              <div className="font-medium text-[var(--ink)]">{user.name}</div>
              <div className="text-xs text-[var(--muted)]">{roleLabel(user.role)}</div>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-[var(--line)] px-3 py-1.5 text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
              >
                Выйти
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
