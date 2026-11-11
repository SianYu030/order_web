# V3.3 Google Drive 附件接收器：一鍵唯讀連線測試

2026-11-11。已知測試接收器的 /dev 網址，由 ChatGPT 提供專用入口連結傳入參數 `receiver_dev`；**不會把公司 /dev 網址寫入公開 GitHub 原始碼**。

## 使用者操作
1. 從專用連結開啟 `https://sianyu030.github.io/order_web/repair-drive-connection-test/?receiver_dev=<URL encoded /dev>`。
2. 頁面自動填入並隱藏 /dev 測試網址，免複製貼上。
3. **只按一次「開始連線測試」**。瀏覽器另開 Apps Script 測試視窗。由於 Chrome/Safari 的彈出視窗限制，這一步需要使用者實際點擊；不會未經點擊自動開啟。
4. 接收到具握手 nonce、可信 Google Apps Script 網域的 `ready` 後，頁面自動呼叫 **唯一允許** 的 `health` → `drivePilotHealthcheck`，核對 `receiverVersion:3.3`。
5. 結果自動顯示在原測試頁。若 Google 登入或視窗被擋，頁面會顯示錯誤並可重新點擊。

## 安全與範圍
- 不建立／刪除 MR 工單，不傳任何 LINE，不上傳圖片／影片，不操作 NAS，也沒有員工附件授權碼表單。
- 測試網址透過頁面查詢參數傳入，僅允許 `https://script.google.com/macros/s/<id>/dev`；不支援正式 `/exec`。
- 此 `/dev` 測試只能由 Apps Script 專案編輯者使用，**不能代表全廠員工可使用**。
- 真實跨視窗與 Google Drive 連線仍需管理員使用 Chrome 實際驗證，不可把離線模擬視為端到端通過。
- 不修改 `docs/repair-quick-v4-492/` 正式報修網站，不修改現有 Apps Script 部署、LINE、NAS。
- 同 Apps Script 專案仍存在工單刪除管理函式；不能僅依「V3.3 免員工登入」就將原專案開放匿名全員使用。須先完整審核 RPC 及部署風險。

## 技術
- 頁面來源 `receiver_dev` 由瀏覽器 `URLSearchParams` 讀取，且只接受 Google `/dev`。
- 透過使用者點擊同步 `window.open`，帶入一次性 `crypto.randomUUID()` nonce。
- 僅處理合法 Google Apps Script 網域且 nonce 完全相符的 `ready` 與 `result`。
- 收到 `ready` 後自動執行一次 health，避免重複 heartbeats。
- 45 秒未收到結果視為失敗並提示，可重新開始。
- 不儲存任何 OAuth 憑證、Google Drive Token 或其他個人授權碼。
