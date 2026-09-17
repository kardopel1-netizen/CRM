import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { displayName } from "@/lib/phone";
import { getSessionUser } from "@/server/auth";
import {
  findPossibleDuplicateGroups,
  searchPatientsForMerge,
} from "@/server/merge";
import { mergePatientsAction } from "./actions";
import { MergeForm } from "./MergeForm";

export default async function MergePatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; keep?: string; absorb?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { q, keep, absorb } = await searchParams;
  const query = (q || "").trim();

  const [duplicates, searched] = await Promise.all([
    findPossibleDuplicateGroups(15),
    query ? searchPatientsForMerge(query) : Promise.resolve([]),
  ]);

  const optionsSource = searched.length
    ? searched
    : duplicates.flatMap((g) => g.patients);

  const unique = new Map<string, (typeof optionsSource)[number]>();
  for (const p of optionsSource) unique.set(p.id, p);
  const patients = [...unique.values()].map((p) => ({
    id: p.id,
    label: `${displayName(p)} · ${p.phone}`,
  }));

  return (
    <AppShell user={user}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">Слияние дублей</h1>
          <p className="mt-1 text-[var(--muted)]">
            Одна история пациента вместо нескольких карточек
          </p>
        </div>
        <Link href="/patients" className="text-sm text-[var(--accent)] hover:underline">
          ← К списку пациентов
        </Link>
      </div>

      <form className="mt-6 flex flex-wrap gap-2" action="/patients/merge" method="get">
        <input
          name="q"
          defaultValue={query}
          placeholder="Найти пациентов для слияния…"
          className="min-w-[240px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-deep)]"
        >
          Найти
        </button>
      </form>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Объединить</h2>
          {patients.length < 2 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              Найдите минимум двух пациентов или выберите пару из возможных дублей ниже.
            </p>
          ) : (
            <MergeForm
              patients={patients}
              defaultKeepId={keep}
              defaultAbsorbId={absorb}
              action={mergePatientsAction}
            />
          )}
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Возможные дубли</h2>
          <ul className="mt-4 space-y-4">
            {duplicates.length === 0 ? (
              <li className="text-sm text-[var(--muted)]">Явных групп дублей не найдено</li>
            ) : (
              duplicates.map((group) => (
                <li key={group.key} className="border-b border-[var(--line)]/60 pb-3 last:border-0">
                  <div className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    {group.reason}
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {group.patients.map((p) => (
                      <li key={p.id}>
                        <Link href={`/patients/${p.id}`} className="hover:text-[var(--accent)]">
                          {displayName(p)} · {p.phone}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {group.patients.length >= 2 ? (
                    <Link
                      href={`/patients/merge?keep=${group.patients[0].id}&absorb=${group.patients[1].id}`}
                      className="mt-2 inline-block text-sm text-[var(--accent)] hover:underline"
                    >
                      Слить первых двух →
                    </Link>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
