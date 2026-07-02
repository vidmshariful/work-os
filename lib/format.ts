import { format, formatDistanceToNowStrict, differenceInCalendarDays, parseISO } from "date-fns";

export function fmtDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d");
}

export function fmtDateFull(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d, yyyy");
}

export function fmtTimeAgo(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? parseISO(date) : date;
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export function fmtMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function fmtPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "0%";
  return `${Math.round(value * 100)}%`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  return differenceInCalendarDays(parseISO(date), new Date());
}

// Deterministic soft color for a person, from the tag palette.
const AVATAR_TONES = [
  "bg-tag-blue-soft text-tag-blue",
  "bg-tag-violet-soft text-tag-violet",
  "bg-tag-green-soft text-tag-green",
  "bg-tag-amber-soft text-tag-amber",
  "bg-tag-rose-soft text-tag-rose",
  "bg-tag-teal-soft text-tag-teal",
];

export function avatarTone(seed: string | null | undefined): string {
  if (!seed) return "bg-chip-gray text-text-2";
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}
