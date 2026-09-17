"use client";

import { useState } from "react";

export function ScheduleReturnForm({
  patientId,
  inquiryId,
  reasons,
  action,
}: {
  patientId: string;
  inquiryId?: string;
  reasons: { code: string; name: string }[];
  action: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const defaultDue = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    d.setMinutes(0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

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
      {inquiryId ? <input type="hidden" name="fromInquiryId" value={inquiryId} /> : null}
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Причина возврата</span>
        <select
          name="reasonCode"
          defaultValue="continue_treatment"
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        >
          {reasons.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Дата контакта</span>
        <input
          type="datetime-local"
          name="dueAt"
          required
          defaultValue={defaultDue}
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Комментарий</span>
        <textarea
          name="comment"
          rows={2}
          placeholder="Через 2 недели после лечения / гигиена через 6 мес."
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        />
      </label>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-deep)] disabled:opacity-60"
      >
        {pending ? "Сохранение…" : "Запланировать возврат"}
      </button>
    </form>
  );
}
