# 設備維修中心：全員 Google Drive 接收器 v3.0（隔離測試）

日期：2026-11-10  
來源：既有 V4.492 `repair-drive-bridge.js` 與舊 Google Apps Script 接收器 v2.1；**未讀取任何正式 Apps Script 專案的最新部署原始碼**。

## 本次解決的問題

先前接收器設定 `Execute as me + Only myself` 且以 `Session.getActiveUser().getEmail()` 限定廠務室，這只能由部署者使用，不能供 E3、E4、W8 全廠人員直接使用。

新設計將權限分兩層：

1. Google Apps Script **以廠務室帳號執行**，僅它對私人 Google Drive 擁有寫入權限。
2. 每位授權員工以自己的識別碼及獨立的 20 位隨機上傳碼取得最長 4 小時暫存會話。員工不需要廠務室 Google 密碼、也不會拿到 Google OAuth token。

網站仍使用既有 MR 流程；上傳前驗證有效員工會話，後端再查正式「機修維修單」是否存在對應 MR，才建立 `YYYY/YYYY-MM/MR工單/附件分類` 目錄。照片 100 MB、影片 500 MB、每分段 2 MiB，遵循既有接收器限制。

## 已製作檔案

- `Code.gs`：既有 Drive 續傳接收器，改為全 RPC 必須帶員工授權，並嚴格確認正式 MR 存在；移除原測試 MR 免驗證例外。
- `StaffAuth.gs`：員工授權碼、錯誤次數限制、4 小時會話，以及僅供 Apps Script 編輯者手動執行的授權碼核發／重設函式。
- `Bridge.html`：員工授權視窗，僅與 `https://sianyu030.github.io` 的開啟頁面溝通，不傳出個人上傳碼或 Google OAuth Token。
- 網站 `index.html`：在有附件時，先檢查接收器可用，再建立 MR。
- 網站 `repair-drive-bridge.js`：準備 v3.0 連線與員工登入入口。

## **安全部署門檻：不能直接上正式環境**

1. 先由公司 IT / 資安同意 Google Apps Script 網頁應用程式的對外可用範圍，禁止繞過 Symantec 或自行建立未授權公開入口。
2. 在廠務室帳號下建立**獨立測試 Apps Script 專案**，不要覆寫正式的 `Webhook.gs`、`doGet` 或既有 LINE 服務。分別新增 `Code.gs`、`StaffAuth.gs`、`Bridge.html`。
3. 專案需要 Google Drive、Sheets、外部 UrlFetch 的授權，所有 OAuth 都只在 Apps Script 後端使用。以「我（部署者）」執行；存取權需依 IT 核准的範圍設定。私人 Gmail 帳號若要讓沒有相同 Google 帳號的員工存取，可能需要「任何人（含匿名）」網頁入口，**務必先通過公司的資安評估，單靠上傳碼不能取代企業級身分系統**。
4. 核准後在「指令碼屬性」輸入 `REPAIR_STAFF_IDS_JSON`，例如 `["H03109","T0012"]`。在編輯器以廠務室帳號手動執行 `drivePilotAdminProvision_`，將一次性產生的每人上傳碼透過公司核准管道個別發送，清除含敏感上傳碼的執行日誌。不可以把代碼寫入 GitHub、前端 JS、群組或聊天。
5. 由管理員取得新部署 `/exec`，設定至 GitHub 測試分支 `repair-drive-bridge.js` 的 `RECEIVER_EXEC`。**目前刻意留空**，避免錯誤連回舊版限擁有者接收器。只在 `?drive_upload=1` 測試模式啟用，切勿直接合併 main。
6. 使用獨立一般員工帳號（不是廠務室 Google 帳號）測試授權視窗：未登入拒絕、錯誤碼拒絕、正確員工碼通過、授權過期拒絕、工作階段不能跨員工操作。
7. 使用**經核准且存在的測試 MR**進行照片與 MP4 上傳。驗收要實際讀回 Google Drive 檔案 ID、檔案長度、MD5，並查目錄是否符合 PhotoAgent V8。刪除的 MR2026111001 **不得被重新使用或允許上傳**。
8. 由 rw-6109 的既有 PhotoAgent 做 G: → NAS 單次同步與 SHA-256 一致性核對，確認成功後才討論排程。雲端不能因為 LINE 成功就被刪除。
9. 最後才評估切換正式網頁、移除 `?drive_upload=1` 限制，並在公司核准的後端獨立移除 AppDeploy 的 LINE 依賴。

## 本次驗證結果

- 四個程式檔在 JavaScript V8 語法解析：**通過**。
- 使用離線模擬測試：未登入呼叫 health 被拒、錯誤授權碼被拒、未知員工被拒、核發一筆測試員工成功。
- 但尚未取得正式 Apps Script 專案編輯／部署工具，也**尚未測試 Google Apps Script 的登入視窗跨網域 postMessage 是否被手機 Safari 的沙盒或公司網路阻擋**；Google Drive 寫入及 NAS 真實測試未完成。
- AppDeploy LINE 後端依然是公司已封鎖來源。本次僅解決員工附件接收器，不宣稱 LINE 已恢復。
- 正式 GitHub `main`、正式 Google Drive 檔案與 LINE 群組：**沒有更動**。

## 已知風險與進一步改善

- 若公司需要讓員工完全無感登入，應由 IT 整合真正的公司 SSO／身分提供者，不應以報修人下拉選單當作身分驗證。
- Apps Script 服務配額、單次執行時間及手機長影片分段傳送，需要實際驗證；不得宣稱所有 500MB 影片都已支援完成。
- 員工個別上傳碼為過渡方案；正式方案應再補齊管理員代碼撤銷操作、完整稽核記錄及更嚴格的濫用偵測。
- Google HTML Service 常以 iframe 沙盒執行，本版 popup 的 opener 通訊仍需在公司手機瀏覽器實測。驗收失敗不可改用被公司封鎖的中繼服務。
