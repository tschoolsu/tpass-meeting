// 「誰可以刪這則會議記錄」——純函式，沒有 DB 也沒有 next/cache，所以測得起來。
// （lib/actions.ts 是 "use server" + next/cache，在 node --test 底下 import 不進去。）

export interface NoteOwner {
  author_sub: string | null;
  author_email: string;
}

/**
 * admin 與會議創建者可刪任一則；其餘人只能刪自己寫的那則。
 *
 * author_sub 是後補欄位（見 lib/db.ts 的 ALTER TABLE），舊紀錄是 NULL——
 * 那時就退回 email 比對認作者。雙方 email 都已在寫入前 lowercase（getSession 壓過），
 * 這裡不再重複處理大小寫。
 */
export function canDeleteNote(
  note: NoteOwner,
  meeting: { owner_sub: string },
  session: { sub: string; email: string },
  isAdminUser: boolean,
): boolean {
  if (isAdminUser) return true;
  if (meeting.owner_sub === session.sub) return true;
  if (note.author_sub) return note.author_sub === session.sub;
  return note.author_email === session.email;
}
