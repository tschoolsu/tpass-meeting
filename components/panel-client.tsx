"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import type { ComponentProps, FormEvent, ReactNode } from "react";
import { Badge, Button, Card, ConfirmDialog, Input, Label } from "tpass-ui";
import {
  clearBgmAction,
  createApiKeyAction,
  deleteApiKeyAction,
  importMeetingsAction,
  uploadBgmAction,
} from "@/lib/actions";
import type { ApiKeyRow } from "@/lib/api-keys";
import { FileInput } from "@/components/file-input";
import { LinkButton } from "@/components/link-button";

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
    <Card>
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
          ? "mt-3 rounded-xl border-2 border-foreground bg-tone-green-bg px-4 py-2.5 text-sm font-bold text-tone-green-text"
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
    <Button
      type="button"
      size="sm"
      className="shrink-0"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "✓ 已複製" : "複製"}
    </Button>
  );
}

// 表單送出前先問一次（ConfirmDialog），確認後才真的送。
// 用 ref 記「已確認」，requestSubmit 再次觸發 onSubmit 時直接放行。
function ConfirmedForm({
  ask,
  title,
  description,
  confirmLabel,
  children,
  ...formProps
}: Omit<ComponentProps<"form">, "ref" | "onSubmit" | "title"> & {
  /** false 時不問，直接送。 */
  ask: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const [open, setOpen] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (confirmed.current) {
      confirmed.current = false;
      return;
    }
    if (!ask) return;
    e.preventDefault();
    setOpen(true);
  }

  function onConfirm() {
    setOpen(false);
    confirmed.current = true;
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} onSubmit={onSubmit} {...formProps}>
        {children}
      </form>
      <ConfirmDialog
        open={open}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
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
        <LinkButton href="/api/admin/export" download variant="primary">
          <IconDownload />
          匯出 JSON 檔
        </LinkButton>
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
      <ConfirmedForm
        action={formAction}
        className="flex flex-col gap-3"
        ask={meetingCount > 0}
        title="確定要匯入嗎？"
        description={`這會刪除目前 ${meetingCount} 場會議，並以檔案內容取代。`}
        confirmLabel="匯入並取代"
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
      </ConfirmedForm>
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
  const [clearing, startClear] = useTransition();
  const [cleared, setCleared] = useState(false);
  const [askClear, setAskClear] = useState(false);

  function clear() {
    startClear(async () => {
      await clearBgmAction();
      setCleared(true);
      setAskClear(false);
    });
  }

  return (
    <SectionCard
      icon={<IconMusic />}
      title="會議背景音樂"
      desc="上傳一首 mp3（10 MB 內），參與人點開會議閱讀器就會自動播放，左下角圓形按鈕可隨時靜音。"
    >
      <div className="mb-3 rounded-xl border-2 border-foreground bg-secondary px-4 py-2.5 text-sm font-medium">
        目前狀態：{" "}
        <strong className="font-extrabold">
          {hasBgm && !cleared
            ? `已上傳（${formatBytes(bgmSize ?? 0)}）`
            : "尚未上傳，會議還沒有背景音樂"}
        </strong>
      </div>
      <ConfirmedForm
        action={formAction}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
        ask={hasBgm}
        title="確定要更換背景音樂嗎？"
        description="舊的 mp3 會被覆蓋。"
        confirmLabel="更換"
      >
        <FileInput name="bgm" accept="audio/mpeg,.mp3" className="sm:max-w-sm" />
        <Button type="submit" variant="primary" disabled={pending || clearing}>
          {pending ? "上傳中…" : hasBgm ? "更換音樂" : "上傳音樂"}
        </Button>
        {hasBgm ? (
          <Button type="button" variant="destructive" onClick={() => setAskClear(true)} disabled={pending || clearing}>
            {clearing ? "清除中…" : "清除 BGM"}
          </Button>
        ) : null}
      </ConfirmedForm>
      <ConfirmDialog
        open={askClear}
        title="確定要清除背景音樂嗎？"
        description="清除後會議閱讀器就不再播放 BGM。"
        confirmLabel="清除"
        pending={clearing}
        onConfirm={clear}
        onCancel={() => setAskClear(false)}
      />
      {state.saved ? <Banner tone="ok">BGM 已更新，新的會議閱讀器就會使用它。</Banner> : null}
      {cleared ? <Banner tone="ok">BGM 已清除，會議閱讀器將不再播放背景音樂。</Banner> : null}
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
    </SectionCard>
  );
}

function ApiKeysCard({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ key: string; row: ApiKeyRow } | null>(null);
  const [removing, setRemoving] = useState<ApiKeyRow | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  function remove() {
    const target = removing;
    if (!target) return;
    startTransition(async () => {
      await deleteApiKeyAction(target.id);
      setKeys((prev) => prev.filter((k) => k.id !== target.id));
      setRemoving(null);
    });
  }

  return (
    <SectionCard
      icon={<IconKey />}
      title="API 金鑰"
      desc="供外部程式呼叫 /api/v1/*。建立後只顯示一次，請立刻複製保存。"
    >
      <form
        ref={formRef}
        action={(fd: FormData) => {
          createKey(fd);
          formRef.current?.reset();
        }}
        className="flex flex-col gap-3"
      >
        <div>
          <Label htmlFor="apikey-label" className="mb-1.5">
            金鑰名稱
          </Label>
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
        <div className="mt-4 rounded-xl border-2 border-foreground bg-tone-green-bg p-4">
          <p className="text-sm font-extrabold">金鑰建立成功！請立即複製保存（只顯示這一次）</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all font-mono text-xs font-bold">{created.key}</code>
            <CopyButton text={created.key} />
          </div>
          <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => setCreated(null)}>
            我已保存，關閉提示
          </Button>
        </div>
      ) : null}

      {error ? <Banner tone="error">{error}</Banner> : null}

      <ul className="mt-5 divide-y-2 divide-dashed divide-foreground/15">
        {keys.map((k) => (
          <li key={k.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold">{k.label}</span>
                <Badge className="bg-tone-green-badge">啟用中</Badge>
              </div>
              <div className="mt-0.5 font-mono text-[11px] font-bold text-muted-foreground">
                建立於 {formatTime(k.created_at)}
                {k.last_used_at ? ` · 上次使用 ${formatTime(k.last_used_at)}` : " · 尚未使用"}
              </div>
            </div>
            <Button type="button" variant="destructive" size="sm" onClick={() => setRemoving(k)} disabled={pending}>
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
      <ConfirmDialog
        open={removing !== null}
        title={`確定要刪除「${removing?.label ?? ""}」嗎？`}
        description="刪除後立即失效，無法復原。"
        confirmLabel="刪除"
        pending={pending}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
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
        <div className="rounded-xl border-2 border-foreground bg-tone-green-bg px-4 py-3">
          <div className="font-mono text-xs font-bold text-tone-green-text">會議紀錄</div>
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
