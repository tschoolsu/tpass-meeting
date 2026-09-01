# T-Meeting 交接：2026-09-01 UX 精簡

> 這份是「為什麼長這樣」的紀錄。git log 只有 what，決策與取捨寫在這裡；引用的外部計畫檔會爛，重點都抄進正文。

## 問題

部長 2026-09-01 直覺「太複雜、難操作」。盤點後的診斷不是「按鈕太多」，是三件事疊在一起：

1. **沒有主流程**：會議 `status`（draft/published/live/closed）唯一的寫入 action 沒有任何 UI 呼叫，每場會議永遠是「草稿」，`published` 才觸發的 Email 通知從沒寄出過。沒有「現在在哪一步」，功能只能平鋪在同一頁。
2. **閱讀與管理混頁**：`/read` 同時是學生的會議頁、建立者的編輯器、主席的準備區——十顆以上按鈕、同一份議程渲染兩次、統計卡與分享列學生也看得到。
3. **同一件事多個入口**：參與人在 `/create`（每行 email）與 `/read`（`email,年級` + CSV）兩處兩格式；`/chair` 再列一次議程；`/my` 與首頁對學生相同。

另外順手抓到：`updateMeeting` 會把「不在表單裡的人」整批 DELETE（編輯一次會議就砍掉已簽到的人）；`staffCheckInAction` 任一 moderator 都能對別人的會議代簽到；角色不夠時 redirect 到 portal（誤點被彈出站外）；四個 action 有實作沒畫面（`setMeetingStatus`／`updateAgendaItem`／`updateMotion`／`addNoteEditor`）。

## 解法（照 t-vote 2026-07 的做法）

純呈現層重構，schema 沒動，只新增一顆 `removeParticipantAction`（沒它貼錯 email 改不回來）。

| 原則 | 落在哪 |
| --- | --- |
| 合併頁面只搬 UI，`actions.ts` 不動，舊路由留 redirect | `/my`→`/`、`/create?id=`→`/manage?id=` |
| 「現在該做什麼」卡：前置檢查 → 後果 → 唯一一顆 primary；沒按鈕就一句指引 | `components/manage/current-stage-card.tsx` |
| 進度列不可點、手風琴才可點；收合仍露一行摘要；phase 變了自動展開 | `stage-progress.tsx`、`workbench-accordion.tsx` |
| 同一個 enum 兩份 label：管理端帶待辦動詞、學生端只講事實 | `lib/meeting-status.ts` `MANAGE_PHASE_META` / `PUBLIC_PHASE_META` |
| 公開頁依狀態只回一顆 CTA | `primaryCtaFor()` |
| confirm 必講可逆性；統一一個 `ConfirmActionButton` | `components/confirm-action-button.tsx` |
| 每個元件檔頭第一行寫職責邊界（「這裡不放 X」） | `components/manage/*` |

## 狀態模型

- DB `status`：`draft` / `published` / `closed`（`live` 只為相容舊資料，程式不會寫入）。
- 畫面 `phase`＝`derivePhase(status, starts_at)`：`closed`→closed；`published|live`→已過開始時間？`live`：`scheduled`；其餘 `draft`。**「進行中」不由人按。**
- 轉移（`canTransition`）：`draft→published`（發布並通知）、`published|live→closed`（結束會議；有表決進行中不准）、`closed→published`（重新開啟，**不寄信**）。同狀態不能再轉一次——`notification_queue` 沒有 unique，這就是防重複寄信的機制。
- 兩道閘門是 AND：簽到／表決要「已過開始時間」；表決還要「主席開放該案」；`closed` 一律擋。**`published` 不當閘門**——最糟的失敗是「開會了才發現忘了按發布，全場不能簽到」。

## 資訊架構

| 頁 | 職責 | 學生 | 建立者／admin |
| --- | --- | --- | --- |
| `/` | 列表 | 受邀的 | 全部 + 建立會議 |
| `/create` | 只填基本資料 → 進工作台 | （開關） | ✓ |
| `/read?id` | 純閱讀 + 一顆 CTA | 簽到／表決／等待 | 管理這場會議 |
| `/manage?id` | 工作台 | 403 | 進度列 + 現在該做什麼 + ①②③④ |
| `/chair?id` | 開會即時操作 | 403 | 設現行議程、開／停表決 |
| `/checkin?id` | 現場簽到 | 大圓鈕 | + 代簽到面板（協作者也有） |
| `/vote`、`/ballots`、`/display`、`/report` | 不變 | | |
| `/forbidden` | 站內 403 | | |

刻意的取捨：代簽到面板留在 `/checkin` 不搬進工作台（門口手機用的現場工具，工作人員未必是建立者）；學生的出席名單保留但收合（與具名投票的透明精神一致）。

