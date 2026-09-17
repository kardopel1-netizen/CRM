"use client";

import { useState } from "react";
import { ALL_ROLES, roleLabel } from "@/lib/roles";
import type { Role } from "@prisma/client";

export function CreateUserForm({
  departments,
  action,
}: {
  departments: { id: string; name: string }[];
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
    <form action={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
      <Field name="name" label="Имя" required />
      <Field name="email" label="Email" type="email" required />
      <Field name="password" label="Пароль" type="password" required />
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Роль</span>
        <select
          name="role"
          defaultValue="OPERATOR"
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        >
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="text-[var(--muted)]">Подразделение</span>
        <select
          name="departmentId"
          defaultValue=""
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        >
          <option value="">—</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="text-sm text-[var(--danger)] sm:col-span-2">{error}</p> : null}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-deep)] disabled:opacity-60"
        >
          {pending ? "Создание…" : "Создать пользователя"}
        </button>
      </div>
    </form>
  );
}

export function UserRowForm({
  user,
  departments,
  action,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    active: boolean;
    departmentId: string | null;
  };
  departments: { id: string; name: string }[];
  action: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = await action(formData);
    if (res?.error) setError(res.error);
  }

  return (
    <form
      action={onSubmit}
      className="flex flex-wrap items-end gap-2 border-b border-[var(--line)]/60 py-3 last:border-0"
    >
      <input type="hidden" name="userId" value={user.id} />
      <div className="min-w-[160px] flex-1">
        <div className="font-medium">{user.name}</div>
        <div className="text-xs text-[var(--muted)]">{user.email}</div>
      </div>
      <select
        name="role"
        defaultValue={user.role}
        className="rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-sm"
      >
        {ALL_ROLES.map((r) => (
          <option key={r} value={r}>
            {roleLabel(r)}
          </option>
        ))}
      </select>
      <select
        name="departmentId"
        defaultValue={user.departmentId ?? ""}
        className="rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-sm"
      >
        <option value="">Без отдела</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select
        name="active"
        defaultValue={user.active ? "1" : "0"}
        className="rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-sm"
      >
        <option value="1">Активен</option>
        <option value="0">Выключен</option>
      </select>
      <button
        type="submit"
        className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
      >
        Сохранить
      </button>
      {error ? <p className="w-full text-sm text-[var(--danger)]">{error}</p> : null}
    </form>
  );
}

export function ClassifierSection({
  title,
  kind,
  items,
  createAction,
  toggleAction,
}: {
  title: string;
  kind: "loss" | "cancel" | "channel" | "service";
  items: { id: string; code: string; name: string; active: boolean }[];
  createAction: (formData: FormData) => Promise<{ error?: string } | void>;
  toggleAction: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const [error, setError] = useState<string | null>(null);

  async function onCreate(formData: FormData) {
    setError(null);
    const res = await createAction(formData);
    if (res?.error) setError(res.error);
  }

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <h2 className="font-[family-name:var(--font-display)] text-xl">{title}</h2>
      <ul className="mt-4 space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2">
            <span className={item.active ? "" : "text-[var(--muted)] line-through"}>
              {item.name}{" "}
              <span className="text-xs text-[var(--muted)]">({item.code})</span>
            </span>
            <form
              action={async (formData) => {
                await toggleAction(formData);
              }}
            >
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="active" value={item.active ? "0" : "1"} />
              <button
                type="submit"
                className="rounded-md border border-[var(--line)] px-2 py-1 text-xs hover:border-[var(--accent)]"
              >
                {item.active ? "Выключить" : "Включить"}
              </button>
            </form>
          </li>
        ))}
      </ul>
      <form action={onCreate} className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="kind" value={kind} />
        <input
          name="name"
          required
          placeholder="Новое значение"
          className="min-w-[180px] flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
        />
        <input
          name="code"
          placeholder="код (опц.)"
          className="w-32 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-deep)]"
        >
          Добавить
        </button>
      </form>
      {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
    </section>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
      />
    </label>
  );
}
