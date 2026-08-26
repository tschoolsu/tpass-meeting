// 所有日期時間一律以 Asia/Taipei（UTC+8）呈現與輸入。
const TAIWAN = "Asia/Taipei";

const partsTo = (fmt: Intl.DateTimeFormat, d: Date): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(d)) out[type] = value;
  return out;
};

// 把 datetime-local 的本地值（無時區）視為 UTC+8，轉成真正的 Date。
export function parseTaipeiLocal(value: string): Date {
  return new Date(`${value}:00+08:00`);
}

// Date → datetime-local 的 UTC+8 字串（用於表單回填）。
export function toDatetimeLocal(d: Date): string {
  const p = partsTo(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TAIWAN,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }),
    d,
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// 以 UTC+8 顯示「YYYY 年 M 月 D 日 HH:MM」。
export function formatTaipei(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const p = partsTo(
    new Intl.DateTimeFormat("zh-TW", {
      timeZone: TAIWAN,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }),
    date,
  );
  return `${p.year} 年 ${p.month} 月 ${p.day} 日 ${p.hour}:${p.minute}`;
}

export function isStarted(d: Date | string | null | undefined): boolean {
  if (!d) return false;
  const date = typeof d === "string" ? new Date(d) : d;
  return date.getTime() <= Date.now();
}
