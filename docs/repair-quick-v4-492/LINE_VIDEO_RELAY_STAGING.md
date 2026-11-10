# 維修中心：LINE 影片通知後端待部署修正
版本：2026-11-10 staging（尚未部署 AppDeploy；不影響正式群組）

## 必要區別
- **安全可用的第一階段**：Google Drive 歸檔成功後，LINE 再傳送 Google Drive 檔案檢視連結。LINE 群組成員須有該 Drive 檔案存取權，檔案不公開分享。
- **LINE 內原生影片播放**：另須可對 LINE 伺服器提供 HTTPS MP4（<=200MB）、JPEG/PNG 預覽圖（<=1MB）、支援 HTTP Range 的穩定媒體伺服器。受保護的 Drive 私人檔案與 15 分鐘簽名連結都不能直接視為已符合條件。現階段**不宣稱支援原生影片播放**。
- 目前正式的 AppDeploy「Repair Photo Relay」尚未支援本檔的新 API。請勿單獨合併前端變更至正式站點。

## AppDeploy backend/index.ts 增量 A
在既有 `POST /api/line-notify-report` 成功 `pushLineMessages(messages)` 之後、成功回傳之前加入：

```ts
      // One-time capability for a subsequent verified Drive video link.
      // Do not create a link or notify LINE before media is actually uploaded.
      let videoLinkTicket = '';
      try {
        const id = crypto.randomUUID();
        const [saved] = await storage.write([{
          path: 'line-video-tickets/' + id + '.json',
          content: JSON.stringify({
            orderNo,
            expiresAt: Date.now() + 24 * 60 * 60 * 1000,
          }),
          contentType: 'application/json',
        }]);
        if (saved) videoLinkTicket = id;
      } catch (err) {
        console.error('[line-video-ticket] create failed', err);
      }
```

原本的 `json({ok:true,sent:true,textSent:true,imageCount:imageUrls.length})` 加入 `videoLinkTicket` 欄位：

```ts
          videoLinkTicket,
```

**原本 LINE 文字與圖片傳送成功，即使建立票證失敗，也應正常回報成功。**

## AppDeploy backend/index.ts 增量 B
在 `router({...})` 中新增下列兩個路由，不修改既有 `/api/upload`（它是圖片與 NAS PhotoAgent 專用服務）：

```ts
  'OPTIONS /api/line-notify-video-link': [
    async () => ({ statusCode: 204, headers: CORS_HEADERS, body: '' }),
  ],
  'POST /api/line-notify-video-link': [
    async ({ body }) => {
      const payload = (body || {}) as {
        orderNo?: string;
        driveFileId?: string;
        videoLinkTicket?: string;
      };
      const orderNo = String(payload.orderNo || '').trim().toUpperCase();
      const fileId = String(payload.driveFileId || '').trim();
      const ticket = String(payload.videoLinkTicket || '').trim();
      if (!/^MR\d{10}$/.test(orderNo) ||
          !/^[A-Za-z0-9_-]{20,128}$/.test(fileId) ||
          !/^[0-9a-f-]{36}$/i.test(ticket)) {
        return withCors(error('影片連結通知資料格式不正確', 400));
      }

      const ticketPath = 'line-video-tickets/' + ticket + '.json';
      const [row] = await storage.read([ticketPath]);
      if (!row?.content) return withCors(error('影片通知授權票證不存在或已使用', 403));
      let tokenData: {orderNo: string; expiresAt: number};
      try { tokenData = JSON.parse(row.content); }
      catch { return withCors(error('影片通知票證損壞', 403)); }
      if (tokenData.orderNo !== orderNo || tokenData.expiresAt < Date.now()) {
        return withCors(error('影片通知票證無效或逾期', 403));
      }

      const sentPath = 'line-video-sent/' + orderNo + '_' + fileId + '.json';
      const [oldSent] = await storage.read([sentPath]);
      if (oldSent?.content) {
        await storage.delete([ticketPath]).catch(() => []);
        return withCors(json({ok:true,sent:true,alreadySent:true}));
      }

      const link = 'https://drive.google.com/file/d/' + fileId + '/view';
      const message =
        '🎥【設備維修影片】\n' +
        '🧾 工單：' + orderNo + '\n' +
        '🔒 需使用有檔案權限的公司 Google 帳號開啟：\n' + link;
      const result = await pushLineMessages([{type:'text',text:message}]);
      if (!result.ok) {
        return withCors(error(result.error || 'LINE 影片連結傳送失敗',
          result.status || 500));
      }
      const [recorded] = await storage.write([{
        path: sentPath,
        content: JSON.stringify({orderNo,fileId,sentAt:new Date().toISOString()}),
        contentType:'application/json',
      }]);
      await storage.delete([ticketPath]).catch(() => []);
      return withCors(json({ok:true,sent:true,alreadySent:false,
        statusRecorded:recorded===true}));
    },
  ],
```

## 驗收與限制
1. 先在 AppDeploy 的非正式版本或隔離測試後端驗證，確認不觸發正式 LINE 群組。
2. 既有 `POST /api/line-notify-report` 必須照常回傳 `imageCount`，並額外有 `videoLinkTicket`。
3. 新端點拒絕不合法 MR、Drive ID、遺失/逾期票證；成功只送一次含工單號與私人 Drive 網址的文字通知。
4. 手機上傳影片之前先驗證 Drive 接收器，若連線失敗，尚未建立新 MR。
5. 失敗時不能宣稱影片已到 LINE；LINE 原報修文字及照片不能重送。
6. 驗證 Google Drive 實際存在檔案；NAS PhotoAgent 備份另行驗證。LINE 群組內檢視連結需公司帳號權限。
7. 目前 ticket 只證明是同一張原始 LINE 通知衍生的後續請求，**沒有由 AppDeploy 端獨立驗證 Google Drive fileId 真實歸屬**。正式開放前應由 Drive 接收器提供簽章回執或透過 Drive API 核實。
8. 同時請求的極端情況仍可能導致重複 LINE 通知，需以原子鎖或具條件寫入處理才可宣稱完全冪等。

原版 URL 為 `docs/repair-quick-v4-492/`；此 staging 不能單獨上線。
