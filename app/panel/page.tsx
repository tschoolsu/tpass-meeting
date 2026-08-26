import { requireAdmin } from "@/lib/auth";
import { listApiKeys } from "@/lib/api-keys";
import { bgmInfo } from "@/lib/bgm";
import { countMeetings } from "@/lib/meetings";
import { PanelClient } from "@/components/panel-client";
import { BtnLink, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PanelPage() {
  await requireAdmin("/panel");
  const [apiKeys, bgm, meetingCount] = await Promise.all([
    listApiKeys(),
    bgmInfo(),
    countMeetings(),
  ]);

  return (
    <div>
      <PageHeader
        title="管理面板"
        desc="管理會議資料的備份、背景音樂與 API 存取權限。"
        right={<BtnLink href="/">← 返回首頁</BtnLink>}
      />
      <PanelClient
        hasBgm={bgm !== null}
        bgmSize={bgm?.size ?? null}
        meetingCount={meetingCount}
        apiKeys={apiKeys}
      />
    </div>
  );
}
