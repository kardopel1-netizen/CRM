import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { displayName } from "@/lib/phone";
import { normalizePhone } from "@/lib/phone";
import { getSessionUser } from "@/server/auth";
import { prisma } from "@/server/db";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { q } = await searchParams;
  const query = (q || "").trim();

  const patients = await prisma.patient.findMany({
    where: query
      ? {
          OR: [
            { lastName: { contains: query } },
            { firstName: { contains: query } },
            { phone: { contains: query } },
            { phoneNormalized: { contains: normalizePhone(query) || query } },
            { email: { contains: query } },
          ],
        }
      : undefined,
    include: {
      inquiries: {
        where: { status: { in: ["OPEN", "DEFERRED"] } },
        include: { stage: true },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return (
    <AppShell user={user}>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Пациенты</h1>
      <p className="mt-1 text-[var(--muted)]">Поиск по ФИО, телефону или email</p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <form className="flex flex-1 flex-wrap gap-2" action="/patients" method="get">
          <input
            name="q"
            defaultValue={query}
            placeholder="Ковалёва или +7…"
            className="min-w-[240px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-deep)]"
          >
            Найти
          </button>
        </form>
        <Link
          href="/patients/merge"
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm hover:border-[var(--accent)]"
        >
          Слияние дублей
        </Link>
      </div>

      <ul className="mt-6 space-y-2">
        {patients.length === 0 ? (
          <li className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-8 text-center text-[var(--muted)]">
            Ничего не найдено
          </li>
        ) : (
          patients.map((p) => (
            <li key={p.id}>
              <Link
                href={`/patients/${p.id}`}
                className="block rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--accent)]"
              >
                <div className="font-medium">{displayName(p)}</div>
                <div className="text-sm text-[var(--muted)]">
                  {p.phone}
                  {p.inquiries[0] ? ` · ${p.inquiries[0].stage.name}` : " · нет открытых обращений"}
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </AppShell>
  );
}
