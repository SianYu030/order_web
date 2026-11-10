# 同一個 Apps Script 專案中加入 V3 全員附件接收器
日期：2026-11-10
狀態：草稿、未部署。維持目前 V2.3 正式接收器與 RepairDeletionBridge.gs 完全不動。

## 必須先知道
畫面顯示的專案「設備報修維修照片影片接收器」目前有：
- 程式碼.gs：V2.3，已有 doGet、drivePilotAuthorize_、分段上傳等
- Bridge.html：舊版配對畫面
- RepairDeletionBridge.gs：既有工單刪除橋接

**不能把另一份 V3 的 Code.gs 全部貼上覆蓋程式碼.gs，也不能覆蓋 Bridge.html。**
本修正使用全新的命名空間 `staffV3...`，舊版檔案只需增加一行分流。

## 要加的檔案（同一專案）
1. Apps Script 左側「檔案 + → 指令碼」→ 名稱 `StaffReceiverV3`（不要加第二個 `.gs`），貼入本資料夾 `StaffReceiverV3.gs`。
2. 「檔案 + → HTML」→ 名稱 `StaffUploadV3`，貼入 `StaffUploadV3.html`。
3. 到 **原來的** `程式碼.gs` 找到 `function doGet(e) {`，只在左括號下一行插入：
   ```js
   if (e && e.parameter && e.parameter.staffV3 === '1') return staffV3Landing_(e);
   ```
   原本 doGet 其他內容全部保留。沒有第二個 doGet，且不影響既有 Bridge.html 與 RepairDeletionBridge.gs。
4. 儲存，不要修改原本已使用的正式部署，也不要變更原部署的存取設定。
5. 從 Apps Script 編輯器的函式清單執行 `staffV3AdminPreflight_`：唯讀驗證廠務室授權、原私人 Drive 資料夾及正式「機修維修單」。失敗時先看詳細錯誤，勿在不明原因下修改部署存取權。
6. 若預檢通過，在「部署 → 測試部署」取得 `/dev`，管理員以 `?staffV3=1` 測試；此網址只有專案編輯者可以使用，不是全員測試網址。

## 絕對不能直接把這個專案部署為「所有人」的原因
原始 `程式碼.gs` V2.3 內的 `drivePilotAuthorize_()` 使用 `Session.getEffectiveUser().getEmail()` 確認廠務室帳號。Google 官方文件規定 Web App 以部署者身分執行時，執行者對所有訪客都是部署者；也就是說**單靠該檢查不能驗證訪客**。

新部署即使加入 V3，**舊版公用函式仍存在於同一份新程式版本**，而 `RepairDeletionBridge.gs` 的完整邏輯目前無法從畫面讀出。不審查舊的公開 RPC、刪除函式，就不能安全改為「任何人」，也不能認定 V3 代碼有保護整份專案。

**阻擋門檻**：在檢查完整的 V2.3 `程式碼.gs`、`Bridge.html` 和 `RepairDeletionBridge.gs` 之後，替所有舊版瀏覽器可直接呼叫的讀取／寫入／刪除函式補上有效權限驗證，或在新的版本中阻止舊函式執行，並提供管理員專用且經驗證的刪除流程。公司 IT 批准可存取範圍後，才能額外建立一個員工測試部署。

## 兩個不同測試網址
- 原正式部署 `/exec`：**維持原版本與原網址，不變更。**
- 同專案的新部署 `/exec`：使用新版本，獨立網址，僅供核准的全員存取測試。可以同一專案保留多個啟用中部署；絕不編輯原部署指向的版本。
- 新部署的員工測試入口：`新部署的/exec?staffV3=1`。目前**沒有部署網址**，不可自行猜測。
- 對管理員而言 `/dev?staffV3=1` 可先做頁面與授權診斷，但無法代表一般員工已通過。

## V3 邏輯
- 不讓員工使用廠務室 Google 密碼，不公開私人 Drive。
- 個別高強度員工上傳碼與四小時授權暫存，所有上傳 RPC 皆必須驗證。
- 不信任前端輸入的 MR：後端先查正式「機修維修單」存在性。
- 2 MiB 分段續傳，檔案寫入後核對 Drive 回傳之 ID、大小、MD5。
- 新增專用 `StaffUploadV3.html`，先獨立測試員工授權與照片／短影片上傳，不依賴原網站的 popup。
- 原工單、LINE、照片及 NAS 備份邏輯未修改。
- 刪除過的 MR2026111001 不可再次用於測試。

## 核發測試員工授權碼
管理員於此 Apps Script 的「專案設定 → 指令碼屬性」加入：
`STAFF_V3_IDS_JSON` 設定為例如 `["H03109"]`（這僅是格式示例，應使用實際獲准員工識別碼）。
在編輯器手動執行 `staffV3AdminProvision_`，產生一次性專屬上傳碼，採公司核准方式私下交付；切勿貼到 GitHub 或 LINE 群組、聊天，不要把含明碼的記錄公開。

## 驗收標準（尚未完成）
1. 非授權身分不能讀／上傳／刪除資料；原 V2.3 舊功能不得被新部署變成無驗證可呼叫。
2. 一般員工可在核准的 Safari／Chrome 網路與瀏覽器登入。
3. 一張有授權且真實存在的測試 MR：照片和 MP4 都可上傳；Drive 資料夾、大小與 MD5 可核對。
4. G: → PhotoAgent → NAS 需 SHA-256 相符、回執清楚，才算備份成功。
5. 原正式部署與 `RepairDeletionBridge.gs` 無功能回歸。
6. 所有測試通過之後再把新功能接回 GitHub 既有報修網頁。

## 實際進度
已生成獨立命名空間的 Apps Script 程式及獨立 HTML。基於目前已取得的 V2.1 源碼與 V2.3 截圖製作，**沒有讀到目前專案的完整三份檔案，也沒有直接寫入 Google Apps Script**。不能聲稱正式測試已通過。
