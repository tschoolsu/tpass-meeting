import { requireAdmin } from "@/lib/auth";
import { listApiKeys } from "@/lib/api-keys";
import { hasBgm } from "@/lib/bgm";
import { PanelClient } from "@/components/panel-client";
import { BtnLink, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PanelPage() {
  await requireAdmin("/panel");
  const [apiKeys, bgm] = await Promise.all([listApiKeys(), hasBgm()]);

  return (
    <div>
      <PageHeader
        title="管理面板"
        desc="僅限管理員使用：匯出／匯入會議紀錄、會議 BGM 與 API 金鑰管理。"
        right={<BtnLink href="/">← 返回首頁</BtnLink>}
      />
      <PanelClient hasBgm={bgm} apiKeys={apiKeys} />
    </div>
  );
}
