"use client";

import { useMemo, useState } from "react";

type Transition = { id: string; name: string; requiresReason: boolean };
type Reason = { id: string; name: string };

export function StageForm({
  inquiryId,
  patientId,
  transitions,
  lossReasons,
  action,
}: {
  inquiryId: string;
  patientId: string;
  transitions: Transition[];
  lossReasons: Reason[];
  action: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const [toStageId, setToStageId] = useState(transitions[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const needsReason = useMemo(
    () => transitions.find((t) => t.id === toStageId)?.requiresReason ?? false,
    [toStageId, transitions],
  );

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = await action(formData);
    if (res?.error) setError(res.error);
  }

  if (transitions.length === 0) {
    return <p className="mt-4 text-sm text-[var(--muted)]">Нет доступных переходов</p>;
  }

  return (
    <form action={onSubmit} className="mt-4 space-y-3">
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <input type="hidden" name="patientId" value={patientId} />
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Новый этап</span>
        <select
          name="toStageId"
          value={toStageId}
          onChange={(e) => setToStageId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        >
          {transitions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {needsReason ? (
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Причина потери</span>
          <select
            name="lossReasonId"
            required
            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
            defaultValue=""
          >
            <option value="" disabled>
              Выберите причину
            </option>
            {lossReasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Следующее действие</span>
            <input
              name="nextActionText"
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
              placeholder="Что сделать дальше"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Срок</span>
            <input
              type="datetime-local"
              name="nextActionAt"
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
            />
          </label>
        </>
      )}
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Комментарий</span>
        <textarea
          name="comment"
          rows={2}
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        />
      </label>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <button
        type="submit"
        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-deep)]"
      >
        Перевести
      </button>
    </form>
  );
}
