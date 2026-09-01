import { redirect } from "next/navigation";

// /my 已併入首頁（學生在 / 本來就只看得到受邀的會議）。留這條只做轉址，舊連結與通知信不斷。
export default function MyMeetingsPage() {
  redirect("/");
}
