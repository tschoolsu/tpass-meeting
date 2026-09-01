// 顯示用的人名：有名字用名字，沒有（還沒登入回填）退回 email。
// 純函式、無 db、無 "use client"，server / client / 測試都能 import。
export function displayName(p: { name?: string | null; email: string }): string {
  const name = (p.name ?? "").trim();
  return name || p.email;
}
