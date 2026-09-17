"use client";

import { useState } from "react";

const TYPES = [
  { value: "CALL", label: "Звонок" },
  { value: "MESSAGE", label: "Сообщение" },
  { value: "COMMENT", label: "Комментарий" },
  { value: "EMAIL", label: "Email" },
];

export function InteractionForm({
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
    (document.getElementById(`interaction-body-${patientId}`) as HTMLTextAreaElement | null)?.form?.reset();
  }

  return (
    <form action={onSubmit} className="mt-4 space-y-3 border-t border-[var(--line)] pt-4">
      <input type="hidden" name="patientId" value={patientId} />
      {inquiryId ? <input type="hidden" name="inquiryId" value={inquiryId} /> : null}
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Тип</span>
        <select
          name="type"
          defaultValue="CALL"
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Что произошло</span>
        <textarea
          id={`interaction-body-${patientId}`}
          name="body"
          required
          rows={3}
          placeholder="Дозвонились, обсудили имплантацию…"
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <input type="checkbox" name="countsAsContactAttempt" value="1" defaultChecked />
        Считать попыткой связи (фиксирует первый контакт)
      </label>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-deep)] disabled:opacity-60"
      >
        {pending ? "Сохранение…" : "Добавить контакт"}
      </button>
    </form>
  );
}
