"use client";

import { useMemo, useState } from "react";
import type { AppointmentStatus } from "@prisma/client";

const OPTIONS: { value: AppointmentStatus; label: string; needsReason: boolean }[] = [
  { value: "OFFERED", label: "Предложена запись", needsReason: false },
  { value: "BOOKED", label: "Записан", needsReason: false },
  { value: "CONFIRMED", label: "Подтверждён", needsReason: false },
  { value: "ARRIVED", label: "Пришёл", needsReason: false },
  { value: "CANCELLED_BY_PATIENT", label: "Отменил пациент", needsReason: true },
  { value: "RESCHEDULED_BY_CLINIC", label: "Перенос клиникой", needsReason: true },
  { value: "NO_SHOW", label: "Не пришёл", needsReason: true },
  { value: "NEEDS_REBOOK", label: "Требуется повторная запись", needsReason: false },
];

export function AppointmentStatusForm({
  appointmentId,
  patientId,
  currentStatus,
  cancelReasons,
  action,
}: {
  appointmentId: string;
  patientId: string;
  currentStatus: AppointmentStatus;
  cancelReasons: { id: string; name: string }[];
  action: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const [status, setStatus] = useState<AppointmentStatus>(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const needsReason = useMemo(
    () => OPTIONS.find((o) => o.value === status)?.needsReason ?? false,
    [status],
  );

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = await action(formData);
    if (res?.error) setError(res.error);
  }

  return (
    <form action={onSubmit} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="patientId" value={patientId} />
      <label className="text-sm">
        <span className="sr-only">Статус</span>
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
          className="rounded-lg border border-[var(--line)] bg-white px-2 py-1.5"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {needsReason ? (
        <select
          name="cancelReasonId"
          required
          defaultValue=""
          className="rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-sm"
        >
          <option value="" disabled>
            Причина
          </option>
          {cancelReasons.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      ) : null}
      <input
        name="comment"
        placeholder="Комментарий"
        className="min-w-[140px] flex-1 rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-sm"
      />
      <button
        type="submit"
        className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
      >
        Обновить
      </button>
      {error ? <p className="w-full text-sm text-[var(--danger)]">{error}</p> : null}
    </form>
  );
}
