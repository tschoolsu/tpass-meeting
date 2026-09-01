"use client";

// 工作台 ③：議程與表決案的唯一編輯入口。每項議程可就地編輯／上下移／刪除，
// 底下掛表決案（可編輯門檻，表決開始後鎖住）與附件。刪除一律二次確認並講清楚後果。
// 閱讀版在 /read，這裡不重複渲染唯讀清單。
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Select, Textarea } from "tpass-ui";
import type { AgendaItemFull } from "@/lib/meetings";
import {
  addAgendaItemAction,
  addAttachmentAction,
  addMotionAction,
  deleteAgendaItemAction,
  deleteAttachmentAction,
  deleteMotionAction,
  moveAgendaItemAction,
  updateAgendaItemAction,
  updateMotionAction,
  type FormState,
} from "@/lib/actions";
import { RESULT_LABEL, THRESHOLD_LABEL, thLabel } from "@/lib/threshold";
import { motionLabel } from "@/lib/meeting-status";
import { Field } from "@/components/field";
import { FileInput } from "@/components/file-input";
import { ConfirmActionButton } from "@/components/confirm-action-button";

// 表單送出 → 跑 action → 成功就 refresh、失敗就把錯誤交給呼叫端。
function useSubmit(run: (fd: FormData) => Promise<FormState>, onOk?: () => void) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const form = e.currentTarget;
    const res = await run(new FormData(form));
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    form.reset();
    onOk?.();
    router.refresh();
  }
  return { onSubmit, error, busy };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="font-mono text-xs font-bold text-destructive">
      {error}
    </p>
  ) : null;
}

export function AgendaPanel({ meetingId, agenda }: { meetingId: number; agenda: AgendaItemFull[] }) {
  return (
    <div className="flex flex-col gap-4">
      {agenda.map((item, i) => (
        <AgendaCard key={item.id} meetingId={meetingId} item={item} index={i} total={agenda.length} />
      ))}
      {agenda.length === 0 ? <p className="text-sm font-medium text-muted-foreground">尚未建立任何議程，先在下方新增第一項。</p> : null}
      <AddAgendaForm meetingId={meetingId} />
    </div>
  );
}

function AddAgendaForm({ meetingId }: { meetingId: number }) {
  const { onSubmit, error, busy } = useSubmit((fd) => addAgendaItemAction(meetingId, fd));
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border-2 border-dashed border-foreground/40 p-4">
      <p className="text-sm font-extrabold">＋ 新增議程</p>
      <Field label="議程標題" htmlFor={`ai-title-${meetingId}`}>
        <Input id={`ai-title-${meetingId}`} name="title" required maxLength={200} placeholder="例：會務報告" />
      </Field>
      <Field label="說明" htmlFor={`ai-desc-${meetingId}`} hint="選填，支援長文">
        <Textarea id={`ai-desc-${meetingId}`} name="description" rows={3} />
      </Field>
      <ErrorLine error={error} />
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? "新增中…" : "新增議程"}
      </Button>
    </form>
  );
}

function AgendaCard({ meetingId, item, index, total }: { meetingId: number; item: AgendaItemFull; index: number; total: number }) {
  const [editing, setEditing] = useState(false);
  const edit = useSubmit((fd) => updateAgendaItemAction(item.id, meetingId, fd), () => setEditing(false));

  return (
    <div className="rounded-xl border-2 border-foreground bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-dashed border-foreground/20 px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-sm font-extrabold">
          <span className="mr-1.5 font-mono text-muted-foreground">#{index + 1}</span>
          {item.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <ConfirmActionButton size="sm" label="↑" disabled={index === 0} action={() => moveAgendaItemAction(item.id, "up", meetingId)} aria-label="上移" />
          <ConfirmActionButton size="sm" label="↓" disabled={index === total - 1} action={() => moveAgendaItemAction(item.id, "down", meetingId)} aria-label="下移" />
          <Button type="button" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? "取消" : "編輯"}
          </Button>
          <ConfirmActionButton
            size="sm"
            variant="destructive"
            label="刪除"
            action={() => deleteAgendaItemAction(item.id, meetingId)}
            confirm={{
              title: `確定要刪除議程「${item.title}」嗎？`,
              description: "底下的表決案、票數與附件會一併刪除，無法復原。",
              confirmLabel: "刪除議程",
            }}
          />
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {editing ? (
          <form onSubmit={edit.onSubmit} className="space-y-3 rounded-lg border-2 border-dashed border-foreground/30 p-3">
            <Field label="議程標題" htmlFor={`ai-edit-title-${item.id}`}>
              <Input id={`ai-edit-title-${item.id}`} name="title" required maxLength={200} defaultValue={item.title} />
            </Field>
            <Field label="說明" htmlFor={`ai-edit-desc-${item.id}`}>
              <Textarea id={`ai-edit-desc-${item.id}`} name="description" rows={3} defaultValue={item.description} />
            </Field>
            <ErrorLine error={edit.error} />
            <Button type="submit" variant="primary" size="sm" disabled={edit.busy}>
              {edit.busy ? "儲存中…" : "儲存"}
            </Button>
          </form>
        ) : item.description ? (
          <p className="whitespace-pre-wrap text-sm font-medium text-muted-foreground">{item.description}</p>
        ) : null}

        <div className="space-y-2">
          {item.motions.map((m) => (
            <MotionRow key={m.id} meetingId={meetingId} motion={m} />
          ))}
          <AddMotionForm meetingId={meetingId} agendaId={item.id} />
        </div>

        <Attachments meetingId={meetingId} item={item} />
      </div>
    </div>
  );
}

