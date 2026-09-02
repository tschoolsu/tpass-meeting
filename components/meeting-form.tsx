"use client";

// 會議基本資料表單（建立 / 編輯共用）。只有標題、時間、部會、地點、連結、說明——
// 名單不在這裡，唯一入口是工作台 ②。編輯模式由工作台 ① 內嵌，存檔後用 onSaved 收合。
import { useActionState, useEffect } from "react";
import { Button, Card, Input, Select, Textarea } from "tpass-ui";
import { createMeetingAction, updateMeetingAction, type MeetingFormState } from "@/lib/actions";
import { LinkButton } from "@/components/link-button";
import { Field } from "@/components/field";

const initialState: MeetingFormState = {};

export interface MeetingFormInitial {
  title: string;
  department: string;
  startsAt: string;
  location: string;
  onlineLink: string;
  description: string;
}

export function MeetingForm({
  departments,
  meetingId,
  initial = null,
  onSaved,
  onCancel,
}: {
  departments: string[];
  meetingId?: number;
  initial?: MeetingFormInitial | null;
  /** 編輯模式：存檔成功後呼叫（工作台用來收合回檢視）。 */
  onSaved?: () => void;
  /** 編輯模式：取消時呼叫；沒給就連回首頁（建立模式）。 */
  onCancel?: () => void;
}) {
  const action = meetingId ? updateMeetingAction.bind(null, meetingId) : createMeetingAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.saved) onSaved?.();
  }, [state, onSaved]);

  const allDepartments =
    initial?.department && !departments.includes(initial.department) ? [initial.department, ...departments] : departments;

  const body = (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="會議標題" htmlFor="title">
          <Input id="title" name="title" type="text" required maxLength={200} placeholder="例：期末成果報告會議" defaultValue={initial?.title} />
        </Field>
        <Field label="會議開始時間" htmlFor="starts_at" hint="UTC+8">
          <Input id="starts_at" name="starts_at" type="datetime-local" required defaultValue={initial?.startsAt} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="部會" htmlFor="department">
          <Select id="department" name="department" defaultValue={initial?.department ?? ""}>
            <option value="">無</option>
            {allDepartments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="地點" htmlFor="location">
          <Input id="location" name="location" placeholder="例：後棟 3F 會議室" defaultValue={initial?.location} maxLength={200} />
        </Field>
      </div>

      <Field label="線上連結" htmlFor="online_link" hint="選填">
        <Input id="online_link" name="online_link" type="url" placeholder="https://..." defaultValue={initial?.onlineLink} maxLength={1000} />
      </Field>

      <Field label="會議說明" htmlFor="description" hint="支援長文，選填">
        <Textarea id="description" name="description" rows={4} placeholder="會議目的、與會須知…" defaultValue={initial?.description} />
        <p className="mt-1.5 font-mono text-[11px] font-bold text-muted-foreground">
          支援 Markdown：**粗體** *斜體* ~~刪除線~~ `程式碼` [連結文字](https://網址)，`---` 是分隔線。不支援 # 標題。
        </p>
      </Field>

      {state.error ? (
        <p role="alert" className="rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" onClick={onCancel} className="sm:px-6">
            取消
          </Button>
        ) : (
          <LinkButton href="/" className="sm:px-6">
            取消
          </LinkButton>
        )}
        <Button type="submit" variant="primary" disabled={pending} className="sm:px-6">
          {pending ? "儲存中…" : meetingId ? "儲存修改" : "建立會議"}
        </Button>
      </div>
    </form>
  );

  // 建立模式自己包一張卡；編輯模式已經在工作台的面板裡，不再多一層。
  return meetingId ? body : <Card>{body}</Card>;
}
