/** Normalize RU/international phone to digits starting with country code when possible. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && (digits.startsWith("8") || digits.startsWith("7"))) {
    return `7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `7${digits}`;
  }
  return digits;
}

export function displayName(parts: {
  lastName?: string | null;
  firstName?: string | null;
  middleName?: string | null;
}): string {
  return [parts.lastName, parts.firstName, parts.middleName].filter(Boolean).join(" ");
}
