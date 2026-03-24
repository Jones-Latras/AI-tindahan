const pesoFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
  minimumFractionDigits: 2,
});

export function formatCurrencyFromCents(cents: number) {
  return pesoFormatter.format((Number.isFinite(cents) ? cents : 0) / 100);
}

export function parseCurrencyToCents(value: string) {
  const normalized = value.replace(/[^0-9.]/g, "").trim();

  if (!normalized) {
    return 0;
  }

  const parsed = Number.parseFloat(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return Number.NaN;
  }

  return Math.round(parsed * 100);
}

export function centsToDisplayValue(cents: number) {
  return (cents / 100).toFixed(2);
}

export function clampMoneyCents(cents: number) {
  if (!Number.isFinite(cents)) {
    return 0;
  }

  return Math.max(0, Math.round(cents));
}

