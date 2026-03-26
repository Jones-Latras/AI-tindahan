import type { OverdueLevel } from "@/types/models";

export function getDaysBetween(dateIso: string | null) {
  if (!dateIso) {
    return 0;
  }

  const today = new Date();
  const target = new Date(dateIso);
  const diff = today.getTime() - target.getTime();

  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function getOverdueLevel(days: number): OverdueLevel {
  if (days >= 14) {
    return "critical";
  }

  if (days >= 7) {
    return "attention";
  }

  return "fresh";
}

export function formatDateLabel(dateIso: string | null) {
  if (!dateIso) {
    return "No recent entry";
  }

  const date = new Date(dateIso);

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDateTimeLabel(dateIso: string | null, locale = "en-PH") {
  if (!dateIso) {
    return "No recent entry";
  }

  const date = new Date(dateIso);

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
