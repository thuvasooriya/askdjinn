// Date helpers. Dates are resolved in Asia/Colombo so the "today" used for
// delivery validation matches the user's calendar regardless of server timezone.
const LK_TIMEZONE = "Asia/Colombo";

function isoInTimeZone(timeZone: string, date = new Date()): string {
  // en-CA formats as the ISO-like YYYY-MM-DD we need.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function todayISO(): string {
  return isoInTimeZone(LK_TIMEZONE);
}
