# T-Pass Meeting 會議輔助

會議輔助系統：會議、議程、表決與簽到。介面用生態系共用的 `tpass-ui`（Neobrutalism，規範在 tpass-portal 的 `docs/design.md`），登入走 `tpass-auth-js`。UX 的設計決策與手動測試劇本見 [`docs/HANDOFF.md`](./docs/HANDOFF.md)。

## 功能

- **首頁 `/`**：管理者／幹部可見全部會議；一般學生只看到自己受邀的會議（`/my` 已併入，只做轉址）。
- **建立 `/create`**：只填基本資料（標題、時間、部會、地點、線上連結、說明），建好直接進工作台。一般學生能否自行建會由開關 `ALLOW_STUDENT_CREATE` 決定（已知缺口：學生建完後所有管理動作仍需 moderator，見 HANDOFF）。
- **會議頁 `/read?id=`**：純閱讀。所有人看同一份內容，差別只在最上面那一顆按鈕：學生依狀態拿到「簽到／表決／等待」其中之一，建立者拿到「管理這場會議」。
- **工作台 `/manage?id=`**（建立者／admin）：進度列 + 「現在該做什麼」卡（草稿→發布並通知→結束會議；沒按鈕的階段給一句指引）+ 四格手風琴：① 基本資料（就地編輯、刪除、重新開啟）② 參與人（唯一入口；貼上 `email[,年級]` 或上傳 CSV，每列可移除）③ 議程與表決案（就地編輯，每案設**可決門檻**：出席 1/2＋簡單多數、2/3＋1/2、2/3＋2/3、3/4；表決開始後鎖住；附件上傳）④ 會議紀錄與協作者（授權他人寫紀錄、代簽到）。
- **會議狀態**：`draft` →（發布並通知）→ `published` →（結束會議）→ `closed`；`closed` 可重新開啟（不再寄信）。畫面上的「進行中」是 `published` 且已過開始時間的推導值，不由人按。
- **主席控制台 `/chair?id=`**：開會時的即時操作——設現行議程、對表決案「開始表決／停止並宣佈結果」（需求：會議主席控制台）。
- **具名表決 `/vote?id=<motionId>`**：只允許會議開始後、且主席開放該表決案時投票；可投**同意／不同意**，送出後不可更改。未開始前畫面鎖定，主席一開放即自動解鎖（需求：實時同步、Anti-Blackbox）。
- **具名投票紀錄 `/ballots?meetingId=`**：完整列出每位應出席學生的投票狀態（同意／不同意／未投票），支援**年級篩選**，全程公開透明並計入會議紀錄匯出（需求 4）。
- **大螢幕投放 `/display?id=`**：適合投影機的大字體即時頁面，顯示當前議程、應到／實到人數、表決即時票數與**通過／不通過／出席不足**（需求 5）。建立者／admin 登入時底部多一條可收合的主席控制列（開放／停止表決、上一案／下一案）。
- **即時機制**：所有會議相關頁面（`/read`、`/manage`、`/chair`、`/checkin`、`/ballots`、`/vote`、`/display`）都掛 `MeetingLive`：**SSE**（`/api/live/meeting/:id/stream`）只送 `CHANGED` 訊號，收到就重抓快照（`/api/live/meeting/:id`，唯一事實來源），另有輪詢兜底（SSE 健康時 30 秒一次保險，SSE 斷線或 60 秒沒 heartbeat 才降到 3 秒）。有 open 且自己（已簽到）還沒投的表決案就彈窗，換頁／重整不會吞掉。
- **通過判定**（停止表決時寫入快照）：「出席 X」＝已簽到／應到 ≥ X，不足即無效；「同意 Y」分母＝已簽到人數（未投視同不同意），簡單多數＝同意 > 出席/2；`3/4` 只看同意/出席。因此**未簽到不能投票**。規則在 `lib/threshold.ts`，有測試。
- **名字**（三層退回）：名單用 email 邀請；① 對方登入簽到／投票後用 JWT 的 `name` 回填 DB → ② 還沒登入的人查主機上 gitignore 的 `name-map.csv`（`mail,name`，路徑可用 `MAIL_NAME_CSV` 改；`lib/name-map.ts`）→ ③ 都沒有才顯示 email。填補在資料層（`getMeetingDetail` / `getMeetingBallots` / `getMotionResults` / `listMeetingEditors`），頁面一律用 `lib/names.ts` 的 `displayName`。
- **簽到 `/checkin?id=`**：圓形簽到按鈕；建立者、admin 與被授權的協作者額外看到**年級篩選**的代簽到面板（需求 1d）。
- **管理面板 `/panel`（僅 admin）**：部會清單、匯出／匯入全部會議紀錄（含議程、議案、具名票）、BGM、API 金鑰。
- **Email 通知**：工作台按「發布並通知」時（只在第一次發布）對所有受邀人寄送通知（含時間、地點、線上連結與會議連結），經背景佇列派送並自動重試（需求 6）。未設定 SMTP 則略過。

