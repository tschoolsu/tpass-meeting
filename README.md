# T-Pass Meeting 會議輔助

會議輔助系統：會議記錄、簽到與表決。介面遵循 [T-Pass Design System](./specification/des.md)（Playful Tech / Bright Pop Tech），登入串接 T-Pass 單一登入。

## 功能

- **首頁 `/`**：條列所有會議（標題、日期、建立者），可依關鍵字搜尋、依部會標籤篩選；標題自動加 `[部會]` 前綴。
- **創建／編輯 `/create`**：填寫標題、會議開始時間（UTC+8）、部會、參與人（Email）、是否啟用表決與表決題目。
- **會議閱讀器 `/read?id=`**：參與人名單、簽到統計（含未簽到者）、表決圓餅圖、會議紀錄列（text-bar）、編輯／刪除。
- **簽到 `/checkin?id=`**：圓形簽到按鈕，點下噴發動畫；僅受邀參與人可簽到。
- **表決 `/vote?id=`**：一場會議一個 vote id、內含多題，答完自動跳下一題；**會議開始（UTC+8）後才開放表決**，送出後不可更改。
- **404 頁面** 與登入／登出流程完備。
- **管理面板 `/panel`（僅 admin）**：匯出全部會議紀錄為 JSON、匯入 JSON 並取代全部紀錄、上傳會議 BGM（mp3 ≤ 10 MB，會議閱讀器自動播放、左下角圓形按鈕可靜音）、建立／刪除 API 金鑰。

## API（需 API key）

API key 於管理面板建立（只顯示一次，DB 只存 SHA-256 雜湊）。呼叫時帶 `Authorization: Bearer <apikey>` 或 `?apikey=<apikey>`：

| Method | Endpoint | 說明 |
| --- | --- | --- |
| `POST` | `/api/v1/meetings` | 建立會議（title、starts_at、department、participants、voting_enabled、questions） |
| `GET` | `/api/v1/meetings/:id` | 會議資訊（含 vote id、題目、參與人、紀錄） |
| `GET` | `/api/v1/meetings/:id/checkins` | 已簽到／未簽到清單 |
| `GET` | `/api/v1/votes/:voteId/results` | 表決結果（各題各選項人數與百分比） |

建立會議範例：

```bash
curl -X POST https://meeting.tschoolsu.org/api/v1/meetings \
  -H "Authorization: Bearer <apikey>" -H "Content-Type: application/json" \
  -d '{"title":"部務會議","starts_at":"2026-09-10T09:00","department":"數位部",
       "participants":["a@tschool.tp.edu.tw"],"voting_enabled":true,
       "questions":["同意採購新投影機"]}'
```

## 權限（來自 JWT `permissions.meeting`）

| 狀態 | 行為 |
| --- | --- |
| `admin` | 最高管理員，可建立、編輯、刪除任何會議 |
| `moderator` | 可建立；可編輯／刪除**自己的**會議（以 `sub` 比對）；可簽到、表決 |
| `default` | 直接導回 `https://portal.tschoolsu.org/`，不給瀏覽 |
| `warning` | 每次進入跳出彈窗，讀取 `reason`，5 秒後才能關閉；仍可瀏覽 |
| `ban` | 直接導回 `https://portal.tschoolsu.org/`，不給瀏覽 |

簽到與表決皆以 **Email 邀請**為門檻：只有參與人名單內的人（加上管理員）能進行。

## 環境變數

請複製 `.env.example` 為 `.env`：

| 變數 | 說明 |
| --- | --- |
| `POSTGRES_URL` | PostgreSQL 連線字串（`t_meeting` 資料庫） |
| `PORT` | 服務 port（本專案固定 3009） |
| `SERVICE_SELF_URL` | 本服務的公開網址，作為 SSO `redirect_uri` 根（如 `https://meeting.tschoolsu.org`） |
| `TPASS_SERVICE_ID` | 服務 ID，需與註冊表一致（`meeting`），決定 JWT `aud=tpass:meeting` |
| `AUTH_AUTHORIZE_URL` / `AUTH_JWKS_URL` / `AUTH_DENIED_URL` | T-Pass auth 端點 |
| `JWT_ISSUER` | 簽發者（`https://auth.tschoolsu.org`） |
| `PORTAL_URL` | 登出／被擋後的跳轉目標 |
| `DEPARTMENTS` | 部會 tag（逗號分隔），首頁下拉選單與會議部會欄位動態抓取 |

## 資料庫

Schema 由 `lib/db.ts` 冪等初始化（`CREATE TABLE IF NOT EXISTS`），共五張表：`meetings`、`participants`、`votes`、`ballots`、`meeting_notes`。本機建庫指令：

```bash
sudo -u postgres psql -c "CREATE ROLE t_meeting WITH LOGIN PASSWORD '<隨機密碼>';"
sudo -u postgres psql -c "CREATE DATABASE t_meeting OWNER t_meeting;"
```

## 開發與部署

```bash
npm install
cp .env.example .env        # 填入真實值
npm run dev                 # 開發：3009 port
npm run build && npm start  # 正式：3009 port
```

以 pm2 常駐（root）：

```bash
pm2 start ecosystem.config.js
```

### 網域名稱與 TLS（`meeting.tschoolsu.org`）

`/etc/nginx/sites-enabled/meeting` 已把 `meeting.tschoolsu.org` 代理到 `127.0.0.1:3009`，目前暫用 `auth.tschoolsu.org` 的憑證頂著。待 `meeting.tschoolsu.org` 的 DNS 指到本機後：

```bash
sudo certbot --nginx -d meeting.tschoolsu.org
sudo nginx -t && sudo systemctl reload nginx
```

> 本機 `/etc/hosts` 目前有 `127.0.0.1 meeting.tschoolsu.org`，是為了在 DNS 生效前能本地測試；正式對外後請移除該行。

## 安全措施

- JWT 驗證鎖死 `EdDSA`、核對 `issuer` 與 `audience`（`tpass:meeting`），Token 以 **Host-only HttpOnly Cookie** 保存。
- 所有頁面未登入自動導向 auth；`default`／`ban` 一律導回 portal。
- 會議 id 只接受正整數（防 IDOR），查無資料一律 404。
- 全部 SQL 皆參數化；Server Action 有內建 CSRF 防護與權限檢查（建立者用 `sub` 比對，不用 Email）。
- `proxy.ts` 注入 CSP、`X-Frame-Options`、`Referrer-Policy` 等安全標頭。
- 簽到／表決在資料庫層以 UNIQUE／條件更新防重複，並保證「表決不可反悔」。
- 管理面板（匯入、BGM 上傳、API 金鑰管理）只有 `admin` 能操作；API key 只存雜湊、可刪除。
- nginx 對本服務設 `client_max_body_size 12M`、Next Server Actions `bodySizeLimit 11mb`，讓 BGM／匯入最多 10 MB 的上傳正常運作。

## 註冊服務

本服務已註冊於 `tpass-registry/services.json`（`id: meeting`）。auth 的發證白名單來自註冊表，若新增／修改服務設定請同步更新 `/home/service/tpass-registry/services.json` 與 `/home/yushun/tpass/tpass-registry/services.json`（ops clone），並重啟 auth。
