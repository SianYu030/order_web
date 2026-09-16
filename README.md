# 大成鋼系統櫥櫃部管理平台

本分支把原本由 Google Apps Script `HtmlService` 提供的總控管理平台改為 **Next.js + TypeScript + Google Sheets API**。既有 Google Sheets 資料仍保留；正式 GAS 版本在遷移驗證期間不需修改。

## 架構

```text
手機 / 電腦
  -> Next.js 管理平台
  -> GET /api/systems
  -> Google Sheets API
  -> 總控試算表「系統清單!A2:I」
```

## 本機啟動

需要 Node.js 20 以上。

```bash
npm install
cp .env.example .env.local
npm run dev
```

開啟 `http://localhost:3000`。

## Google Cloud / Google Sheets 設定

1. 在 Google Cloud 建立或選擇一個 Project。
2. 啟用 **Google Sheets API**。
3. 建立 **Service Account**。
4. 為 Service Account 建立金鑰，取得 service account email 與 private key。
5. 將「大成鋼系統櫥櫃部現場管理平台_總控」試算表分享給 Service Account email；本階段只讀取資料，所以 Viewer 權限即可。
6. 從 Google Sheets 網址取得 Spreadsheet ID：`https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`。
7. 在 `.env.local` 或部署平台的 Secret / Environment Variables 設定：

```text
GOOGLE_SHEETS_SPREADSHEET_ID=你的試算表ID
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxxx@xxxx.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

`.env.local`、JSON 金鑰檔、Private Key **禁止提交到 GitHub**。

## 相容網址

```text
/?role=staff
/?role=supervisor
/?role=admin
/?role=admin&view=desktop
/?role=staff&view=mobile
```

- `staff`：現場版
- `supervisor`：主管版
- `admin`：管理版
- `view=mobile|desktop`：強制手機／桌面版顯示

> `role` 目前只是既有介面的顯示模式，不是身分驗證；知道網址的人可以修改 query string。真正登入／SSO 需另外實作。

## 驗證

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

四項全部通過後，才進入部署與實際 Google Sheets 連線測試。

## 遷移原則

- `main` 與現有 GAS 正式網址保持不動。
- 新版先在 `migration/nextjs-google-sheets` 驗證。
- 新版穩定後才切換入口。
- 各個 Google Form、LINE 通知、照片與其他 GAS 子系統之後再逐項搬移。