## API（需 API key）

API key 於管理面板建立（只顯示一次，DB 只存 SHA-256 雜湊）。

| Method | Endpoint | 說明 |
| --- | --- | --- |
| `POST` | `/api/v1/meetings` | 建立會議（詳見下方） |
| `GET` | `/api/v1/meetings/:id` | 會議資訊（含 `agenda`、議案、參與人、紀錄） |
| `GET` | `/api/v1/meetings/:id/checkins` | 已簽到／未簽到清單 |
| `GET` | `/api/v1/votes/:motionId/results` | 表決結果（motion 的同意／不同意人數與門檻判定） |
| `GET` | `/api/live/meeting/:id` | 大螢幕／投票輪詢用的即時會議狀態（議程、票數） |
| `GET` | `/api/live/meeting/:id/stream` | **SSE**（登入後訂閱）：`CHANGED`（有東西變了，去重抓快照）／`heartbeat`／`connected` |

> **部署注意（SSE／nginx）**：此 SSE 端點必須關閉 **nginx proxy buffering**，否則事件會被緩衝、要連線中斷才 flush（使用者只好手動 F5）。nginx 對應 `location` 需設 `proxy_buffering off;` 並拉長 `proxy_read_timeout`（見伺服器 `/etc/nginx/sites-available/meeting`）。

### 身分驗證（兩種方式擇一）

用 `Authorization: Bearer <apikey>` 標頭，或（**僅當設定 `ALLOW_API_KEY_QUERY=true` 時**）網址帶 `?apikey=<apikey>`：

> **安全建議**：金鑰不建議經由 URL query 傳遞（會洩漏至 access log、瀏覽器歷史與 Referer），正式環境請一律使用 `Authorization` 標頭；預設不啟用 query 方式。

```bash
# 標頭方式（建議）
curl https://meeting.tschoolsu.org/api/v1/meetings/1 \
  -H "Authorization: Bearer tpm_xxxxxxxx"
```

金鑰無效或遺漏時回傳 `401 {"error":"..."}`。

### 建立會議 `POST /api/v1/meetings`

**Request Body（JSON，`Content-Type: application/json`）：**

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `title` | string | ✅ | 會議標題（1–200 字） |
| `starts_at` | string | ✅ | 會議開始時間，`"YYYY-MM-DDTHH:MM"`，以 **UTC+8** 本地時間填寫（例 `2026-09-10T09:00`） |
| `department` | string | 否 | 部會 tag（空字串則不顯示） |
| `participants` | string[] | 否 | 參與人 Email 清單，每筆需為合法信箱 |
| `location` | string | 否 | 會議地點 |
| `online_link` | string | 否 | 線上會議連結 |
| `description` | string | 否 | 會議說明 |

**範例：**

```bash
curl -X POST https://meeting.tschoolsu.org/api/v1/meetings \
  -H "Authorization: Bearer tpm_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "部務會議",
    "starts_at": "2026-09-10T09:00",
    "department": "數位部",
    "location": "會議室 A",
    "participants": ["a@tschool.tp.edu.tw", "b@tschool.tp.edu.tw"]
  }'
```

**成功回應（HTTP 201）：**

```json
{
  "id": 12
}
```

- `id`：新建會議的 id，可用於後續 `GET /api/v1/meetings/:id`。

**錯誤回應：**

| HTTP | 時機 | 例 |
| --- | --- | --- |
| `400` | 缺少欄位、格式不正確 | `{"error":"標題長度需介於 1 到 200 字"}` |
| `401` | 金鑰遺漏或無效 | `{"error":"API key 無效"}` |

> 建立的會議從 `starts_at` 自動推導日期；簽到與表決須等會議開始（UTC+8）後才開放，且投票需主席先對該議案「開始表決」。

## 權限（來自 JWT `permissions.meeting`）

| 狀態 | 行為 |
| --- | --- |
| `admin` | 最高管理員，可建立、編輯、刪除任何會議，管理面板 |
| `moderator` | 可建立；可編輯／刪除**自己的**會議（以 `sub` 比對）；可簽到、表決。代簽到限建立者／admin／被授權的協作者 |
| `default` | **只能看到自己受邀的會議**；可建立與否看 `ALLOW_STUDENT_CREATE`（預設否），一般學生可簽到、表決 |
| `warning` | 每次進入跳出彈窗，讀取 `reason`，5 秒後才能關閉；仍可瀏覽 |
| `ban` | 導回門戶（`PORTAL_URL`），不給瀏覽。角色不夠（例如學生開 `/manage`）則是站內 `/forbidden` |

簽到與表決皆以 **Email 邀請**為門檻：只有參與人名單內的人（加上管理員）能進行。

## 環境變數

