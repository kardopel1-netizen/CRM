"use client";

import { useState } from "react";

type PatientOpt = {
  id: string;
  label: string;
};

export function MergeForm({
  patients,
  defaultKeepId,
  defaultAbsorbId,
  action,
}: {
  patients: PatientOpt[];
  defaultKeepId?: string;
  defaultAbsorbId?: string;
  action: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await action(formData);
    if (res?.error) {
      setError(res.error);
      setPending(false);
    }
  }

  return (
    <form action={onSubmit} className="mt-4 space-y-4">
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Оставить карточку (основная)</span>
        <select
          name="keepId"
          required
          defaultValue={defaultKeepId || ""}
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        >
          <option value="" disabled>
            Выберите пациента
          </option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Поглотить (будет удалена)</span>
        <select
          name="absorbId"
          required
          defaultValue={defaultAbsorbId || ""}
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        >
          <option value="" disabled>
            Выберите дубль
          </option>
          {patients.map((p) => (
            <option key={`a-${p.id}`} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Телефон взять из</span>
          <select
            name="preferPhoneFrom"
            defaultValue="keep"
            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
          >
            <option value="keep">Основной карточки</option>
            <option value="absorb">Поглощаемой</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Email взять из</span>
          <select
            name="preferEmailFrom"
            defaultValue="keep"
            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
          >
            <option value="keep">Основной карточки</option>
            <option value="absorb">Поглощаемой</option>
          </select>
        </label>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Обращения, записи, контакты и уведомления переносятся на основную карточку. Поглощаемая
        удаляется без возможности отмены.
      </p>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--danger)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Слияние…" : "Объединить карточки"}
      </button>
    </form>
  );
}
