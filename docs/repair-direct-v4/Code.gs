/**
 * 設備維修附件接收器 V4.0（獨立純附件後端，表單 POST + 唯讀 JSONP 回執；尚未部署）。
 * 只限經公司核准之獨立附件接收專案；不得與工單刪除及 NAS 簽章函式共同部署。
 * Does NOT alter formal tickets, NAS, LINE, or the existing photo relay.
 * Drive API resumable sessions are retained server-side; NEVER return their URI or OAuth token to browser.
 */
const REPAIR_DRIVE_PILOT = Object.freeze({
  ROOT_FOLDER_ID: PropertiesService.getScriptProperties().getProperty('REPAIR_ATTACH_ROOT_ID'),
  // No staff identity form; upload is restricted to verified MR and a random media session.
  FORMAL_SHEET_ID: PropertiesService.getScriptProperties().getProperty('REPAIR_FORMAL_SHEET_ID'),
  FORMAL_SHEET_NAME: '機修維修單',
  MAX_PHOTO_BYTES: 100 * 1048576,
  MAX_VIDEO_BYTES: 500 * 1048576,
  CHUNK_BYTES: 2 * 1048576,   // 2 MiB, multiple of 256 KiB
  SESSION_MAX_AGE_MS: 24 * 60 * 60 * 1000,
  FOLDER_NAME: '', // 直接使用現有 PhotoAgent 掃描的雲端來源根目錄
  TYPES: ['報修照片','維修照片','報修影片','維修影片']
});

/**
 * Cross-origin transport for original GitHub Pages repair center.
 * A browser's ordinary HTML form POST is sent into a hidden iframe (no CORS fetch).
 * A separate read-only JSONP receipt retrieves confirmation. Never trust iframe.onload.
 * This project MUST NOT contain RepairDeletionBridge.gs or other admin APIs.
 * Only publish after company IT approves the independent execute-as-owner endpoint.
 */
const DIRECT_V4 = Object.freeze({
  VERSION:'4.0',
  RECEIPT_TTL_SECONDS:600,
  PROCESSING_TTL_SECONDS:90,
  MAX_B64_CHARS:Math.ceil(REPAIR_DRIVE_PILOT.CHUNK_BYTES * 4/3)+32
});
function directJsonp_(data,callback) {
  const name=String(callback||'');
  if(!/^repairDirect_[a-f0-9]{32}$/.test(name)){
    return ContentService.createTextOutput('invalid callback').setMimeType(ContentService.MimeType.TEXT);
  }
  return ContentService.createTextOutput(name+'('+JSON.stringify(data)+');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function doGet(e) {
  const p=e&&e.parameter||{};
  try {
    if(p.op==='health'){
      drivePilotConfig_();
      // Verify owner Drive / Sheet access without exposing folder names or file IDs.
      DriveApp.getFolderById(REPAIR_DRIVE_PILOT.ROOT_FOLDER_ID).getName();
      if(!SpreadsheetApp.openById(REPAIR_DRIVE_PILOT.FORMAL_SHEET_ID).getSheetByName(REPAIR_DRIVE_PILOT.FORMAL_SHEET_NAME))
        throw new Error('維修工單表無法讀取');
      return directJsonp_({ok:true,version:DIRECT_V4.VERSION,testOnly:false,
        maxPhotoMb:100,maxVideoMb:500,chunkBytes:REPAIR_DRIVE_PILOT.CHUNK_BYTES},p.prefix);
    }
    if(p.op==='receipt' && /^[0-9a-f-]{36}$/i.test(String(p.rid||''))){
      const cached=CacheService.getScriptCache().get('direct_v4_'+p.rid);
      // Only random request IDs are accepted. Receipts never include Google tokens.
      return directJsonp_(cached?JSON.parse(cached):{pending:true},p.prefix);
    }
    return directJsonp_({ok:false,error:'不允許的讀取操作'},p.prefix);
  }catch(err){return directJsonp_({ok:false,error:'Google Drive 接收器暫時無法讀取'},p.prefix);}
}
function directReceipt_(rid,result) {
  CacheService.getScriptCache().put('direct_v4_'+rid,JSON.stringify(result),DIRECT_V4.RECEIPT_TTL_SECONDS);
}
function directDispatch_(p) {
  if(p.action==='start'){
    if(typeof p.meta!=='string'||p.meta.length>1500)throw new Error('附件資訊過長');
    return drivePilotStart_(JSON.parse(p.meta));
  }
  if(p.action==='chunk'){
    const offset=Number(p.offset);
    if(!Number.isSafeInteger(offset)||offset<0)throw new Error('附件位置錯誤');
    if(typeof p.base64!=='string'||p.base64.length>DIRECT_V4.MAX_B64_CHARS)
      throw new Error('附件分段過長');
    return drivePilotUploadChunk_(p.sessionId,offset,p.base64);
  }
  if(p.action==='query'){
    return drivePilotQuery_(p.sessionId);
  }
  throw new Error('附件操作不允許');
}
function doPost(e) {
  const p=e&&e.parameter||{};
  const rid=String(p.rid||'');
  // IMPORTANT: never process an anonymous POST without a random request receipt.
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rid))
    return ContentService.createTextOutput('invalid request id').setMimeType(ContentService.MimeType.TEXT);
  const cache=CacheService.getScriptCache();
  const key='direct_v4_'+rid;
  const existing=cache.get(key);
  if(existing) return ContentService.createTextOutput('ack').setMimeType(ContentService.MimeType.TEXT);
  // A short pending sentinel reduces accidental concurrent duplicate POST work.
  // A blocked iframe does not imply the POST was not processed; browser MUST poll receipt.
  cache.put(key,JSON.stringify({pending:true}),DIRECT_V4.PROCESSING_TTL_SECONDS);
  let result;
  try {
    drivePilotConfig_();
    const data=directDispatch_(p);
    result={ok:true,result:data};
  }catch(err) {
    const reason=String(err&&err.message||err).slice(0,200);
    result={ok:false,error:reason};
  }
  directReceipt_(rid,result);
  return ContentService.createTextOutput('ack').setMimeType(ContentService.MimeType.TEXT);
}

