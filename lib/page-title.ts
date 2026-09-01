// 各頁的 <title>：「頁面主題 · 會議名」。管理者常同時開投放、主席控制台、簽到台好幾個分頁，
// 全部叫 T-Pass Meeting 分不出來。搭配 app/layout.tsx 的 title.template 後綴。
import "server-only";
import type { Metadata } from "next";
import { getMeeting } from "@/lib/meetings";
import { getMotion } from "@/lib/agenda";

type RawId = string | string[] | undefined;

function parseId(raw: RawId): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return s && /^\d{1,9}$/.test(s) ? Number(s) : null;
}

export async function meetingMetadata(label: string, raw: RawId): Promise<Metadata> {
  const id = parseId(raw);
  const meeting = id ? await getMeeting(id) : null;
  return { title: meeting ? `${label} · ${meeting.title}` : label };
}

export async function motionMetadata(label: string, raw: RawId): Promise<Metadata> {
  const id = parseId(raw);
  const motion = id ? await getMotion(id) : null;
  return { title: motion ? `${label} · ${motion.title}` : label };
}
