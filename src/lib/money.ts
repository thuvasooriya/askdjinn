export function formatMoney(value?: number | string, currency = "LKR") {
  const amount = typeof value === "string" ? parsePrice(value, currency) : value;

  if (!Number.isFinite(amount as number)) return `${currency} \u2014`;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "LKR" ? 0 : 2,
  }).format(amount as number);
}

export function parsePrice(value: unknown, currency?: string) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;

  const stripped = value.replace(/\b(?:LKR|USD|Rs)\.?\s*/gi, "").trim();
  const normalized = normalizeNumberString(stripped, currency);
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeNumberString(value: string, currency?: string) {
  const cleaned = value.replace(/[^0-9.,-]/g, "");
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    return cleaned.replaceAll(thousands, "").replace(decimal, ".");
  }

  const separator = lastDot >= 0 ? "." : lastComma >= 0 ? "," : "";
  if (!separator) return cleaned;

  if (separator === "," && (currency === "LKR" || currency === "Rs")) {
    return cleaned.replaceAll(",", "");
  }

  const parts = cleaned.split(separator);
  const final = parts.at(-1) ?? "";
  if (parts.length === 2 && final.length > 0 && final.length <= 2) return cleaned.replace(separator, ".");

  return parts.join("");
}

