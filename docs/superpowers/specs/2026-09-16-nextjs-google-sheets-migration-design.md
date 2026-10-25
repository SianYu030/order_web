# Next.js + Apps Script Bridge 遷移設計

## 狀態

原先的「Next.js + Google Sheets API + Service Account」方案已改為 **Next.js + Apps Script Bridge + Google Sheets**，原因是使用者不希望為 Google Cloud 進行付款方式／Billing 驗證。

## 目標

把目前「大成鋼系統櫥櫃部現場管理平台」的 UI 從 Google Apps Script Web App 搬到 GitHub / Next.js，同時保留既有 Google Sheets 作為資料來源，而且不使用 Google Cloud、Service Account 或 Google Sheets API 私鑰。

## 最終架構

```text
手機 / 電腦瀏覽器
        |
        v
Next.js App Router
        |
        +-- React UI
        |
        +-- GET /api/systems
                |
                v
        Apps Script bridge
        /exec?api=systems
                |
                v
        綁定的 Google Sheets
        「系統清單!A2:I」
```

## 相容策略

Apps Script 的 `index.html` 不需要改。`Code.gs` 保留原本：

- `?role=staff`
- `?role=supervisor`
- `?role=admin`
- `getSystemList()`
- `getLinkOrText_()` RichText 超連結讀取

並新增 `?api=systems` JSON 入口，專門給 Next.js 伺服器端讀取。

## 專案結構

```text
order_web/
├─ app/
│  └─ api/systems/route.ts
├─ components/
│  └─ management-platform.tsx
├─ gas/
│  └─ Code.gs
├─ lib/
│  ├─ apps-script-bridge.ts
│  ├─ roles.ts
│  └─ systems.ts
├─ tests/
│  ├─ api-systems.test.ts
│  ├─ apps-script-bridge.test.ts
│  ├─ roles.test.ts
│  └─ systems.test.ts
└─ README.md
```

## 不需要的東西

新版不再需要：

- Google Cloud Billing
- Google Sheets API enablement
- Service Account
- Service Account JSON key
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `googleapis` npm 套件

## 資料模型

`/api/systems` 對前端維持：

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

Apps Script bridge 回傳：

```json
{
  "success": true,
  "data": []
}
```

## 角色行為

保留：

- `staff`
- `supervisor`
- `admin`
- `view=mobile|desktop`

`role` 仍是既有 UI 顯示模式，不是身分驗證。正式登入／SSO 為後續獨立工作。

## 錯誤處理

- Apps Script JSON 回傳成功：HTTP 200。
- Apps Script 無法存取、回傳非 JSON 或回報失敗：Next.js `/api/systems` 回 HTTP 502。
- 前端顯示可讀的錯誤區塊，不把內部 stack trace 顯示給使用者。

## 驗證

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

GitHub Actions 同時執行正式依賴安全檢查。

## 切換策略

1. `main` 與目前 GAS 正式網址維持不動。
2. 新版先留在 `migration/nextjs-google-sheets` 分支。
3. 將 repo 的 `gas/Code.gs` 套用到現有 Apps Script，更新既有 Web App deployment，保留同一個 `/exec` URL。
4. 驗證 `/exec?api=systems` 回傳 JSON。
5. 部署 Next.js 測試站並驗證 staff / supervisor / admin、手機／桌面模式及所有連結。
6. 全部正常後才切換正式入口。

## 完成定義

- Next.js UI 不再使用 `HtmlService` 或 `google.script.run`。
- Next.js 不持有 Google 私鑰。
- `/api/systems` 經由 Apps Script bridge 讀取原 Google Sheets。
- RichText 超連結仍由原 Apps Script API 正確取得。
- 所有測試、lint、typecheck、build 與 dependency audit 通過。
- 原 GAS 正式站可保留作回退用途。
