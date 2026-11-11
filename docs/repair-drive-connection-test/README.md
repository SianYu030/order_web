# 設備維修附件 V3.3 /dev 唯讀連線測試頁

版本：2026-11-11。僅測試接收器跨視窗握手與 Google Drive 健康檢查。

## 測試方法
1. 使用廠務室 Google 帳號在 Chrome 開啟 https://sianyu030.github.io/order_web/repair-drive-connection-test/ 。
2. 將 Apps Script「部署 → 測試部署作業」得到的 `/dev` 網址貼入輸入框（不能填原正式 `/exec`）。
3. 點「連接 V3.3 接收器」，讓它另開 Apps Script 視窗。畫面不需要再輸入員工識別碼、附件授權碼。
4. 等待本頁出現「接收器已回應」，再按「確認 Drive 唯讀連線」。
5. 成功應顯示「V3.3 接收器唯讀連線成功」。若逾時或出現權限錯誤，保留兩個視窗的畫面供排查。

## 必須知道
- 此頁唯一可以送出的後端 RPC 為 `health` → `drivePilotHealthcheck`。
- **本頁不會建立／刪除 MR 工單、不傳 LINE、不上傳任何照片影片、不操作 NAS。**
- 此頁不能證明一般員工可以使用，Google Apps Script `/dev` 本身只有具專案編輯權限者可執行。
- 原本「設備報修維修照片影片接收器」Apps Script 仍包含刪除功能；即使新版 V3.3 無員工登入，**也不能直接把這個舊專案改為「任何人」**，因為有效執行身分及公開 RPC 的安全隔離仍需審核。必須確認公司資安允許的部署方式。
- 唯讀檢查通過不代表附件已存入 Drive，也不代表 PhotoAgent、NAS、LINE 已完成驗收。
- 獨立測試頁更新不修改正式 `docs/repair-quick-v4-492/`、Apps Script、LINE 或 NAS。

## 檢查項目
- 禁用任何非 `/dev` 網址。
- 使用密碼學隨機 UUID 作為一次握手識別碼。
- 僅接受 `script.google.com`、`script.googleusercontent.com` 或 Google Apps Script 指定的 `*-script.googleusercontent.com` 傳入的訊息，且必須匹配握手識別碼。
- UI 只傳送 `health` 讀取操作，不允許附件 `start`／`chunk`／`query`，不提供 MR 表單。
- `receiverVersion` 必須是 `3.3`。
