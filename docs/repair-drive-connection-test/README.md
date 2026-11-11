# Google Drive 接收器：管理員唯讀連線測試（V3.1／V3.2）

建立日期：2026-11-11。**尚未發布至 GitHub Pages，也尚未在公司真實手機驗證。**

## 目的
利用現有 Apps Script V3.1、簡化版 Bridge.html V3.2，先驗證「管理員／授權員工登入 + 原網站到接收器的安全通訊 + healthcheck」，不修改正式設備維修網站，不建立任何 MR 工單，不上傳照片影片，不觸發 LINE 或 NAS。

## 程式檔
- `index.html`：唯讀連線測試頁，只接受 Google Apps Script 的 `/dev` 網址。
- `repair-drive-test.js`：獨立測試橋接，僅在 `?drive_upload=1&drive_test=1` 啟動；版本檢查固定 V3.1；**不含正式 /exec 的備援連線**。

## 使用方式（僅在此測試頁已由管理員核准發布於原 GitHub Pages 網域後）
1. 使用廠務室 Google 帳號登入 Chrome，從 Apps Script「部署 → 測試部署作業」取得 V3.1 `/dev` 網址。
2. 開啟 `https://sianyu030.github.io/order_web/repair-drive-connection-test/`，貼入 `/dev` 網址並開始測試。
3. 出現「連接附件接收器」按鈕。它會在新分頁開啟 Google Apps Script 接收器的授權視窗；尚未核發個人代碼時，會顯示授權要求，**不代表程式故障**。
4. 如要驗證真實授權，管理員先在 Apps Script 指令碼屬性加入 `REPAIR_STAFF_IDS_JSON`（已核准人員工號陣列），然後在編輯器執行 `drivePilotAdminProvision`；將產生的個人上傳授權碼以核准的私人管道交付。不要把明文代碼貼入 GitHub、LINE 群組或此測試頁的網址。
5. 授權完成後回本頁點「確認授權與 Drive 連線」。預期顯示「接收器 3.1 已驗證」。如未通過，檢查彈出視窗、Bridge.html、測試部署權限、錯誤訊息。
6. **只有 `/dev` 管理員測試通過後**才安排另一次「照片上傳 → Drive ID/size/MD5 → PhotoAgent → NAS SHA-256」實測。那次需使用經核准的實際 MR 測試資料，不能重用已刪除的 MR2026111001。

## 資安限制
- 目前 Apps Script 「誰可以存取」保持「只有我自己」或僅專案編輯者的 `/dev`，**不得直接改成任何人**。
- 既有 `RepairDeletionBridge.gs` 的公開管理函式可能因執行身分為部署者而被外部人員呼叫，必須在全員開放前完成安全改造與原排程回歸驗證。
- 這裡的 Google /dev 網址僅限 Apps Script 專案編輯者，**不能視為一般員工權限驗收**。
- 即使接收器可讀取 Google Drive，也不代表照片影片已上傳、更不代表 LINE 影片發送與 NAS 已備份。
- 未使用被公司 Symantec 攔截的 AppDeploy。

## 靜態測試
V8 語法與 10 項靜態契約檢查通過；未發布、尚未在 Chrome/Safari、Apps Script 實際授權、Google Drive 或 NAS 進行端到端測試。
