"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createMeetingAction, updateMeetingAction, type FormState } from "@/lib/actions";
import { btn, Button, Field, Input, Textarea } from "@/components/ui";

const initialState: FormState = {};

export function MeetingForm({
  departments,
  meetingId,
  initial = null,
}: {
  departments: string[];
  meetingId?: number;
  initial?: {
    title: string;
    department: string;
    startsAt: string;
    participants: string;
    location: string;
    onlineLink: string;
    description: string;
  } | null;
}) {
  const action = meetingId
    ? updateMeetingAction.bind(null, meetingId)
    : createMeetingAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  const allDepartments = initial?.department && !departments.includes(initial.department)
    ? [initial.department, ...departments]
    : departments;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-6 rounded-2xl border-2 border-foreground bg-card p-6 shadow-[4px_4px_0_0_var(--color-foreground)]"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="會議標題" htmlFor="title">
          <Input
            id="title"
            name="title"
            type="text"
            required
            maxLength={200}
            placeholder="例：期末成果報告會議"
            defaultValue={initial?.title}
          />
        </Field>
        <Field label="會議開始時間" htmlFor="starts_at" hint="UTC+8">
          <Input
            id="starts_at"
            name="starts_at"
            type="datetime-local"
            required
            defaultValue={initial?.startsAt}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="部會" htmlFor="department">
          <select
            id="department"
            name="department"
            defaultValue={initial?.department ?? ""}
            className="w-full rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium shadow-[2px_2px_0_0_var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">無</option>
            {allDepartments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
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
      </Field>

      <Field
        label="參與人（Email）"
        htmlFor="participants"
        hint="每行一個，或使用逗號分隔"
      >
        <Textarea
          id="participants"
          name="participants"
          rows={5}
          placeholder={"meeting@tschool.tp.edu.tw\nsecretary@tschool.tp.edu.tw"}
          defaultValue={initial?.participants}
        />
      </Field>

      {state.error ? (
        <p role="alert" className="rounded-xl border-2 border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-bold text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href="/"
          className={`${btn("default")} sm:px-6`}
        >
          取消
        </Link>
        <Button type="submit" variant="primary" disabled={pending} className="sm:px-6">
          {pending ? "儲存中…" : meetingId ? "儲存修改" : "建立會議"}
        </Button>
      </div>
    </form>
  );
}
