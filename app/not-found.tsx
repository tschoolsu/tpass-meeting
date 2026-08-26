import { BtnLink, Card } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <Card className="w-full max-w-md p-8 text-center shadow-[6px_6px_0_0_var(--color-foreground)]">
        <p className="font-mono text-6xl font-extrabold tracking-tighter text-primary">404</p>
        <h1 className="mt-4 text-2xl font-extrabold">找不到頁面</h1>
        <p className="mt-2 text-sm text-muted-foreground">你要尋找的頁面不存在，或是連結已經失效。</p>
        <BtnLink href="/" variant="primary" className="mt-6">
          ← 返回首頁
        </BtnLink>
      </Card>
    </div>
  );
}