## 手動測試劇本（`pnpm dev` → https://meeting.lvh.me:3009；Google 登入要真人）

A＝建立者（moderator）、B＝受邀學生（default）、C＝另一個 moderator（非建立者）。

**A**
1. `/` →「＋ 建立會議」→ 只填標題／時間（設 2 分鐘後）／部會 → 落在 `/manage?id=N`：進度列停「草稿」，卡片 ✗ 參與人 0 人、「發布並通知」disabled、指引指向 ②。
2. ② 貼 `B的email,高一` → 帶入 → ✓ 參與人 1 人，按鈕 enable。
3. ③ 新增議程 → 新增表決案（門檻 2/3+1/2）→ 就地編輯標題 → 刪附件要二次確認。
4. ① 編輯地點存檔 → 回檢視，**② 名單仍在**（這條最重要）。
5. 「發布並通知」→ confirm 含「無法收回」→「已發布」，卡片無按鈕、顯示已通知 1 人（沒 SMTP 則寫不寄信）。
6. 過開始時間重整 → 「進行中」，primary 變「主席控制台」，「結束會議」在下方。
7. `/chair` → 頂部只有回工作台／投放／簽到台／複製投放連結；開表決。
8. 回 `/manage` → 「結束會議」disabled 並提示；回 `/chair` 停止 → enable → 按下 → 「已結束」；`/checkin` 與 `/vote` 回「會議已結束」。
9. ① 「重新開啟」→ 回「進行中」，DB `notification_queue` 沒有新列。

**B**
1. `/` 只見受邀會議，header 沒有「我的會議」。
2. `/read?id=N` 無統計卡、無分享列、無管理工具；唯一 CTA 隨狀態變。
3. 簽到 → 回 `/read` →「你已完成簽到」+「等待主席開放表決」。
4. 主席開表決 → 彈窗 → 投票 → 無 CTA、有「投票紀錄」。
5. 直打 `/manage?id=N`、`/chair?id=N` → 站內 403。

**C**
1. 授權前開 `/read?id=N` 看不到 NoteBar、`/checkin` 看不到代簽到面板；A 在 ④ 授權 C 後兩者都出現。
2. C 開 `/manage?id=N` → 403。

## 2026-09-01 晚間：實測回饋修正（8 點）

部長實測後回報，全部做完（8 顆 commit，`590873a`…）。要點：

- **漏通知的根因**是三件事疊加：`startVote` 把同議程未開放的案也打成 closed（第二案永遠開不了）、彈窗只掛在 `/read`、彈窗 mount 時把當下 open 的案標成「看過」。現在彈窗條件完全由快照推導（open ＋ 我已簽到 ＋ 我未投），`MeetingLive` 掛在所有會議頁。
- SSE 改成單一 `CHANGED` 訊號 → client 重抓快照；刪掉局部合併。快照多了 `me`（受邀／簽到／投過哪些案）與結算欄位。
- 通過判定規則見 README；`motions` 多 `opened_at/closed_at/present_count/expected_count/result`，舊的 closed 案沒快照時用即時出席數推算。
- **未簽到不能投票**（門檻分母是已簽到數）。
- `participants.name` / `ballots.voter_name` / `meeting_editors.name` 登入時回填；UI 用 `displayName`。
- 刪除會議：action 內的 `redirect` 會讓 client promise reject → 之前對話框「按了沒反應」。現在導頁交給 `ConfirmActionButton.navigateTo`，附件檔會清，首頁卡片有刪除。
- `hasOpenMotion` 的 SQL 少引號，之前按「結束會議」直接爆例外。
- session email 統一小寫（名單本來就小寫，之前大小寫不同會讓受邀判定全失敗）。

手動劇本補三條：一個議程放兩案 → 開第 1 案停止 → **第 2 案能開**；B 停在 `/ballots` 時 A 開表決 → B 在該頁彈窗；`/display` 用 A 登入右下角有「主席控制 ▲」。

## 已知缺口（這輪不做）

- **既有資料全是 `draft`**：部署後手動跑 `UPDATE meetings SET status='closed' WHERE status='draft' AND starts_at < now() - interval '1 day'`（把過期的舊草稿收掉，不然首頁一堆「籌備中」）。
- **背景分頁收不到通知**：手機鎖屏或切到別的 App 時瀏覽器會斷 SSE、節流 timer，回到頁面前不會彈窗。要做就是 Web Push／`Notification`，這輪沒做。
- **協作者不能撤銷**（工作台 ④ 只能授權）。
- **學生自建會議的開關**（`ALLOW_STUDENT_CREATE`）沒有 UI 測過。
- **棄權**：ballots 只有同意／不同意，未投視同不同意。
