# 設備維修中心 V4.0｜免登入附件直傳後端

日期：2026-11-11　狀態：**程式已製作，未部署／未對全廠啟用**。

## 設計目標

讓現場員工**只使用原本的設備維修中心**。選擇部門、報修人、機台、拍照／選影片後，點原本的「送出報修工單」，系統先依既有流程建立 MR，依勾選傳 LINE，接著直接把圖片／影片送進公司 Google Drive，再由原 PhotoAgent 核對 NAS。

**全程沒有另外的員工識別碼、授權碼、Google 登入視窗、連接按鈕或第二個上傳頁。**

## 為什麼新建獨立 Apps Script 專案

原「設備報修維修照片影片接收器」含工單刪除／隔離、NAS 簽章管理函式。Google Apps Script 的「以我執行」會用部署者權限服務匿名訪客；不可將舊專案直接公開，避免他人使用廠務室權限操作刪除功能。

V4 為單一純上傳服務，只含 `Code.gs` 與 `appsscript.json`，**不複製任何 RepairDeletionBridge.gs、Bridge.html 或管理工具**。對外公開函式只有 `doGet`、`doPost`，其中 GET 限制為唯讀健康檢查與回執查詢，POST 限定 start／chunk／query 上傳作業。

## 傳輸與回執

1. 使用者按原網站送出，工單由既有正式 V9 Webhook 先建立 MR、讀回核對。
2. 原有 LINE 文字與暫存照片仍依勾選發送；V4 不修改 LINE。
3. V4 前端使用原生 HTML form 的 POST 送到獨立 Google Apps Script `/exec`，表單投遞到隱藏 iframe。不使用會被 CORS 限制的 `fetch` 傳附件。
4. 因跨域 iframe 可能被瀏覽器阻擋，**絕不把 iframe 載入成功當成附件已儲存**。每次 POST 產生不可預測 request ID，透過只讀 JSONP GET 查詢該 ID 的處理回執。
5. 後端先在正式「機修維修單」確認 MR 存在，再允許建立 Drive 續傳工作階段；照片 100MB、影片 500MB、單段 2 MiB，驗證副檔名與首段檔頭。
6. Google Drive 寫入完成後，再查詢 Drive 檔案的 **ID、名稱、大小、MD5**。前端只有得到完整確認才顯示「已寫入 Google Drive」。
7. 單檔分段中斷，保留暫存上傳 session ID；再選相同檔案可先查詢雲端進度後續傳，避免盲目重送。
8. NAS 備份不在此後端完成，仍必須由 PhotoAgent 掃描並獨立核對 SHA-256。

## 尚未完成部署的必要步驟

此處無法直接透過已連結的 Google Drive 工具建立／發布 Apps Script 程式專案，也無法替公司 Google 帳號核准「對所有人開放」的權限設定。下列為**唯一的一次性後台工作**，不需要現場人員參與：

1. 以廠務室 Google 帳號建立一個**新的** Apps Script 專案，命名「設備維修附件接收 V4 純上傳」。**不要覆蓋 V3.3 原專案**。
2. 複製 `docs/repair-direct-v4/Code.gs` 和 `appsscript.json`；不加 `RepairDeletionBridge.gs`。
3. 指令碼屬性填入三個既有環境值：`REPAIR_ATTACH_ROOT_ID`、`REPAIR_FORMAL_SHEET_ID`、`REPAIR_EXECUTION_EMAIL`。請使用正式核准的 PhotoAgent 雲端來源根目錄、正式「機修維修單」試算表、廠務室執行帳號。
4. 管理員執行函式 `drivePilotHealthcheck_` 完成授權，再將新純上傳專案部署為 Web App「以我執行」，存取權依公司 IT 核准設定。**不要將舊含刪除管理的專案改成任何人可存取**。
5. 取得新 Web App `/exec` 網址後，在原網站 `repair-direct-upload.js` 的常數 `endpoint='V4_APPROVED_EXEC_NOT_CONFIGURED'` 中改為核准的完整網址，經合併發布後才在 **`?drive_direct_test=1`** 測試模式啟動。**不接受任何使用者透過 URL 參數覆寫端點，避免資料外流**。
6. 先做純 health：使用新 `/exec?op=health&prefix=repairDirect_...` 驗證 JSONP 並在 Chrome 公司網路測試。然後以**核准的真實 MR 測試工單**，驗證小 JPEG、短 MP4、Drive 資料夾結構與 NAS 備份。
7. 端到端驗證通過、公司核准後才安排正式切換，不需要改動原本 LINE、工單後端或 NAS 工具。

## 已完成測試／限制

- JavaScript 可解析、原網站 V4 測試模式與舊接收器分離。
- 後端模擬：匿名唯讀健康檢查、無效／存在 MR、Google Drive 續傳、重複 request ID 去重、回執、格式驗證及 MD5。
- 尚未實際部署：Google Apps Script /exec、公司 Chrome／Safari 跨域 POST 及 JSONP、長影片容量與配額、LINE／NAS 端到端流程未通過。
- 已知風險：免員工登入代表持有效 MR 編號者可嘗試上傳；格式、數量、限流只能降低風險，**無法當成身分驗證**。不能繞過公司資安政策。Google Apps Script 免費配額和回應延遲可能限制長影片，500MB 是單檔程式上限，**不是已實測成功的容量保證**。
- V4 測試網址在新端點未填入之前，會阻擋「送出報修／儲存維修」等可能改寫正式資料的按鈕，防止誤建 MR。
- 一般不帶測試參數的設備維修網站保持原運作，沒有任何新增登入或視窗。

## 來源

Google Apps Script 官方說明：
- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/guides/content
- https://developers.google.com/apps-script/guides/html/communication
