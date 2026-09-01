import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/auth";
import { getMeetingDetail } from "@/lib/meetings";
import { getMeetingBallots } from "@/lib/agenda";
import { formatTaipei } from "@/lib/time";
import { motionOutcome, RESULT_LABEL, thLabel } from "@/lib/threshold";
import { derivePhase, MANAGE_PHASE_META, motionLabel } from "@/lib/meeting-status";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  if (!rawId || !/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);

  await requireAccess(`/report?id=${id}`);

  const detail = await getMeetingDetail(id);
  if (!detail) notFound();
  const matrix = await getMeetingBallots(id);

  const { meeting, participants, agenda, notes } = detail;
  const checkedCount = participants.filter((p) => p.checked_in).length;

  // 每個 motion：participantEmail -> 投票狀態（未投 → "未投票"）
  const statusZh: Record<string, string> = { agree: "同意", against: "不同意" };
  const ballotOf = (motionId: number, email: string): string => {
    const s = matrix?.votes[email]?.[String(motionId)];
    return s ? (statusZh[s] ?? s) : "未投票";
  };

  return (
    <div className="report-doc">
      <style>{`
        .report-doc { font-family: -apple-system, "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif; }
        .report-doc h1 { font-size: 24px; margin: 4px 0; }
        .report-doc h2 { font-size: 16px; margin: 28px 0 8px; border-bottom: 2px solid var(--color-foreground); padding-bottom: 4px; }
        .report-doc .meta { color: var(--color-muted-foreground); font-size: 13px; line-height: 1.7; }
        .report-doc .meta b { color: var(--color-foreground); }
        .report-doc table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
        .report-doc th, .report-doc td { border: 1px solid var(--color-input); padding: 5px 8px; text-align: left; vertical-align: top; }
        .report-doc th { background: var(--color-muted); }
        .report-doc .agenda-title { font-weight: 700; margin: 12px 0 4px; }
        .report-doc .agenda-desc { white-space: pre-wrap; color: var(--color-muted-foreground); font-size: 12.5px; margin: 0 0 8px; }
        .report-doc .note { border: 1px solid var(--color-input); border-radius: 6px; padding: 8px 10px; margin-top: 8px; }
        .report-doc .note .who { font-weight: 700; font-size: 12px; }
        .report-doc .note .when { color: var(--color-muted-foreground); font-size: 11px; font-weight: 400; }
        .report-doc .note p { margin: 4px 0 0; white-space: pre-wrap; font-size: 13px; }
        .report-doc .empty { color: var(--color-muted-foreground); font-style: italic; font-size: 12.5px; }
        .report-doc footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid var(--color-input); color: var(--color-muted-foreground); font-size: 11px; }
        @media print {
          .print-hide { display: none !important; }
          .report-doc { padding: 0; }
          .report-doc th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="print-hide mb-4 flex justify-end">
        <PrintButton />
      </div>

      <h1>{meeting.department ? `[${meeting.department}] ` : ""}{meeting.title}</h1>
      <p className="meta">
        <b>時間：</b>{formatTaipei(meeting.starts_at)}（UTC+8）
        <span>　</span><b>狀態：</b>{MANAGE_PHASE_META[derivePhase(meeting.status, meeting.starts_at)].label}
      </p>
      {meeting.location ? <p className="meta"><b>地點：</b>{meeting.location}</p> : null}
      {meeting.online_link ? <p className="meta"><b>線上：</b>{meeting.online_link}</p> : null}
      <p className="meta"><b>建立者：</b>{meeting.owner_name}</p>
      {meeting.description ? <p className="meta" style={{ whiteSpace: "pre-wrap" }}>{meeting.description}</p> : null}

      <h2>出席與簽到</h2>
      <p className="meta"><b>應到：</b>{participants.length} 人　<b>已簽到：</b>{checkedCount} 人</p>
      <table>
        <thead>
          <tr><th style={{ width: "18%" }}>姓名</th><th style={{ width: "26%" }}>信箱</th><th style={{ width: "10%" }}>年級</th><th>狀態</th></tr>
        </thead>
        <tbody>
          {participants.map((p) => (
            <tr key={p.email}>
              <td>{p.name || "—"}</td>
              <td>{p.email}</td>
              <td>{p.grade || "—"}</td>
              <td>{p.checked_in ? "已簽到" : "未簽到"}</td>
            </tr>
          ))}
          {participants.length === 0 ? (
            <tr><td colSpan={4} className="empty">本次無與會者名單。</td></tr>
          ) : null}
        </tbody>
      </table>

      <h2>議程與表決</h2>
      {agenda.length === 0 ? <p className="empty">尚無議程。</p> : null}
      {agenda.map((a) => (
        <div key={a.id}>
          <p className="agenda-title">#{a.position + 1}　{a.title}</p>
          {a.description ? <p className="agenda-desc">{a.description}</p> : null}
          {a.motions.length > 0 ? (
            <div className="space-y-3">
              {a.motions.map((m) => (
                <div key={m.id}>
                  <p className="agenda-title" style={{ margin: "4px 0" }}>
                    · {m.title}
                    <span className="meta">（{thLabel(m.threshold)}；{motionLabel(m.status)}）</span>
                  </p>
                  <p className="meta" style={{ margin: "2px 0 6px" }}>
                    同意 {m.agree} / 不同意 {m.against}
                    {(() => {
                      const o = motionOutcome(m, { present: checkedCount, expected: participants.length });
                      return o && m.status === "closed"
                        ? <>　<b>結果：</b>{RESULT_LABEL[o.result]}（{o.reason}；應到 {o.expected}）</>
                        : null;
                    })()}
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: "18%" }}>姓名</th>
                        <th style={{ width: "26%" }}>信箱</th>
                        <th style={{ width: "10%" }}>年級</th>
                        <th>意見</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participants.map((p) => (
                        <tr key={`${m.id}-${p.email}`}>
                          <td>{p.name || "—"}</td>
                          <td>{p.email}</td>
                          <td>{p.grade || "—"}</td>
                          <td>{ballotOf(m.id, p.email)}</td>
                        </tr>
                      ))}
                      {participants.length === 0 ? (
                        <tr><td colSpan={4} className="empty">無與會者。</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : null}
          {a.attachments.length > 0 ? (
            <p className="meta" style={{ marginTop: "6px" }}>
              <b>附件：</b>{a.attachments.map((x) => x.filename).join("、")}
            </p>
          ) : null}
        </div>
      ))}

      <h2>會議紀錄</h2>
      {notes.length === 0 ? <p className="empty">無會議紀錄。</p> : null}
      {notes.map((n) => (
        <div key={n.id} className="note">
          <div className="who">{n.author_name} <span className="when">· {formatTaipei(n.created_at)}</span></div>
          <p>{n.body}</p>
        </div>
      ))}

      <footer>由 T-Pass Meeting 自動產生 · {formatTaipei(new Date().toISOString())}（UTC+8）</footer>
    </div>
  );
}
