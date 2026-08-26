"use client";

import { useMemo, useState } from "react";
import type { MeetingListItem } from "@/lib/meetings";
import { MeetingCard } from "@/components/meeting-card";
import { EmptyState } from "@/components/ui";

export function MeetingFilter({
  meetings,
  departments,
  canCreate,
}: {
  meetings: MeetingListItem[];
  departments: string[];
  canCreate: boolean;
}) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return meetings.filter((m) => {
      if (department && m.department !== department) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.department.toLowerCase().includes(q) ||
        m.owner_name.toLowerCase().includes(q)
      );
    });
  }, [meetings, query, department]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋會議標題、部會或建立者…"
          aria-label="搜尋會議"
          className="w-full rounded-xl border-2 border-foreground bg-card px-4 py-2.5 text-sm font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:flex-1"
        />
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          aria-label="依部會篩選"
          className="w-full rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring sm:w-52"
        >
          <option value="">全部部會</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={query || department ? "沒有符合條件的會議" : "還沒有會議"}
          desc={
            query || department
              ? "試試調整搜尋關鍵字或部會篩選條件。"
              : canCreate
                ? "點選右上方的「創建會議記錄」來建立第一份會議。"
                : "尚無會議記錄，請等待建立者新增。"
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <MeetingCard key={m.id} meeting={m} />
          ))}
        </div>
      )}
    </div>
  );
}
