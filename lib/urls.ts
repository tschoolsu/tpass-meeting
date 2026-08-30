import "server-only";

const selfUrl = (): string => process.env.SERVICE_SELF_URL || "https://meeting.tschoolsu.org";

export function liveUrl(meetingId: number): string {
  return `${selfUrl()}/display?id=${meetingId}`;
}
