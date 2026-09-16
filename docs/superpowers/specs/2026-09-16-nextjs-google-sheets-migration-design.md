# Next.js + Google Sheets API 遷移設計

## 目標

把目前「大成鋼系統櫥櫃部現場管理平台」從 Google Apps Script Web App 遷移成 GitHub 內的 Next.js + TypeScript 專案；保留既有 Google Sheets 作為資料來源，不再依賴 Apps Script 的 `HtmlService`、`google.script.run` 與 `SpreadsheetApp`。

遷移期間現有 Apps Script 正式版維持不動，直到新版驗證完成才切換使用網址。

## 現況

目前 `SianYu030/order_web` 的 `main` 分支包含舊版單頁 `index.html` 報修介面，以及 README 與寫入測試檔。使用者另外提供了目前正式管理平台的 Apps Script 原始碼：

- `程式碼.gs`
  - `doGet(e)` 解析 `role=staff|supervisor|admin`
  - `getSystemList()` 從綁定試算表的「系統清單」分頁讀取 A:I
  - `getLinkOrText_()` 讀取儲存格 RichText 超連結或文字
- `index.html`
  - 管理平台 UI、CSS、手機／桌面版切換
  - `staff`、`supervisor`、`admin` 三種顯示模式
  - 填寫表單／查看紀錄切換
  - 目前透過 `google.script.run.getSystemList()` 取得資料

## 本階段範圍

本階段完成「總控管理平台」的 Next.js 遷移，包含：

1. 建立標準 Next.js + TypeScript 專案結構。
2. 將目前管理平台 UI 搬成 React 元件，保持既有視覺與使用流程。
3. 保留 `?role=staff`、`?role=supervisor`、`?role=admin` 相容行為。
4. 保留手機／桌面模式與 `?view=mobile|desktop`。
5. 建立伺服器端 `/api/systems` API。
6. `/api/systems` 透過 Google Sheets API 讀取「系統清單!A2:I」。
7. 由伺服器端處理 Google Service Account 憑證，不把私鑰送到瀏覽器。
8. 保留系統項目排序、圖示、角色顯示規則與表單／紀錄連結。
9. 加入輸入驗證、錯誤回應與基本快取，降低重複 Sheets API 請求。
10. 加入自動測試、lint、typecheck 與 production build 驗證。
11. 更新 README，寫明本機執行、Google Cloud/Sheets 權限與部署環境變數。

## 不在本階段處理

以下功能不和總控平台遷移綁在同一個變更中，避免一次改動過大：

- 將各個 Google Form 本身重寫成 Next.js 表單。
- 將各個紀錄試算表資料搬離 Google Sheets。
- 故障照片儲存方案。
- LINE 通知後端重寫。
- 真正的帳號登入／SSO。
- 移除既有 Apps Script 正式部署。

這些可在總控平台穩定後逐項遷移。

## 架構

```text
手機 / 電腦瀏覽器
        |
        v
Next.js App Router
        |
        +-- React UI
        |     - 角色顯示
        |     - 手機/桌面模式
        |     - 表單/紀錄切換
        |
        +-- GET /api/systems
                |
                v
        Server-only Google Sheets client
                |
                v
        Google Sheets API v4
                |
                v
        總控試算表「系統清單!A2:I」
```

## 專案結構

```text
order_web/
├─ app/
│  ├─ api/
│  │  └─ systems/
│  │     └─ route.ts
│  ├─ globals.css
│  ├─ layout.tsx
│  └─ page.tsx
├─ components/
│  └─ management-platform.tsx
├─ lib/
│  ├─ google-sheets.ts
│  ├─ roles.ts
│  └─ systems.ts
├─ tests/
│  ├─ roles.test.ts
│  └─ systems.test.ts
├─ .env.example
├─ .gitignore
├─ eslint.config.mjs
├─ next.config.ts
├─ package.json
├─ tsconfig.json
└─ README.md
```

## 資料模型

`/api/systems` 對前端回傳：

```ts
export type SystemItem = {
  id: string;
  module: string;
  name: string;
  type: string;
  department: string;
  user: string;
  formUrl: string;
  recordUrl: string;
  note: string;
};
```

成功：

```json
{
  "success": true,
  "data": []
}
```

失敗：

```json
{
  "success": false,
  "message": "可讀的錯誤訊息"
}
```

## Google Sheets API 連線

使用 Google Cloud Service Account，由 Next.js 伺服器端讀取試算表。

需要的環境變數：

```text
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
```

私鑰只能存在本機 `.env.local` 或部署平台 Secret/Environment Variables，禁止提交到 GitHub。

