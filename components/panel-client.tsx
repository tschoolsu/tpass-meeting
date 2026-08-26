"use client";

import { useActionState, useState, useTransition } from "react";
import type { ReactNode } from "react";
import {
  createApiKeyAction,
  deleteApiKeyAction,
  importMeetingsAction,
  uploadBgmAction,
} from "@/lib/actions";
import type { ApiKeyRow } from "@/lib/api-keys";
import { Button, Card, FileInput, Input } from "@/components/ui";

const init = { error: undefined as string | undefined };

/* ---------- 小圖示 ---------- */

function IconDownload() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

function IconMusic() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

/* ---------- 共用區塊 ---------- */

function SectionCard({
  icon,
  title,
  desc,
  children,
}: {
  icon: ReactNode;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-foreground bg-secondary shadow-[2px_2px_0_0_var(--color-foreground)]">
          {icon}
        </span>
        <div>
          <h2 className="text-lg font-extrabold leading-tight">{title}</h2>
          {desc ? <p className="mt-1 text-sm text-muted-foreground">{desc}</p> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function Banner({ tone, children }: { tone: "ok" | "error"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "ok"
          ? "mt-3 rounded-xl border-2 border-foreground bg-tone-bg px-4 py-2.5 text-sm font-bold text-tone-text"
          : "mt-3 rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive"
      }
    >
      {children}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-foreground)]"
    >
      {copied ? "✓ 已複製" : "複製"}
    </button>
  );
}

/* ---------- 各功能 ---------- */

function ExportCard({ meetingCount }: { meetingCount: number }) {
  return (
    <SectionCard
      icon={<IconDownload />}
      title="匯出會議紀錄"
      desc={`把目前 ${meetingCount} 場會議（含參與人、表決、票數與紀錄）打包成一份 JSON 檔，方便備份或轉移。`}
    >
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-muted-foreground">匯出不會刪除任何資料，可放心使用。</p>
        <a
          href="/api/admin/export"
          download
          className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-foreground bg-primary px-4 py-2.5 font-bold text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--color-foreground)] active:translate-y-0 active:shadow-[2px_2px_0_0_var(--color-foreground)]"
        >
          <IconDownload />
          匯出 JSON 檔
        </a>
      </div>
    </SectionCard>
  );
}

