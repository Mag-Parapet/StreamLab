export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
export function bytes(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  const power = Math.min(3, Math.floor(Math.log(value) / Math.log(1024)) - 1);
  return `${(value / 1024 ** (power + 1)).toFixed(1)} ${units[power]}`;
}
export function percent(
  used: number | null | undefined,
  total: number | null | undefined,
): number {
  return used != null && total != null && total > 0
    ? Math.min(100, Math.max(0, (used / total) * 100))
    : 0;
}