總控試算表必須分享給 `GOOGLE_SERVICE_ACCOUNT_EMAIL`，至少給 Viewer 權限；若未來需要寫入，再升為 Editor。

本階段只讀取 `系統清單!A2:I`，因此 Viewer 即可。

## 超連結處理

Apps Script 原版可透過 RichText API 直接讀取儲存格內嵌超連結；Google Sheets API 則使用 `spreadsheets.get` 並要求 `userEnteredValue`、`hyperlink`、`textFormatRuns` 等欄位，而非只呼叫 `spreadsheets.values.get`。

讀取規則：

1. 若儲存格有 `hyperlink`，使用該網址。
2. 若文字格式 run 帶有 link，使用第一個有效網址。
3. 否則使用儲存格顯示文字。

這樣才能保留目前 `getLinkOrText_()` 的實際功能。

## 角色行為

相容三種角色：

- `staff`：現場版
- `supervisor`：主管版
- `admin`：管理版

不合法或不存在的 `role` 一律降級為 `staff`。

既有顯示規則維持：

- admin：全部功能，能切換填寫／紀錄，能看全部功能清單。
- supervisor：板材、報修、停工、廢料，可切換填寫／紀錄。
- staff：首件、不良、板材；不顯示報修、停工、五金、封邊。

### 權限安全說明

`?role=admin` 只是相容既有 UI 的「顯示模式」，不是身份驗證。任何知道網址的人都能改 query string。因此本階段不把它描述成真正安全的管理員登入。

伺服器 API 不接受 Service Account 憑證或私鑰自前端傳入。真正的帳號登入／SSO 會是後續獨立功能。

## UI 相容性

保留目前：

- 深色漸層 Header。
- E3 / E4 / W8 現場作業平台副標。
- 角色徽章。
- 今日日期。
- 填寫表單／查看紀錄 tabs。
- 兩欄桌面卡片、單欄手機卡片。
- 不良品紅色警示卡片。
- 紀錄模式藍色視覺。
- 原有功能排序與中文顯示名稱。

不要求像素級重製，但功能、資訊層級、主要色彩與手機操作方式必須一致。

## 錯誤處理

API：

- 缺少環境變數：HTTP 500，回傳通用設定錯誤訊息；伺服器 log 可保留詳細原因。
- Google API 驗證失敗：HTTP 502。
- 找不到工作表或資料範圍：HTTP 502。
- 空資料：HTTP 200，`data: []`。

前端：

- 載入期間顯示「載入中...」。
- API 錯誤顯示目前風格的紅色錯誤區塊。
- 空資料顯示「目前沒有系統資料」。
- 連結不存在時卡片不可點擊並降低透明度。

## 快取

`/api/systems` 可使用短時間伺服器快取，目標 60 秒。總控清單不是高頻即時資料，60 秒延遲可接受；可顯著減少 Sheets API 請求。

## 測試

至少覆蓋：

- role 正規化與非法 role 降級。
- staff / supervisor / admin 顯示規則。
- 系統排序。
- Sheets cell 超連結解析。
- A:I row 轉 `SystemItem`。
- 空列過濾。
- API 在資料成功／失敗時的回應格式。

驗證命令：

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

四項全部成功才算遷移版可進入部署測試。

## 部署界線

此分支先建立「可部署的標準 Next.js 專案」。部署帳號與商業用途方案由使用者的實際平台帳號決定，避免在未授權外部平台前綁死供應商。

正式部署時需要把三個 Google 環境變數加入部署平台，並把總控試算表分享給 Service Account。

## 切換策略

1. `main` 的既有版本與 Apps Script 正式網址保持不動。
2. 所有新開發先在 `migration/nextjs-google-sheets`。
3. 完成測試與部署預覽後，比對 staff / supervisor / admin。
4. 驗證 Google Sheets 「系統清單」資料與超連結讀取正確。
5. 手機與桌面實機確認。
6. 新版穩定後才合併／切換正式入口。
7. Apps Script 保留一段回退期，不立即刪除。

## 完成定義

本階段完成條件：

- repo 已是可安裝、可啟動、可 build 的 Next.js + TypeScript 專案。
- 不再使用 `HtmlService`、`google.script.run`、`SpreadsheetApp`。
- UI 能從 `/api/systems` 載入資料。
- `/api/systems` 能透過 Google Sheets API 讀取既有「系統清單」。
- 三種角色與手機／桌面模式正常。
- 所有測試、lint、typecheck、build 通過。
- Service Account 私鑰不在 GitHub history 中。
- README 有完整設定步驟。
- 舊 GAS 正式版完全未被修改。
