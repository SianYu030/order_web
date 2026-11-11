# V3.3 Google Drive 附件接收：原設備維修中心內的測試模式

日期：2026-11-11。這個測試功能直接加入原有 `index.html` + `repair-drive-bridge.js`，**不是另外的報修網站**。

## 入口
使用原設備維修網站：
`https://sianyu030.github.io/order_web/repair-quick-v4-492/`

測試時加上：
- `drive_upload=1`
- `drive_v33_test=1`
- `receiver_dev=<url-encoded Google Apps Script /dev URL>`

上述連結只建議廠務室 Apps Script 專案編輯者使用。V3.3 `/dev` 無法代表一般員工可使用。

## 使用方式
1. 原報修首頁會顯示「原報修系統｜V3.3 附件連線測試」。
2. 點「連接 Google Drive V3.3」。Google 測試視窗需要透過使用者點擊打開，瀏覽器通常不允許自動彈窗。
3. 收到 `ready` 訊息後，原報修網頁自動呼叫 `health` RPC，要求接收器回報版本 `3.3` 與 Google Drive 唯讀存取結果。
4. 確認成功，原網站直接顯示「V3.3 Google Drive 已連線」，並關閉這次測試開出的 Google 視窗。
5. 頁面原有拍照、相簿、影片選取功能不變。

## 關鍵警告
- **單純點「連接 Google Drive V3.3」不會建立 MR、上傳照片、發 LINE 或動 NAS。**
- **原本下方的「送出報修工單」仍會真的建立正式 MR，依勾選發送 LINE，並嘗試附件歸檔**。在尚未約定測試工單前，不要按「送出報修工單」。
- Google Drive `healthcheck` 成功只是唯讀授權與跨視窗通訊通過，**不代表照片影片上傳或 NAS 歸檔已驗證**。
- 平常不帶測試參數的網站完全保留原版行為；原 `/exec` V2.3 接收器仍是舊設定，沒有切換全員使用。
- 同一 Google Apps Script 接收器仍包含工單刪除管理程式；在審核公開 RPC、安全權限及取得公司 IT 核准前，**不得把現有部署改為「任何人」**。
- 公司內建瀏覽器和管制網路可能封鎖 Google 彈出視窗，請用已核准 Chrome 瀏覽器測試；不可繞過公司資安限制。

## 程式變更
- `repair-drive-bridge.js`：保留原本報修/維修附件及 LINE 邏輯，只在測試參數存在時換用 Google `/dev` 和 V3.3 版本檢查；上方產生單一連線控制區塊。
- `index.html`：僅更新 `repair-drive-bridge.js` 的快取版本參數，其他報修欄位及送出邏輯未改。
- 未更動 Apps Script 的正式 `/exec` 部署、工單資料、LINE 或 NAS。
