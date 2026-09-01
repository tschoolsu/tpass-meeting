import "server-only";
import { authConfig } from "@/config/auth";

export function liveUrl(meetingId: number): string {
  return `${authConfig.selfUrl}/display?id=${meetingId}`;
}
