# 大成鋼系統櫥櫃部管理平台

本分支把原本由 Google Apps Script `HtmlService` 顯示的總控管理平台改為 **Next.js + TypeScript**。既有 Google Sheets 資料完全保留，不使用 Google Cloud / Service Account；Apps Script 只留下極小的資料橋接 API。

## 架構

```text
手機 / 電腦
  -> Next.js 管理平台
  -> GET /api/systems
  -> Apps Script bridge (?api=systems)
  -> 總控 Google Sheets「系統清單!A2:I」
```

GitHub / Next.js 不直接持有 Google 帳號金鑰，因此不需要 Google Cloud Billing、Service Account 或 Google Sheets API 金鑰。

## Apps Script 橋接設定

GitHub 已提供可直接覆蓋的完整 Apps Script 程式：

```text
gas/Code.gs
```

它保留既有：

- `?role=staff`
- `?role=supervisor`
- `?role=admin`
- 原本 `index.html`
- `getSystemList()`
- RichText 超連結讀取

並新增：

```text
?api=systems
```

例如目前部署網址會變成：

```text
https://script.google.com/macros/s/AKfycbw4-R3NzwtR_24rraYOdtHLaxd3Y6y3v6MePSlxtpLCt1envWKTt0_2WBIVUjLWYH9YXA/exec?api=systems
```

該網址應回傳 JSON：

```json
{
  "success": true,
  "data": []
}
```

### Apps Script 帳號內唯一需要做的事

1. 打開「大成鋼系統櫥櫃部現場管理平台」Apps Script。
2. 將 `程式碼.gs` 整份替換成本 repo 的 `gas/Code.gs`。
3. 儲存。
4. 到「部署 -> 管理部署作業」，編輯目前 Web App 部署並建立新版本。
5. 保留原本 `/exec` 部署網址。
6. 用 `/exec?api=systems` 測試是否看到 JSON。

原本 `index.html` 不需要修改。

## 本機啟動

需要 Node.js 20 以上。

```bash
npm install
npm run dev
```

開啟 `http://localhost:3000`。

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

> `role` 目前沿用既有系統的顯示模式，不是登入驗證；知道網址的人仍可修改 query string。正式身分驗證 / SSO 可另外實作。

## 驗證

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

GitHub Actions 另外會執行正式依賴安全檢查。

## 遷移原則

- `main` 與現有 GAS 正式網址保持不動。
- 新版先在 `migration/nextjs-google-sheets` 驗證。
- Apps Script 只保留 Google Sheets 橋接，不再負責新版 UI。
- 新版部署、資料橋接與實機驗證全部通過後才切換正式入口。
- 各個 Google Form、LINE 通知、照片與其他 GAS 子系統之後再逐項搬移。
