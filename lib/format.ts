/** Small display helpers shared by server and client components. Dates use UTC so both render the same. */

export function monthYear(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function longDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "Daily Ledger, March 2024" */
export function reportCredit(report: { publisher: string; publishedAt: string | null }): string {
  const when = monthYear(report.publishedAt);
  return when ? `${report.publisher}, ${when}` : report.publisher;
}