function MotionRow({ meetingId, motion }: { meetingId: number; motion: AgendaItemFull["motions"][number] }) {
  const [editing, setEditing] = useState(false);
  const locked = motion.status !== "";
  const edit = useSubmit((fd) => updateMotionAction(motion.id, meetingId, fd), () => setEditing(false));

  if (editing) {
    return (
      <form onSubmit={edit.onSubmit} className="flex flex-wrap items-end gap-2 rounded-lg border-2 border-dashed border-foreground/30 p-3">
        <div className="min-w-40 flex-1">
          <Input name="title" required maxLength={500} defaultValue={motion.title} aria-label="表決案標題" />
        </div>
        <div className="w-48">
          <Select name="threshold" defaultValue={motion.threshold} className="text-xs font-bold" aria-label="門檻">
            {Object.entries(THRESHOLD_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <input type="hidden" name="description" value={motion.description} />
        <Button type="submit" variant="primary" size="sm" disabled={edit.busy}>
          儲存
        </Button>
        <Button type="button" size="sm" onClick={() => setEditing(false)}>
          取消
        </Button>
        <div className="basis-full">
          <ErrorLine error={edit.error} />
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-foreground bg-tone-green-bg px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{motion.title}</p>
        <p className="font-mono text-[11px] font-bold text-muted-foreground">
          {thLabel(motion.threshold)} · {motionLabel(motion.status)}
          {locked ? ` · 同意 ${motion.agree}／不同意 ${motion.against}` : ""}
          {motion.status === "closed" && motion.result ? ` · ${RESULT_LABEL[motion.result]}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {locked ? <Badge className="bg-secondary">已鎖定</Badge> : null}
        <Button type="button" size="sm" disabled={locked} onClick={() => setEditing(true)}>
          編輯
        </Button>
        <ConfirmActionButton
          size="sm"
          variant="destructive"
          label="刪除"
          disabled={locked}
          action={() => deleteMotionAction(motion.id, meetingId)}
          confirm={{ title: `確定要刪除表決案「${motion.title}」嗎？`, description: "尚未開始表決，刪除後無法復原。", confirmLabel: "刪除" }}
        />
      </div>
    </div>
  );
}

function AddMotionForm({ meetingId, agendaId }: { meetingId: number; agendaId: number }) {
  const { onSubmit, error, busy } = useSubmit((fd) => addMotionAction(agendaId, meetingId, fd));
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 rounded-lg border-2 border-dashed border-foreground/30 p-3">
      <div className="min-w-40 flex-1">
        <Input name="title" placeholder="＋ 表決案標題" required maxLength={500} aria-label="表決案標題" />
      </div>
      <div className="w-48">
        <Select name="threshold" defaultValue="1/2+1/2" className="text-xs font-bold" aria-label="門檻">
          {Object.entries(THRESHOLD_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="primary" size="sm" disabled={busy}>
        {busy ? "新增中…" : "新增表決案"}
      </Button>
      <div className="basis-full">
        <ErrorLine error={error} />
      </div>
    </form>
  );
}

function Attachments({ meetingId, item }: { meetingId: number; item: AgendaItemFull }) {
  const upload = useSubmit((fd) => addAttachmentAction(item.id, meetingId, fd));
  return (
    <div className="space-y-2">
      {item.attachments.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {item.attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-1">
              <a
                href={`/api/agenda/attachments/${a.id}`}
                download
                className="inline-flex items-center gap-1 rounded-md border-2 border-foreground bg-secondary px-2 py-0.5 font-mono text-[11px] font-bold text-foreground shadow-[2px_2px_0_0_var(--color-foreground)] hover:bg-muted"
              >
                ⬇ {a.filename}
              </a>
              <ConfirmActionButton
                size="sm"
                variant="ghost"
                label="刪除"
                action={() => deleteAttachmentAction(a.id, meetingId)}
                confirm={{ title: `確定要刪除附件「${a.filename}」嗎？`, description: "檔案會從主機移除，無法復原。", confirmLabel: "刪除附件" }}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={upload.onSubmit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <FileInput name="file" accept="*/*" required aria-label="附件" />
        </div>
        <Button type="submit" size="sm" disabled={upload.busy}>
          {upload.busy ? "上傳中…" : "上傳附件"}
        </Button>
        <div className="basis-full">
          <ErrorLine error={upload.error} />
        </div>
      </form>
    </div>
  );
}
