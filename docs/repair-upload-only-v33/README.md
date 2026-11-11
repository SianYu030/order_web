# 設備維修附件接收器 V3.3｜員工零額外登入（測試版）

## 目標
員工只使用原設備維修網站，選報修照片／影片並送出。不另外要求員工識別碼、附件授權碼，不需要另開上傳表單。

**此版尚未部署、未合併、未經公司網路及 NAS 驗收。不得誤認已可供全廠使用。**

## 為什麼要單獨的 Apps Script 專案？
原本「設備報修維修照片影片接收器」含 `RepairDeletionBridge.gs`，其中存在 `repairDeletionGetNasSigningKey()` 這類可由 HTML Service 用 `google.script.run` 呼叫的公開函式。它內部僅透過 `Session.getEffectiveUser()` 判斷是否廠務室帳號。Apps Script 若以部署者身分執行，即使訪客匿名，有效執行身分仍是廠務室。直接將原專案改「任何人」將可能暴露刪除簽章與隔離管理功能。

本版專門做 **上傳**：只有 `doGet`、`drivePilotHealthcheck`、`drivePilotStart`、`drivePilotUploadChunk`、`drivePilotQuery` 五個公開函式，不含任何刪除、觸發器、NAS 簽章或工單改寫函式。這與「公開原專案」的風險有本質差異。

## 你提供的設定與限制
- 使用廠務室帳號執行，Drive 仍保持私人。
- 新程式不硬編碼 Google Drive 根資料夾 ID、工單試算表 ID、廠務室帳號，需填入 Script Properties。
- 後端先確認正式「機修維修單」存在所填 MR，才開始建立分類資料夾。
- 限定照片：JPG/PNG/WEBP/HEIC/HEIF（100MB 以下）；影片：MP4/MOV/M4V/WEBM（500MB 以下）；2 MiB 分段。
- 同一 MR 每小時上傳工作階段上限 30 次；會話 ID 隨機產生，Google OAuth Token 與 Drive 續傳 URI 不回傳到使用者瀏覽器。
- 保留 Drive 檔案 ID、大小、名稱與 MD5 確認；NAS 備份另由 PhotoAgent 驗證。
- **風險保留**：不驗證員工身分，知道有效 MR 編號的人仍可能替該 MR 上傳附件，限制格式及次數只能降低濫用，不是強身分驗證；500 MB 的上傳仍可能遇到 Apps Script 配額與手機連線限制。上線前需有公司資安授權與真實測試。

## 專案檔案
- `Code.gs`：只有附件接收與工單存在性檢查，**沒有員工登入與任何刪除管理**。
- `Bridge.html`：原網站開啟的 Google Apps Script 溝通頁，沒有員工識別碼／授權碼欄位。
- `appsscript.json`：Google Drive、Sheets readonly、UrlFetch、執行帳號相關 OAuth 權限。

## 一次性部署設定（公司核准後）
1. 由廠務室帳號在 Google Apps Script **新建獨立專案** `設備維修附件_純上傳V3.3_測試`。**不能覆蓋目前 V3.1 專案**，也不能把 RepairDeletionBridge.gs 複製進來。
2. 建立 `Code.gs` 和 `Bridge.html`，貼入本資料夾原始碼。專案設定中開啟 `appsscript.json` 並貼上資訊清單。
3. 在「專案設定 → 指令碼屬性」填入：
   - `REPAIR_ATTACH_ROOT_ID`：由管理員填寫現有 PhotoAgent 雲端來源根目錄的 Google Drive 資料夾 ID
   - `REPAIR_FORMAL_SHEET_ID`：正式維修工單 Google 試算表 ID
   - `REPAIR_EXECUTION_EMAIL`：廠務室 Google 帳號
4. 用「部署 → 測試部署作業」取得 `/dev`，以廠務室帳號測試能否開啟。這只測畫面，不會自動建立 MR 或傳 LINE。
5. 待公司核准公開接收模式，從這個**純上傳獨立專案**建立一個版本化 `/exec`；以部署者身分執行，依公司核准情況選擇存取權。**不要對原本含刪除功能的專案開放「任何人」**。
6. 原報修網站 GitHub 的 `repair-drive-bridge.js` 需在獨立測試版本變更接收器 URL 和版本比對：`receiverVersion !== '3.3'`。原網站本身仍應讓員工選附件後直接上傳，不顯示授權表單。**這個前端對接尚未完成，不能直接把程式合併上線**。
7. 一張允許測試且真實存在的 MR 上傳小張圖片、短 MP4，回讀 Drive ID、名稱、大小與 MD5，確認目錄與 NAS PhotoAgent 的 SHA-256，才評估切換正式網站。已刪除的 MR2026111001 不能重用。

## 實際測試（離線模擬）
- 健康檢查不需員工憑證：通過
- MR 格式不合法拒絕：通過
- MR 不在正式清單拒絕：通過
- 照片容量上限限制：通過
- 有效 MR 啟動 Google 續傳：通過
- 無員工授權碼仍可完成模擬 JPEG 上傳，取得 Drive 檔案 ID、大小、MD5：通過
- 無效上傳 Session ID 拒絕：通過
- 只有 5 個公開入口，沒有任何刪除管理函式：通過

**8 項模擬測試通過；真實 Google Apps Script、公司網路、手機照片影片、LINE、NAS 均未測試。**

## 發布策略
此分支僅為可審核的上傳接收器原始碼；**不會擅自改動原正式 Apps Script、LINE 或 NAS**。正式測試與部署要按公司授權和回歸測試進行。