"use client";

import { useActionState, useState } from "react";
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
    votingEnabled: boolean;
    questions: string;
  } | null;
}) {
  const action = meetingId
    ? updateMeetingAction.bind(null, meetingId)
    : createMeetingAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [voting, setVoting] = useState(initial?.votingEnabled ?? false);

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

      <Field label="部會" htmlFor="department" hint="顯示於標題前方括號">
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

      <div className="flex items-center gap-3 rounded-xl border-2 border-foreground bg-tone-bg px-4 py-3">
        <input
          id="voting_enabled"
          name="voting_enabled"
          type="checkbox"
          className="h-5 w-5 accent-[var(--color-primary)]"
          checked={voting}
          onChange={(e) => setVoting(e.target.checked)}
        />
        <label htmlFor="voting_enabled" className="text-sm font-extrabold">
          啟用表決
        </label>
        <span className="text-xs font-medium text-muted-foreground">
          啟用後參與人可進行是／否表決
        </span>
      </div>

      {voting ? (
        <Field
          label="表決題目"
          htmlFor="questions"
          hint="每行一題，為是／否題"
        >
          <Textarea
            id="questions"
            name="questions"
            rows={4}
            placeholder={"同意下學期活動預算案\n延後期中檢討會議時間"}
            defaultValue={initial?.questions}
          />
        </Field>
      ) : null}

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
