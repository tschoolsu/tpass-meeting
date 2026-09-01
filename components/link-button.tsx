// tpass-ui 的 Button 是原生 <button>，不支援 asChild／不能包 <Link>（會產生非法 <a> 巢狀 <button>）。
// 這裡照同一套 Neobrutalism 樣式做「長得像按鈕的連結」（與 tpass-vote 的 LinkButton 同模式）。
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "tpass-ui";

type Variant = "primary" | "default" | "accent" | "destructive";
type Size = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground font-bold transition-all duration-200 shadow-[3px_3px_0_0_var(--color-foreground)] hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)] active:translate-y-0 active:shadow-[2px_2px_0_0_var(--color-foreground)]";

const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground",
  accent: "bg-accent text-primary-foreground",
  default: "bg-card text-foreground",
  destructive: "bg-destructive text-primary-foreground",
};

const SIZE: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2",
};

export function LinkButton({
  href,
  variant = "default",
  size = "md",
  download = false,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  /** 下載連結：走原生 <a download>，不經 next/link 的 client navigation。 */
  download?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const cls = cn(BASE, VARIANT[variant], SIZE[size], className);
  if (download) {
    return (
      <a href={href} download className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
