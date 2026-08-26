import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

/* 依 des.md 的 neobrutalism 樣式：所有互動元素都要 border-2 + hard shadow。 */

type Variant = "default" | "primary" | "accent" | "destructive" | "tone";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground px-4 py-2.5 font-bold " +
  "shadow-[3px_3px_0_0_var(--color-foreground)] transition-all duration-200 " +
  "hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)] " +
  "active:translate-y-0 active:shadow-[2px_2px_0_0_var(--color-foreground)] " +
  "disabled:pointer-events-none disabled:opacity-40";

const variants: Record<Variant, string> = {
  default: "bg-card text-foreground",
  primary: "bg-primary text-primary-foreground",
  accent: "bg-accent text-background",
  destructive: "bg-destructive text-background",
  tone: "bg-tone-badge text-foreground",
};

export function btn(variant: Variant = "default", extra = ""): string {
  return `${base} ${variants[variant]} ${extra}`.trim();
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export function Button({ variant = "default", className = "", ...props }: BtnProps) {
  return <button className={`${btn(variant)} ${className}`} {...props} />;
}

type BtnLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: Variant;
};

export function BtnLink({ href, variant = "default", className = "", children, ...props }: BtnLinkProps) {
  return (
    <Link href={href} className={`${btn(variant)} ${className}`} {...props}>
      {children}
    </Link>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_0_var(--color-foreground)] ${className}`}>
      {children}
    </div>
  );
}

export function Tag({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`rounded-md border-2 border-foreground bg-card px-2 py-0.5 font-mono text-[11px] font-bold text-foreground ${className}`}>
      {children}
    </span>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-extrabold">{label}</span>
        {hint ? <span className="text-xs font-medium text-muted-foreground">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium " +
  "placeholder:text-muted-foreground shadow-[2px_2px_0_0_var(--color-foreground)] " +
  "focus:outline-none focus:ring-2 focus:ring-ring focus:shadow-[3px_3px_0_0_var(--color-foreground)]";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputCls} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputCls} min-h-24 resize-y ${className}`} {...props} />;
}

// 檔案輸入：把瀏覽器預設的「選擇檔案」鈕也加上 border + shadow，看起來才找得到。
export function FileInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="file"
      className={`${inputCls} cursor-pointer file:mr-3 file:cursor-pointer file:rounded-lg file:border-2 file:border-foreground file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-foreground file:shadow-[2px_2px_0_0_var(--color-foreground)] file:transition-colors file:hover:bg-muted ${className}`}
      {...props}
    />
  );
}

export function PageHeader({ title, desc, right }: { title: ReactNode; desc?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {desc ? <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{desc}</p> : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function EmptyState({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-lg font-extrabold">{title}</p>
      {desc ? <p className="max-w-md text-sm text-muted-foreground">{desc}</p> : null}
      {action}
    </Card>
  );
}
