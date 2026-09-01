import { redirect } from "next/navigation";
import { requireAccess } from "@/lib/auth";
import { canStudentCreate } from "@/lib/permissions";
import { listDepartments } from "@/lib/departments";
import { MeetingForm } from "@/components/meeting-form";
import { PageHeader } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";

export const dynamic = "force-dynamic";

// /create 只填基本資料，建好直接進工作台。舊的 /create?id= 編輯模式已併入工作台 ①，
// 這裡只做轉址，舊連結不斷。
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  if (rawId && /^\d{1,9}$/.test(rawId)) redirect(`/manage?id=${rawId}`);

  const session = await requireAccess("/create");
  if (!canStudentCreate(session)) redirect("/");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="建立會議"
        desc="先填基本資料就好。建好後會進入工作台，名單與議程在那裡加。"
        right={<LinkButton href="/">← 返回首頁</LinkButton>}
      />
      <MeetingForm departments={await listDepartments()} />
    </div>
  );
}
