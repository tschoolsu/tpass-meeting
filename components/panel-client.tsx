"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createApiKeyAction,
  importMeetingsAction,
  revokeApiKeyAction,
  uploadBgmAction,
} from "@/lib/actions";
import type { ApiKeyRow } from "@/lib/api-keys";
import { Button, Card, Input } from "@/components/ui";

const init = { error: undefined as string | undefined };

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
      className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_0_var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-foreground)]"
    >
      {copied ? "✓ 已複製" : "複製"}
    </button>
  );
}

function ImportCard() {
  const [state, formAction, pending] = useActionState(importMeetingsAction, init);
  return (
    <Card>
      <h2 className="text-lg font-extrabold">匯入會議紀錄</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        上傳 JSON 檔案，會<strong className="text-destructive">取代目前所有會議紀錄</strong>，且無法復原。
      </p>
      <form action={formAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input type="file" name="file" accept="application/json,.json" className="sm:max-w-sm" />
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "匯入中…" : "匯入並取代"}
        </Button>
      </form>
      {state.count !== undefined ? (
        <p className="mt-3 rounded-xl border-2 border-foreground bg-tone-bg px-4 py-2.5 text-sm font-bold text-tone-text">
          已成功匯入 {state.count} 場會議。
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="mt-3 rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive">
          {state.error}
        </p>
      ) : null}
    </Card>
  );
}

function BgmCard({ hasBgm }: { hasBgm: boolean }) {
  const [state, formAction, pending] = useActionState(uploadBgmAction, init);
  return (
    <Card>
      <h2 className="text-lg font-extrabold">會議 BGM</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        上傳 mp3（限 10 MB 內），點開會議閱讀器會自動播放，左下角圓形按鈕可切換靜音。
      </p>
      <p className="mt-2 font-mono text-xs font-bold">
        目前狀態：{hasBgm ? "已上傳" : "尚未上傳"}
      </p>
      <form action={formAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input type="file" name="bgm" accept="audio/mpeg,.mp3" className="sm:max-w-sm" />
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "上傳中…" : hasBgm ? "更換 BGM" : "上傳 BGM"}
        </Button>
      </form>
      {state.saved ? (
        <p className="mt-3 rounded-xl border-2 border-foreground bg-tone-bg px-4 py-2.5 text-sm font-bold text-tone-text">
          BGM 已更新。
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="mt-3 rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive">
          {state.error}
        </p>
      ) : null}
    </Card>
  );
}

function ApiKeysCard({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const [createState, createAction, creating] = useActionState(createApiKeyAction, init);
  const [keys, setKeys] = useState(initialKeys);
  const [pending, startTransition] = useTransition();

  async function revoke(id: number) {
    if (!window.confirm("確定要撤銷這把 API key 嗎？撤銷後立即失效。")) return;
    startTransition(async () => {
      await revokeApiKeyAction(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    });
  }

  return (
    <Card>
      <h2 className="text-lg font-extrabold">API 金鑰</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        用於呼叫 /api/v1/* 的 API；金鑰只顯示一次，請自行妥善保存。
      </p>

      <form action={createAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input name="label" placeholder="金鑰名稱，例：自動化腳本" className="sm:max-w-xs" />
        <Button type="submit" variant="accent" disabled={creating}>
          {creating ? "建立中…" : "建立金鑰"}
        </Button>
      </form>
      {createState.error ? (
        <p role="alert" className="mt-3 rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive">
          {createState.error}
        </p>
      ) : null}
      {createState.key ? (
        <div className="mt-3 rounded-xl border-2 border-foreground bg-tone-bg px-4 py-3">
          <p className="text-sm font-extrabold">請立即保存這把金鑰（只顯示一次）</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all font-mono text-xs font-bold">{createState.key}</code>
            <CopyButton text={createState.key} />
          </div>
        </div>
      ) : null}

      <ul className="mt-4 divide-y-2 divide-dashed divide-foreground/15">
        {keys.map((k) => (
          <li key={k.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold">{k.label}</span>
                {k.revoked ? (
                  <span className="rounded-md border-2 border-foreground bg-destructive/10 px-2 py-0.5 font-mono text-[10px] font-bold text-destructive">
                    已撤銷
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 font-mono text-[11px] font-bold text-muted-foreground">
                建立於 {formatTime(k.created_at)}
                {k.last_used_at ? ` · 上次使用 ${formatTime(k.last_used_at)}` : " · 尚未使用"}
              </div>
            </div>
            {!k.revoked ? (
              <Button variant="destructive" onClick={() => revoke(k.id)} disabled={pending} className="px-3 py-1.5 text-xs">
                撤銷
              </Button>
            ) : null}
          </li>
        ))}
        {keys.length === 0 ? (
          <li className="py-4 text-center text-sm font-medium text-muted-foreground">尚無 API 金鑰。</li>
        ) : null}
      </ul>
    </Card>
  );
}

export function PanelClient({ hasBgm, apiKeys }: { hasBgm: boolean; apiKeys: ApiKeyRow[] }) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold">匯出會議紀錄</h2>
          <p className="mt-1 text-sm text-muted-foreground">將全部會議（含參與人、表決、票數、紀錄）匯出為 JSON 檔案。</p>
        </div>
        <Button variant="primary">
          <a href="/api/admin/export" download>
            匯出 JSON
          </a>
        </Button>
      </Card>
      <ImportCard />
      <BgmCard hasBgm={hasBgm} />
      <ApiKeysCard initialKeys={apiKeys} />
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
