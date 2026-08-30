// 可決門檻的顯示標籤（server-safe，無 "use client" / 無 db）。
export const THRESHOLD_LABEL: Record<string, string> = {
  "1/2+1/2": "出席 1/2＋簡單多數",
  "2/3+1/2": "出席 2/3＋簡單多數",
  "2/3+2/3": "出席 2/3＋同意 2/3",
  "3/4": "同意 3/4",
};

export const thLabel = (v: string) => THRESHOLD_LABEL[v] ?? `門檻 ${v}`;
