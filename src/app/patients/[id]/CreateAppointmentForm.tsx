"use client";

import { useState } from "react";

export function CreateAppointmentForm({
  patientId,
  inquiryId,
  action,
}: {
  patientId: string;
  inquiryId?: string;
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
      return;
    }
    setPending(false);
  }

  return (
    <form action={onSubmit} className="mt-3 space-y-3">
      <input type="hidden" name="patientId" value={patientId} />
      {inquiryId ? <input type="hidden" name="inquiryId" value={inquiryId} /> : null}
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Дата и время</span>
        <input
          type="datetime-local"
          name="startsAt"
          required
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Врач</span>
        <input
          name="doctorName"
          placeholder="д-р Петрова"
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Услуга</span>
        <input
          name="serviceName"
          placeholder="Консультация / терапия"
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        />
      </label>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-deep)] disabled:opacity-60"
      >
        {pending ? "Сохранение…" : "Создать запись"}
      </button>
    </form>
  );
}
