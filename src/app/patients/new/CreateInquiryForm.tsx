"use client";

import { useState } from "react";

type Option = { id: string; name: string };

export function CreateInquiryForm({
  channels,
  directions,
  action,
}: {
  channels: Option[];
  directions: Option[];
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
    <form action={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Фамилия" name="lastName" required />
      <Field label="Имя" name="firstName" required />
      <Field label="Отчество" name="middleName" />
      <Field label="Телефон" name="phone" required placeholder="+7 ..." />
      <Field label="Email" name="email" type="email" />
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Канал</span>
        <select
          name="channelId"
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
          defaultValue={channels[0]?.id}
        >
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Направление</span>
        <select
          name="serviceDirectionId"
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        >
          <option value="">—</option>
          {directions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="text-[var(--muted)]">Причина / запрос</span>
        <textarea
          name="reasonText"
          rows={3}
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        />
      </label>
      <Field label="UTM source" name="utmSource" />
      <Field label="UTM campaign" name="utmCampaign" />
      <Field label="Рекламная система" name="sourceSystem" />
      {error ? <p className="text-sm text-[var(--danger)] sm:col-span-2">{error}</p> : null}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2.5 font-medium text-white hover:bg-[var(--accent-deep)] disabled:opacity-60"
        >
          {pending ? "Сохранение…" : "Создать обращение"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 outline-none focus:border-[var(--accent)]"
      />
    </label>
  );
}