function ImportCard({ meetingCount }: { meetingCount: number }) {
  const [state, formAction, pending] = useActionState(importMeetingsAction, init);

  return (
    <SectionCard
      icon={<IconUpload />}
      title="匯入並取代會議紀錄"
      desc="從 JSON 檔還原會議紀錄。這個動作會把現有的紀錄全部取代，建議先匯出備份再操作。"
    >
      <form
        action={formAction}
        onSubmit={(e) => {
          if (
            meetingCount > 0 &&
            !window.confirm(
              `確定要匯入嗎？這會刪除目前 ${meetingCount} 場會議，並以檔案內容取代。`,
            )
          ) {
            e.preventDefault();
          }
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <FileInput name="file" accept="application/json,.json" className="sm:max-w-sm" />
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? "匯入中…" : "開始匯入"}
          </Button>
        </div>
        <p className="text-xs font-medium text-muted-foreground">
          僅接受管理面板匯出的 JSON 檔案（最多 10 MB）。
        </p>
      </form>
      {state.count !== undefined ? (
        <Banner tone="ok">已成功匯入 {state.count} 場會議，並已取代舊紀錄。</Banner>
      ) : null}
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
    </SectionCard>
  );
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function BgmCard({ hasBgm, bgmSize }: { hasBgm: boolean; bgmSize: number | null }) {
  const [state, formAction, pending] = useActionState(uploadBgmAction, init);

  return (
    <SectionCard
      icon={<IconMusic />}
      title="會議背景音樂"
      desc="上傳一首 mp3（10 MB 內），參與人點開會議閱讀器就會自動播放，左下角圓形按鈕可隨時靜音。"
    >
      <div className="mb-3 rounded-xl border-2 border-foreground bg-secondary px-4 py-2.5 text-sm font-medium">
        目前狀態：{" "}
        <strong className="font-extrabold">
          {hasBgm ? `已上傳（${formatBytes(bgmSize ?? 0)}）` : "尚未上傳，會議還沒有背景音樂"}
        </strong>
      </div>
      <form
        action={formAction}
        onSubmit={(e) => {
          if (
            hasBgm &&
            !window.confirm("確定要更換背景音樂嗎？舊的 mp3 會被覆蓋。")
          ) {
            e.preventDefault();
          }
        }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <FileInput name="bgm" accept="audio/mpeg,.mp3" className="sm:max-w-sm" />
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "上傳中…" : hasBgm ? "更換音樂" : "上傳音樂"}
        </Button>
      </form>
      {state.saved ? <Banner tone="ok">BGM 已更新，新的會議閱讀器就會使用它。</Banner> : null}
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
    </SectionCard>
  );
}

function ApiKeysCard({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ key: string; row: ApiKeyRow } | null>(null);

  function createKey(formData: FormData) {
    const label = String(formData.get("label") ?? "").trim();
    if (!label) {
      setError("請輸入金鑰名稱");
      return;
    }
    startTransition(async () => {
      const res = await createApiKeyAction({}, formData);
      if (res.error) {
        setError(res.error);
      } else if (res.key && res.created) {
        const row: ApiKeyRow = { ...res.created, last_used_at: null };
        setCreated({ key: res.key, row });
        setKeys((prev) => [row, ...prev]);
        setError(null);
      }
    });
  }

  async function remove(id: number) {
    if (!window.confirm("確定要刪除這把 API key 嗎？刪除後立即失效，無法復原。")) return;
    startTransition(async () => {
      await deleteApiKeyAction(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    });
  }

  return (
    <SectionCard
      icon={<IconKey />}
      title="API 金鑰"
      desc="供外部程式呼叫 /api/v1/*。建立後只顯示一次，請立刻複製保存。"
    >
      <form
        action={(fd: FormData) => {
          createKey(fd);
          (document.getElementById("apikey-form") as HTMLFormElement | null)?.reset();
        }}
        id="apikey-form"
        className="flex flex-col gap-3"
      >
        <div>
          <label htmlFor="apikey-label" className="mb-1.5 block text-sm font-extrabold">
            金鑰名稱
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              id="apikey-label"
              name="label"
              placeholder="例：自動化腳本、簽到機"
              className="sm:max-w-sm"
            />
            <Button type="submit" variant="accent" disabled={pending} className="shrink-0">
              {pending ? "建立中…" : "建立金鑰"}
            </Button>
          </div>
        </div>
      </form>

      {created ? (
        <div className="mt-4 rounded-xl border-2 border-foreground bg-tone-bg p-4">
          <p className="text-sm font-extrabold">金鑰建立成功！請立即複製保存（只顯示這一次）</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all font-mono text-xs font-bold">{created.key}</code>
            <CopyButton text={created.key} />
          </div>
          <button
            type="button"
            onClick={() => setCreated(null)}
            className="mt-3 text-xs font-bold text-muted-foreground underline-offset-2 hover:underline"
          >
            我已保存，關閉提示
          </button>
        </div>
      ) : null}

      {error ? <Banner tone="error">{error}</Banner> : null}

      <ul className="mt-5 divide-y-2 divide-dashed divide-foreground/15">
        {keys.map((k) => (
          <li key={k.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold">{k.label}</span>
                <span className="rounded-md border-2 border-foreground bg-tone-badge px-2 py-0.5 font-mono text-[10px] font-bold">
                  啟用中
                </span>
              </div>
              <div className="mt-0.5 font-mono text-[11px] font-bold text-muted-foreground">
                建立於 {formatTime(k.created_at)}
                {k.last_used_at ? ` · 上次使用 ${formatTime(k.last_used_at)}` : " · 尚未使用"}
              </div>
            </div>
            <Button variant="destructive" onClick={() => remove(k.id)} disabled={pending} className="px-3 py-1.5 text-xs">
              刪除
            </Button>
          </li>
        ))}
        {keys.length === 0 ? (
          <li className="py-5 text-center text-sm font-medium text-muted-foreground">
            還沒有金鑰，先在上方建立一把來呼叫 API。
          </li>
        ) : null}
      </ul>
    </SectionCard>
  );
}

/* ---------- 主面板 ---------- */

export function PanelClient({
  hasBgm,
  bgmSize,
  meetingCount,
  apiKeys,
}: {
  hasBgm: boolean;
  bgmSize: number | null;
  meetingCount: number;
  apiKeys: ApiKeyRow[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border-2 border-foreground bg-tone-bg px-4 py-3">
          <div className="font-mono text-xs font-bold text-tone-text">會議紀錄</div>
          <div className="mt-1 font-mono text-2xl font-extrabold">{meetingCount} 場</div>
        </div>
        <div className="rounded-xl border-2 border-foreground bg-card px-4 py-3">
          <div className="font-mono text-xs font-bold text-muted-foreground">背景音樂</div>
          <div className="mt-1 font-mono text-2xl font-extrabold">{hasBgm ? "已上傳" : "未上傳"}</div>
        </div>
        <div className="rounded-xl border-2 border-foreground bg-card px-4 py-3">
          <div className="font-mono text-xs font-bold text-muted-foreground">API 金鑰</div>
          <div className="mt-1 font-mono text-2xl font-extrabold">{apiKeys.length} 把</div>
        </div>
      </div>

      <ExportCard meetingCount={meetingCount} />
      <ImportCard meetingCount={meetingCount} />
      <BgmCard hasBgm={hasBgm} bgmSize={bgmSize} />
      <ApiKeysCard initialKeys={apiKeys} />
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