function drivePilotConfig_(){
  if(!REPAIR_DRIVE_PILOT.ROOT_FOLDER_ID||!REPAIR_DRIVE_PILOT.FORMAL_SHEET_ID)
    throw new Error('接收器尚未設定 Drive 根目錄及正式維修工單表');
  const expected=String(PropertiesService.getScriptProperties().getProperty('REPAIR_EXECUTION_EMAIL')||'').toLowerCase().trim();
  const actual=String(Session.getEffectiveUser().getEmail()||'').toLowerCase().trim();
  if(!expected||actual!==expected)throw new Error('接收器執行帳號未通過核對');
}
function drivePilotThrottle_(mr){
  // Per-MR abuse guard. This is not employee identity verification.
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(4000))throw new Error('附件接收忙碌，請稍後重試');
  try{
    const cache=CacheService.getScriptCache();
    const key='upload_count_v4_'+mr;
    const count=Number(cache.get(key)||0);
    if(count>=30)throw new Error('此工單短時間內附件數量過多，請稍後重試');
    cache.put(key,String(count+1),3600);
  }finally{lock.releaseLock();}
}
function drivePilotHealthcheck_() {
  drivePilotConfig_();
  return {
    ok: true, receiverVersion:'4.0',
    root:DriveApp.getFolderById(REPAIR_DRIVE_PILOT.ROOT_FOLDER_ID).getName(),
    maxPhotoMb:100, maxVideoMb:500, chunkMb:2,
    formalOrdersChanged:false, nasCopied:false, testOnly:false
  };
}
function drivePilotCheckFormalMr_(mr) {
  const ss=SpreadsheetApp.openById(REPAIR_DRIVE_PILOT.FORMAL_SHEET_ID);
  const sheet=ss.getSheetByName(REPAIR_DRIVE_PILOT.FORMAL_SHEET_NAME);
  if (!sheet) throw new Error('找不到正式機修維修單工作表，拒絕附件上傳');
  const last=sheet.getLastRow();
  if(last < 2) throw new Error('正式工單尚未建立，拒絕附件上傳：'+mr);
  const idCells=sheet.getRange(2,1,last-1,1).getDisplayValues();
  if(!idCells.some(row=>String(row[0]||'').trim().toUpperCase()===mr))
    throw new Error('正式機修維修單找不到 '+mr+'；請先確認報修工單已寫入');
}
function drivePilotFolder_(parent, name) {
  const files = parent.getFoldersByName(name);
  if (files.hasNext()) {
    const folder = files.next();
    if (files.hasNext()) throw new Error('存在重複資料夾：' + name);
    return folder;
  }
  return parent.createFolder(name);
}
function drivePilotFormat_(name, head) {
  const lower = String(name || '').toLowerCase();
  const ext = (lower.match(/\.([a-z0-9]+)$/) || [])[1] || '';
  const b = (i) => (head[i] || 0) & 255;
  const ascii = (from, count) => String.fromCharCode.apply(null, head.slice(from,from+count).map(x=>x&255));
  const jpg=b(0)===255&&b(1)===216&&b(2)===255;
  const png=b(0)===137&&ascii(1,3)==='PNG';
  const webp=ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP';
  const ftyp=ascii(4,4)==='ftyp';
  const ebml=b(0)===0x1a&&b(1)===0x45&&b(2)===0xdf&&b(3)===0xa3;
  const isoBrand=ascii(8,4).toLowerCase();
  if (jpg&&['jpg','jpeg'].includes(ext)) return {ext:'jpg',mime:'image/jpeg',video:false};
  if (png&&ext==='png') return {ext:'png',mime:'image/png',video:false};
  if (webp&&ext==='webp') return {ext:'webp',mime:'image/webp',video:false};
  if (ftyp&&['heic','heif'].includes(ext)&&/^(heic|heix|hevc|hevx|mif1|msf1)$/i.test(isoBrand))
    return {ext:ext,mime:ext==='heic'?'image/heic':'image/heif',video:false};
  if (ftyp&&['mp4','m4v','3gp'].includes(ext))
    return {ext:ext,mime:ext==='3gp'?'video/3gpp':'video/mp4',video:true};
  // QuickTime MOV: ISO ftyp or QuickTime atom at bytes 4-7.
  if (ext==='mov'&&(ftyp||['moov','mdat','wide','free'].includes(ascii(4,4))))
    return {ext:'mov',mime:'video/quicktime',video:true};
  if (ebml&&['webm','mkv'].includes(ext))
    return {ext:ext,mime:ext==='webm'?'video/webm':'video/x-matroska',video:true};
  throw new Error('檔案格式與實際內容不符，允許 JPG／PNG／WEBP／HEIC／HEIF 或 MP4／MOV／M4V／3GP／WEBM／MKV。');
}
function drivePilotGetSession_(id) {
  if (!/^[a-f0-9-]{36}$/i.test(String(id||''))) throw new Error('無效的上傳識別碼');
  const raw=PropertiesService.getScriptProperties().getProperty('upload_'+id);
  if (!raw) throw new Error('找不到上傳工作階段，請重新開始');
  const s=JSON.parse(raw);
  if (Date.now()-s.created>REPAIR_DRIVE_PILOT.SESSION_MAX_AGE_MS)
    throw new Error('上傳工作階段已超過 24 小時，請重新開始');
  return s;
}
function drivePilotSetSession_(id,s) {
  PropertiesService.getScriptProperties().setProperty('upload_'+id, JSON.stringify(s));
}
function drivePilotResponseHeader_(response,key) {
  const headers=response.getAllHeaders();
  for (const k in headers) if(k.toLowerCase()===key.toLowerCase()) return String(headers[k]);
  return '';
}
function drivePilotDriveError_(response,verb) {
  return verb+'失敗（HTTP '+response.getResponseCode()+'）：'+String(response.getContentText()||'').slice(0,260);
}
function drivePilotQueryDrive_(s) {
  const response=UrlFetchApp.fetch(s.uploadUrl,{
    method:'put',headers:{'Content-Range':'bytes */'+s.size,Authorization:'Bearer '+ScriptApp.getOAuthToken()},
    payload:'',followRedirects:false,muteHttpExceptions:true
  });
  const code=response.getResponseCode();
  if (code===308) {
    const m=/^bytes=0-(\d+)$/i.exec(drivePilotResponseHeader_(response,'Range'));
    s.offset=m?Number(m[1])+1:0;
    return {complete:false,offset:s.offset};
  }
  if (code===200||code===201) {
    const meta=JSON.parse(response.getContentText()||'{}');
    return {complete:true,meta:meta};
  }
  if (code===404) throw new Error('Google Drive 續傳連線已過期，請重新開始');
  throw new Error(drivePilotDriveError_(response,'查詢續傳狀態'));
}
function drivePilotFinalize_(id,s,meta) {
  if (!meta.id) throw new Error('Google Drive 未回傳檔案 ID，無法確認已完成');
  // MD5 is generated by Drive for binary objects; NAS copy will use independent SHA-256.
  const r=UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(meta.id)+'?fields=id,name,size,md5Checksum,mimeType',{
    headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true
  });
  if(r.getResponseCode()!==200) throw new Error(drivePilotDriveError_(r,'雲端寫入後驗證'));
  const verify=JSON.parse(r.getContentText()||'{}');
  if(Number(verify.size)!==s.size || !verify.md5Checksum || verify.name!==s.fileName) {
    throw new Error('Drive 已收到資料，但檔案大小、名稱或 MD5 尚無法核對；請先查驗雲端檔案，不要重複上傳');
  }
  s.complete=true;
  s.offset=s.size;
  s.fileId=verify.id;
  s.md5=verify.md5Checksum;
  drivePilotSetSession_(id,s);
  return drivePilotPublicState_(id,s);
}
function drivePilotPublicState_(id,s) {
  return {
    ok:true,sessionId:id,complete:!!s.complete,offset:s.offset,size:s.size,
    fileId:s.fileId||'',fileName:s.fileName,md5:s.md5||'',
    testOnly:false,nasCopied:false
  };
}
/** Begin one Drive API resumable session. OAuth token and upload URL remain server-side. */
function drivePilotStart_(info) {
  drivePilotConfig_();
  if(!info||typeof info!=='object') throw new Error('缺少附件資訊');
  const mr=String(info.orderNo||'').trim().toUpperCase();
  const kind=String(info.mediaKind||'').trim();
  const name=String(info.name||'');
  const size=Number(info.size);
  if (!/^MR20\d{8}$/.test(mr)) throw new Error('MR 工單編號格式錯誤');
  // 一定要以正式工單清單確認來源，不能僅依前端傳入的工單編號。
  drivePilotCheckFormalMr_(mr);
  drivePilotThrottle_(mr);
  if(!REPAIR_DRIVE_PILOT.TYPES.includes(kind)) throw new Error('附件分類錯誤');
  if(!Number.isSafeInteger(size)||size<=0) throw new Error('檔案容量錯誤');
  if(name.length<3||name.length>180||/[\\/\x00-\x1f]/.test(name)) throw new Error('檔名不合法');
  const max=kind.endsWith('影片')?REPAIR_DRIVE_PILOT.MAX_VIDEO_BYTES:REPAIR_DRIVE_PILOT.MAX_PHOTO_BYTES;
  if(size>max) throw new Error('超過上限 '+Math.floor(max/1048576)+' MB');
  const ext=(name.toLowerCase().match(/\.([a-z0-9]+)$/)||[])[1]||'';
  const images=['jpg','jpeg','png','webp','heic','heif'];
  const videos=['mp4','mov','m4v','webm']; // 對齊目前 PhotoAgent V8 可識別格式
  if(!(kind.endsWith('影片')?videos:images).includes(ext)) throw new Error('附件分類與副檔名不符合');
  const mimeByExt={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif',mp4:'video/mp4',mov:'video/quicktime',m4v:'video/mp4','3gp':'video/3gpp',webm:'video/webm',mkv:'video/x-matroska'};
  const mime=mimeByExt[ext];
  const root=DriveApp.getFolderById(REPAIR_DRIVE_PILOT.ROOT_FOLDER_ID);
  const month=mr.slice(2,6)+'-'+mr.slice(6,8);
  // 必須符合 PhotoAgent V8：來源根目錄／YYYY／YYYY-MM／MR工單／附件分類。
  const year=mr.slice(2,6);
  const dir=drivePilotFolder_(drivePilotFolder_(drivePilotFolder_(drivePilotFolder_(root,year),month),mr),kind);
  const id=Utilities.getUuid();
  const safeName=mr+'_'+kind+'_relay_'+id+'_'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd_HHmmss')+'.'+ext;
  const response=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,md5Checksum,mimeType',{
    method:'post',contentType:'application/json; charset=UTF-8',
    headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken(),'X-Upload-Content-Type':mime,'X-Upload-Content-Length':String(size)},
    payload:JSON.stringify({name:safeName,parents:[dir.getId()],mimeType:mime,description:'PhotoAgent 公司維修系統附件測試 '+mr+' '+kind}),
    followRedirects:false,muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200)throw new Error(drivePilotDriveError_(response,'建立續傳工作階段'));
  const uploadUrl=drivePilotResponseHeader_(response,'Location');
  if(!/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?/.test(uploadUrl))
    throw new Error('Google 未回傳可驗證的續傳網址');
  const s={created:Date.now(),uploadUrl:uploadUrl,offset:0,size:size,mime:mime,ext:ext,
    orderNo:mr,mediaKind:kind,fileName:safeName,complete:false};
  drivePilotSetSession_(id,s);
  return drivePilotPublicState_(id,s);
}
/** Upload exactly one chunk. 2 MiB except the final chunk. */
function drivePilotUploadChunk_(id,offset,base64) {
  drivePilotConfig_();
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000)) throw new Error('其他傳輸正在進行，稍後重試');
  try {
    const s=drivePilotGetSession_(id);
    // Random 128-bit session ID authorizes only this in-progress attachment.
    if(s.complete)return drivePilotPublicState_(id,s);
    if(!Number.isSafeInteger(offset)||offset<0||offset!==s.offset)
      throw new Error('分段位置不一致，請查詢雲端實際進度再繼續');
    if(typeof base64!=='string'||base64.length>Math.ceil(REPAIR_DRIVE_PILOT.CHUNK_BYTES*4/3)+8)
      throw new Error('分段資料容量錯誤');
    const bytes=Utilities.base64Decode(base64);
    const end=offset+bytes.length;
    if(!bytes.length||bytes.length>REPAIR_DRIVE_PILOT.CHUNK_BYTES||end>s.size)
      throw new Error('分段資料長度錯誤');
    if(end<s.size&&bytes.length!==REPAIR_DRIVE_PILOT.CHUNK_BYTES)
      throw new Error('只有最後一段可小於 '+REPAIR_DRIVE_PILOT.CHUNK_BYTES+' bytes');
    if(offset===0) {
      const detected=drivePilotFormat_(s.fileName,bytes.slice(0,32));
      if(detected.video!==s.mediaKind.endsWith('影片'))throw new Error('影片／照片分類與檔案內容不相符');
      if(detected.mime!==s.mime)throw new Error('副檔名與檔案格式不相符');
    }
    const response=UrlFetchApp.fetch(s.uploadUrl,{
      method:'put',contentType:s.mime,payload:bytes,
      headers:{'Content-Range':'bytes '+offset+'-'+(end-1)+'/'+s.size,Authorization:'Bearer '+ScriptApp.getOAuthToken()},
      followRedirects:false,muteHttpExceptions:true
    });
    const code=response.getResponseCode();
    if(code===308) {
      const m=/^bytes=0-(\d+)$/i.exec(drivePilotResponseHeader_(response,'Range'));
      const confirmed=m?Number(m[1])+1:0;
      if(confirmed>end)throw new Error('Google 回報進度超出本次區塊，已停止');
      s.offset=confirmed;
      drivePilotSetSession_(id,s);
      return drivePilotPublicState_(id,s);
    }
    if(code===200||code===201)return drivePilotFinalize_(id,s,JSON.parse(response.getContentText()||'{}'));
    if(code===404)throw new Error('Google 上傳工作階段失效，請重新開始');
    throw new Error(drivePilotDriveError_(response,'上傳分段'));
  } finally {lock.releaseLock();}
}
/** Recover position after a network timeout; don't replay an already received chunk. */
function drivePilotQuery_(id) {
  drivePilotConfig_();
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))throw new Error('正在處理其他分段，請稍後查詢');
  try {
    const s=drivePilotGetSession_(id);
    // Random 128-bit session ID authorizes only this in-progress attachment.
    if(s.complete)return drivePilotPublicState_(id,s);
    const remote=drivePilotQueryDrive_(s);
    if(remote.complete)return drivePilotFinalize_(id,s,remote.meta);
    drivePilotSetSession_(id,s);
    return drivePilotPublicState_(id,s);
  }finally{lock.releaseLock();}
}
