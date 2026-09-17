import { format, formatDistanceToNowStrict, isPast } from "date-fns";
import { ru } from "date-fns/locale";

export function formatWhen(date: Date | string | null | undefined) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "d MMM yyyy, HH:mm", { locale: ru });
}

export function DueBadge({ date }: { date: Date | string | null | undefined }) {
  if (!date) return <span className="text-[var(--muted)]">нет срока</span>;
  const d = typeof date === "string" ? new Date(date) : date;
  const overdue = isPast(d);
  return (
    <span
      className={
        overdue
          ? "inline-flex rounded-md bg-[var(--danger-soft)] px-2 py-0.5 text-xs font-medium text-[var(--danger)]"
          : "inline-flex rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--accent-deep)]"
      }
    >
      {overdue ? "просрочено · " : ""}
      {formatDistanceToNowStrict(d, { locale: ru, addSuffix: true })}
    </span>
  );
}