請複製 `.env.example` 為 `.env.local`（Next 只自動載入 `.env.local`）：

| 變數 | 說明 |
| --- | --- |
| `POSTGRES_URL` | PostgreSQL 連線字串（`t_meeting` 資料庫） |
| `PORT` | 服務 port（本專案固定 3009） |
| `MEETING_SELF_URL` | 本服務的公開網址，作為 SSO `redirect_uri` 根（如 `https://meeting.tschoolsu.org`） |
| `TPASS_SERVICE_ID` | 服務 ID，需與註冊表一致（`meeting`），決定 JWT `aud=tpass:meeting` |
| `AUTH_AUTHORIZE_URL` / `AUTH_JWKS_URL` | T-Pass auth 端點 |
| `JWT_ISSUER` | 簽發者（`https://auth.tschoolsu.org`） |
| `PORTAL_URL` | 必填，門戶大廳網址；登出／被擋後的跳轉目標 |
| `AUTH_DENIED_URL` | 選填，`/denied` 頁網址；未設就由 `AUTH_AUTHORIZE_URL` 的 origin 推導 `${origin}/denied` |
| `DEPARTMENTS` | 選填，部會清單的**一次性種子**（逗號分隔）：只在 DB 還沒有任何部會時匯入，之後由 admin 在 `/panel` 新增／刪除 |
| `ALLOW_STUDENT_CREATE` | `true` 時允許一般學生自主建立會議（預設不設） |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Email 通知用的 SMTP 設定；未設定時通知進入佇列但不派送 |

## 資料庫

Schema 由 `lib/db.ts` 冪等初始化（`CREATE TABLE IF NOT EXISTS`），涵蓋：`meetings`（含 `location`／`online_link`／`description`／`status`）、`participants`（含 `grade`）、`agenda_items`、`agenda_attachments`、`motions`（各自帶`門檻 threshold`與`status`）、`ballots`（具名 `agree`／`against`）、`notification_queue`（Email 派送佇列）、`meeting_notes`。本機建庫指令：

```bash
sudo -u postgres psql -c "CREATE ROLE t_meeting WITH LOGIN PASSWORD '<隨機密碼>';"
sudo -u postgres psql -c "CREATE DATABASE t_meeting OWNER t_meeting;"
```

## 開發與部署

```bash
pnpm install
cp .env.example .env.local   # 填入真實值
pnpm dev                     # 開發：已內建 HTTPS + meeting.lvh.me:3009，憑證在 $HOME/tpass-certs（`tpass setup` 產生）
pnpm run build && pnpm start # 正式：3009 port
```

部署由上層 tpass-ops 的 `tpass deploy meeting` / GitHub Actions 負責（pm2 設定從 `tpass-registry` 派生，服務 repo 不自帶 `ecosystem.config.js`）。

### 網域名稱與 TLS（`meeting.tschoolsu.org`）

`/etc/nginx/sites-enabled/meeting` 已把 `meeting.tschoolsu.org` 代理到 `127.0.0.1:3009`，目前暫用 `auth.tschoolsu.org` 的憑證頂著。待 `meeting.tschoolsu.org` 的 DNS 指到本機後：

```bash
sudo certbot --nginx -d meeting.tschoolsu.org
sudo nginx -t && sudo systemctl reload nginx
```

> 本機 `/etc/hosts` 目前有 `127.0.0.1 meeting.tschoolsu.org`，是為了在 DNS 生效前能本地測試；正式對外後請移除該行。

## 安全措施

- JWT 驗證鎖死 `EdDSA`、核對 `issuer` 與 `audience`（`tpass:meeting`），Token 以 **Host-only HttpOnly Cookie** 保存。
- 所有頁面未登入自動導向 auth；僅 `ban` 導回 portal；`default` 只看到自己受邀的會議。
- 會議 id 只接受正整數（防 IDOR），查無資料一律 404。
- 全部 SQL 皆參數化；Server Action 有內建 CSRF 防護與權限檢查（建立者用 `sub` 比對，不用 Email）。
- `proxy.ts` 注入 CSP、`X-Frame-Options`、`Referrer-Policy` 等安全標頭。
- 簽到／表決在資料庫層以 UNIQUE／條件更新防重複，並保證「表決不可反悔」。
- 管理面板（匯入、BGM 上傳、API 金鑰管理）只有 `admin` 能操作；API key 只存雜湊、可刪除。
- nginx 對本服務設 `client_max_body_size 12M`、Next Server Actions `bodySizeLimit 11mb`，讓 BGM／匯入最多 10 MB 的上傳正常運作。

## 註冊服務

本服務已註冊於 `tpass-registry/services.json`（`id: meeting`）。auth 的發證白名單來自註冊表，若新增／修改服務設定請同步更新 `/home/service/tpass-registry/services.json` 與 `/home/yushun/tpass/tpass-registry/services.json`（ops clone），並重啟 auth。
