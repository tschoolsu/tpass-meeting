"use client";

import { useRouter } from "next/navigation";
import {
  addAgendaItemAction,
  addAttachmentAction,
  addMotionAction,
  deleteAgendaItemAction,
  deleteAttachmentAction,
  deleteMotionAction,
  moveAgendaItemAction,
} from "@/lib/actions";
import { Button, Card, Field, Input, Textarea, Tag } from "@/components/ui";

const THRESHOLD_LABEL: Record<string, string> = {
  "1/2+1/2": "出席 1/2＋簡單多數",
  "2/3+1/2": "出席 2/3＋簡單多數",
  "2/3+2/3": "出席 2/3＋同意 2/3",
  "3/4": "同意 3/4",
};

export const thLabel = (v: string) => THRESHOLD_LABEL[v] ?? `門檻 ${v}`;

export function AgendaManager({
  meetingId,
  agenda,
}: {
  meetingId: number;
  agenda: {
    id: number;
    title: string;
    description: string;
    motions: { id: number; title: string; threshold: string; status: string }[];
    attachments: { id: number; filename: string }[];
  }[];
}) {
  const router = useRouter();

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold">議程與議案</h2>
      </div>

      {/* 新增議程 */}
      <form
        action={async (fd) => {
          await addAgendaItemAction(meetingId, fd);
          router.refresh();
        }}
        className="space-y-3 rounded-xl border-2 border-dashed border-foreground/40 p-4"
      >
        <p className="text-sm font-extrabold">＋ 新增議程</p>
        <Field label="議程標題" htmlFor={`ai-title${meetingId}`}>
          <Input id={`ai-title${meetingId}`} name="title" required maxLength={200} placeholder="例：會務報告" />
        </Field>
        <Field label="會議說明（支援長文）" htmlFor={`ai-desc${meetingId}`}>
          <Textarea id={`ai-desc${meetingId}`} name="description" rows={3} />
        </Field>
        <Button type="submit" variant="primary">
          新增議程
        </Button>
      </form>

      {agenda.map((item, i) => (
        <div key={item.id} className="rounded-xl border-2 border-foreground bg-card">
          <div className="flex items-center justify-between gap-3 border-b-2 border-dashed border-foreground/20 px-4 py-3">
            <p className="min-w-0 flex-1 truncate text-sm font-extrabold">{item.title}</p>
            <form
              action={async () => {
                await moveAgendaItemAction(item.id, "up", meetingId);
                router.refresh();
              }}
            >
              <Button type="submit" variant="tone" size="sm" disabled={i === 0}>
                ↑ 上移
              </Button>
            </form>
            <form
              action={async () => {
                await moveAgendaItemAction(item.id, "down", meetingId);
                router.refresh();
              }}
            >
              <Button type="submit" variant="tone" size="sm" disabled={i === agenda.length - 1}>
                ↓ 下移
              </Button>
            </form>
            <form
              action={async () => {
                await deleteAgendaItemAction(item.id, meetingId);
                router.refresh();
              }}
            >
              <Button type="submit" variant="destructive" size="sm">
                刪除
              </Button>
            </form>
          </div>

          <div className="space-y-4 px-4 py-4">
            {item.description ? (
              <p className="whitespace-pre-wrap text-sm font-medium text-muted-foreground">{item.description}</p>
            ) : null}

            {/* 既有表決案 */}
            <div className="space-y-2">
              {item.motions.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-lg border-2 border-foreground bg-tone-bg px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{m.title}</p>
                    <p className="text-[11px] font-bold text-muted-foreground">
                      {thLabel(m.threshold)} ·{" "}
                      {m.status === "open" ? "表決中" : m.status === "closed" ? "已結算" : "未開放"}
                    </p>
                  </div>
                  <form
                    action={async () => {
                      await deleteMotionAction(m.id, meetingId);
                      router.refresh();
                    }}
                  >
                    <Button
                      type="submit"
                      variant="destructive"
                      size="sm"
                      disabled={m.status === "open" || m.status === "closed"}
                    >
                      刪除
                    </Button>
                  </form>
                </div>
              ))}
            </div>

            {/* 新增表決案 */}
            <form
              action={async (fd) => {
                await addMotionAction(item.id, meetingId, fd);
                router.refresh();
              }}
              className="flex flex-wrap items-end gap-2 rounded-lg border-2 border-dashed border-foreground/30 p-3"
            >
              <div className="min-w-40 flex-1">
                <Input name="title" placeholder="表決案標題" required maxLength={500} />
              </div>
              <select
                name="threshold"
                className="rounded-xl border-2 border-foreground bg-card px-2 py-2 text-xs font-bold"
                defaultValue="1/2+1/2"
              >
                {Object.entries(THRESHOLD_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="primary" size="sm">
                ＋ 表決案
              </Button>
            </form>

            {/* 附件 */}
            <div className="space-y-2">
              {item.attachments.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {item.attachments.map((a) => (
                    <li key={a.id} className="flex items-center gap-1">
                      <Tag className="bg-secondary">{a.filename}</Tag>
                      <form
                        action={async () => {
                          await deleteAttachmentAction(a.id, meetingId);
                          router.refresh();
                        }}
                      >
                        <Button type="submit" variant="destructive" size="sm">
                          刪除
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : null}
              <form
                action={async (fd) => {
                  await addAttachmentAction(item.id, meetingId, fd);
                  router.refresh();
                }}
                className="flex flex-wrap items-end gap-2"
              >
                <Input type="file" name="file" accept="*/*" />
                <Button type="submit" variant="tone" size="sm">
                  上傳附件
                </Button>
              </form>
            </div>
          </div>
        </div>
      ))}

      {agenda.length === 0 ? (
        <p className="text-sm font-medium text-muted-foreground">
          尚未建立任何議程，請在上方新增。
        </p>
      ) : null}
    </Card>
  );
}
