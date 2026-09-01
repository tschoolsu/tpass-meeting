import { requireAdmin } from "@/lib/auth";
import { listApiKeys } from "@/lib/api-keys";
import { bgmInfo } from "@/lib/bgm";
import { countMeetings } from "@/lib/meetings";
import { listDepartments } from "@/lib/departments";
import { PanelClient } from "@/components/panel-client";
import { PageHeader } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";

export const dynamic = "force-dynamic";

export default async function PanelPage() {
  await requireAdmin("/panel");
  const [apiKeys, bgm, meetingCount, departments] = await Promise.all([
    listApiKeys(),
    bgmInfo(),
    countMeetings(),
    listDepartments(),
  ]);

  return (
    <div>
      <PageHeader
        title="管理面板"
        desc="管理部會清單、會議資料的備份、背景音樂與 API 存取權限。"
        right={<LinkButton href="/">← 返回首頁</LinkButton>}
      />
      <PanelClient
        hasBgm={bgm !== null}
        bgmSize={bgm?.size ?? null}
        meetingCount={meetingCount}
        apiKeys={apiKeys}
        departments={departments}
      />
    </div>
  );
}
