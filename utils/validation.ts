const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

export function sanitizeText(value: string, maxLength: number) {
  return value
    .replace(CONTROL_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeOptionalText(value: string, maxLength: number) {
  const sanitized = sanitizeText(value, maxLength);
  return sanitized.length > 0 ? sanitized : null;
}

export function sanitizePhone(value: string) {
  const digits = value.replace(/[^\d+]/g, "").trim().slice(0, 16);
  return digits.length > 0 ? digits : null;
}

export function isPositiveWholeNumber(value: number) {
  return Number.isInteger(value) && value >= 0;
}

