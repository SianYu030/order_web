# PhotoAgent／設備維修中心 V4.492 Google Drive 照片橋接（審核版）

> 2026-11-03。**目前僅存於功能分支，尚未部署或上線，無法宣稱照片已備份到 NAS。**

## 本次改動
- 唯一改動的既有網頁為 `docs/repair-quick-v4-492/index.html`，維持原工單、維修時數、LINE 以及表單 UI。
- 新增 `PHOTO_DRIVE_API_URL`（預設**空白**），空白時繼續走舊照片路徑，正式網站行為不變。
- 設定經核准的 Google Apps Script 網頁應用程式 `/exec` 後，報修與維修照片會先由 Google Drive 橋接接收。瀏覽器採 `no-cors` POST 傳送，再以單次隨機 ID 查詢獨立 JSONP 回執；**沒有成功回執就顯示失敗**，不會把 POST 發出誤報為備份完成。
- Google Drive 寫入按 `年份／年月／MR編號／報修照片|維修照片` 分類，以 SHA-256 檔名防重複，驗證工單存在與照片尺寸。
- 新增 `integration/photoagent-drive/PhotoDriveBridge.gs`，必須使用**公司 Google 帳號**在獨立 Google Apps Script 專案部署，**本 GitHub 專案不能自動代替部署**。

## 已驗證與未驗證
- 程式碼變更已保存於獨立分支，原始正式網站主分支未變動。
- 正式 Google Apps Script、Google Drive 照片儲存、LINE 相片通知和公司 NAS **未實機驗證**。
- V4.492 的 LINE 發送仍使用舊 `PHOTO_API_BASE/line-notify-report`。Drive 的檔案 ID 不等於舊 Relay 照片 ID；**切換到 Drive 後，LINE 照片附檔尚未整合**，不可聲稱已恢復。受公司網路封鎖時，舊 LINE Relay 也可能失敗。
- **72 小時雲端暫存刪除功能尚未啟用。** 尚未完成 NAS 實機核對之前禁止清理。正式試算表及 NAS 資料永不由暫存清理刪除。

## 後端部署條件（未獲准前不可上線）
1. 用公司帳號新增獨立 Apps Script 專案，加入 `PhotoDriveBridge.gs`。
2. 在「專案設定 > 指令碼屬性」配置：
   - `SOURCE_SPREADSHEET_ID`：正式試算表 ID（不可放在公開 GitHub 程式）。
   - `PHOTO_STAGING_FOLDER_ID`：公司 Google Drive 照片暫存資料夾 ID。
   - `PHOTO_BRIDGE_ALLOWED_EMAILS`：測試授權 Google 帳號，以逗號分隔。
   - `PHOTO_BRIDGE_UPLOADS_ENABLED`：**預設 NO**，核准並準備實測後才改為 YES。
3. 測試部署時權限：執行身分為部署擁有人，存取權限先設「僅限自己」，不可直接開放匿名使用。確認公司政策允許且使用者驗證方案可靠，才討論正式開放方式。
4. 執行 Apps Script `pdbEnvironmentCheck()`，應顯示正式試算表與照片暫存資料夾可讀。
5. 將測試部署 `/exec` 網址填入 GitHub 功能分支 V4.492 的 `PHOTO_DRIVE_API_URL` 後，才可試用照片路徑。不得在尚未測試成功前合併至正式主分支。

## 真實驗收流程
1. 用 V4.492 正常建立一張「測試」設備報修單，記下新產生的 MR。
2. 上傳報修照片，必須顯示 Google Drive 寫入成功回執；在該 MR 目錄確認檔案與 SHA-256。
3. 同張 MR 進入維修頁，上傳維修照片；兩類照片必須分開存放。
4. 公司 Windows PhotoAgent 同步兩類照片及當月 Excel 至 NAS。逐一確認來源與 NAS 的 SHA-256 一致。
5. 模擬 NAS 斷線、無回執、圖片格式錯誤、重試重送；所有未驗證照片不得顯示成功，亦不得刪除雲端。
6. 待正式照片顯示來源改為 NAS 或具長期保存機制，且驗證通過後，再設計與審核「NAS 成功後保留 72 小時的暫存清理」。

## 安全註記
- 這個橋接在測試模式使用 **Google 使用者白名單＋預設關閉**，僅供授權帳號進行受控測試。
- 靜態 GitHub 網頁無法安全保管公司密鑰。不得把私人 Google Drive 存取權杖、LINE Token、NAS 密碼或永久上傳密碼寫入 GitHub。
- 若正式場域必須提供多人免登入上傳，必須與既有工單後端建立可驗證的短效授權或採公司認可的身分驗證，不能直接把此 Apps Script 變成公開匿名上傳 API。

## 程式測試紀錄（2026-11-03）
- 前端 `index.html` 與後端 `PhotoDriveBridge.gs`：JavaScript 語法檢查均通過。
- 前端 mock：Google Drive 回執成功、POST 使用 `text/plain` + `no-cors`、持續無回執時正確拒絕，共 3/3 通過。
- 後端 mock：預設關閉禁止寫入、授權帳號成功寫入、相同照片防重、非白名單拒絕、錯誤 MIME 拒絕、工單不存在拒絕、未完成回執回傳 pending，共 7/7 通過。
- 這些是**模擬測試**，不代表真實 Google Drive、手機、公司 Windows 或 NAS 端對端驗收成功。尚未進行部署。


## iPhone Safari 跨網站登入修正（2026-11-03）
- 已在 `PhotoDriveBridge.gs` 新增 Google HTML Service **同網域照片上傳頁**，透過 `google.script.run.pdbUploadFromPage()` 儲存報修／維修照片，避免 GitHub Pages 直接跨站 JSONP 呼叫「僅限自己」Apps Script 失敗。
- 試用版 GitHub 首頁路徑：`docs/repair-quick-v4-493-photo-pilot/`。已改成「前往 Google 照片接收頁」按鈕，可透過 MR 工單編號帶入報修或維修類別；舊照片選取 UI 在試用版暫時隱藏，避免誤以為跨站自動上傳成功。
- **注意：照片會在 Google 頁重新拍攝或選取。** 這是受限制帳號下的暫行測試流程，尚不是完全無跳頁的正式整合。
- 使用者必須在已建立的「PhotoAgent 照片接收」Apps Script 專案用最新 Raw 程式整份覆蓋，然後「部署 > 管理部署作業 > 編輯現有部署 > 版本：新版本 > 部署」，保留原本 `/exec` URL 與「僅限自己」存取權限。
- 同網域上傳頁確認載入後，授權的測試帳號可以設定指令碼屬性 `PHOTO_BRIDGE_UPLOADS_ENABLED=YES` 進行一張測試照片（須使用真實存在的 MR 工單）上傳。切勿改成匿名公開使用。
- 此流程尚未證實 Google Drive 實機照片成功寫入、NAS 複製、LINE 圖片與 72 小時清理；驗收前原 V4.492 不動。
