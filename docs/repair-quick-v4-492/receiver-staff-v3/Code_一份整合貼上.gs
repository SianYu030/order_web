// ===== Code.gs =====
/**
 * PhotoAgent Google Drive staff-authenticated receiver v3.0, isolated staging.
 * Must deploy after IT approval; every RPC requires private employee credential.
 * Does NOT alter formal tickets, NAS, LINE, or the existing photo relay.
 * Drive API resumable sessions are retained server-side; NEVER return their URI or OAuth token to browser.
 */
const REPAIR_DRIVE_PILOT = Object.freeze({
  ROOT_FOLDER_ID: '11T5G1kMSB_TqI4TK2eSYDcBZSFNorN2K',
  OWNER_EMAIL: 'fac68193807@gmail.com',
  FORMAL_SHEET_ID: '13qpQWg3tKOXd1BC0XPsK7DsIxG1sBaVI6-yRpERIRMQ',
  FORMAL_SHEET_NAME: '機修維修單',
  MAX_PHOTO_BYTES: 100 * 1048576,
  MAX_VIDEO_BYTES: 500 * 1048576,
  CHUNK_BYTES: 2 * 1048576,   // 2 MiB, multiple of 256 KiB
  SESSION_MAX_AGE_MS: 24 * 60 * 60 * 1000,
  FOLDER_NAME: '', // 直接使用現有 PhotoAgent 掃描的雲端來源根目錄
  TYPES: ['報修照片','維修照片','報修影片','維修影片']
});

function doGet(e) {
  // 接收程式只在原本維修網站背後執行，不另外顯示上傳表單。
  const page = HtmlService.createTemplateFromFile('Bridge');
  const candidate = e && e.parameter ? String(e.parameter.bridgeNonce || '') : '';
  page.bridgeNonce = /^[a-f0-9-]{36}$/i.test(candidate) ? candidate : ''; 
  // Popup-only login flow: no ALLOWALL iframe clickjacking exception.
  return page.evaluate().setTitle('設備維修附件授權登入');
}

function drivePilotHealthcheck(token) {
  drivePilotAuthorize_(token);
  return {
    ok: true, receiverVersion:'3.0',
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
function drivePilotStart(info,token) {
  const staffId=drivePilotAuthorize_(token);
  if(!info||typeof info!=='object') throw new Error('缺少附件資訊');
  const mr=String(info.orderNo||'').trim().toUpperCase();
  const kind=String(info.mediaKind||'').trim();
  const name=String(info.name||'');
  const size=Number(info.size);
  if (!/^MR20\d{8}$/.test(mr)) throw new Error('MR 工單編號格式錯誤');
  // 一定要以正式工單清單確認來源，不能僅依前端傳入的工單編號。
  drivePilotCheckFormalMr_(mr);
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
  const safeName=mr+'_'+kind+'_'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd_HHmmss')+'_'+id.slice(0,8)+'.'+ext;
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
    orderNo:mr,mediaKind:kind,fileName:safeName,staffId:staffId,complete:false};
  drivePilotSetSession_(id,s);
  return drivePilotPublicState_(id,s);
}
/** Upload exactly one chunk. 2 MiB except the final chunk. */
function drivePilotUploadChunk(id,offset,base64,token) {
  const staffId=drivePilotAuthorize_(token);
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000)) throw new Error('其他傳輸正在進行，稍後重試');
  try {
    const s=drivePilotGetSession_(id);
    if(s.staffId!==staffId)throw new Error('不能操作其他員工的上傳工作階段');
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
function drivePilotQuery(id,token) {
  const staffId=drivePilotAuthorize_(token);
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))throw new Error('正在處理其他分段，請稍後查詢');
  try {
    const s=drivePilotGetSession_(id);
    if(s.staffId!==staffId)throw new Error('不能操作其他員工的上傳工作階段');
    if(s.complete)return drivePilotPublicState_(id,s);
    const remote=drivePilotQueryDrive_(s);
    if(remote.complete)return drivePilotFinalize_(id,s,remote.meta);
    drivePilotSetSession_(id,s);
    return drivePilotPublicState_(id,s);
  }finally{lock.releaseLock();}
}

// ===== StaffAuth.gs =====
/**
 * StaffAuth.gs — company employee access gate for repair media receiver v3.0
 * STAGING ONLY. Apps Script deployment executes as fac68193807@gmail.com.
 * Code is separate from main repair webhook. No external relay or API service.
 * Private helper functions (ending "_") cannot be called from google.script.run.
 */
const REPAIR_STAFF_AUTH = Object.freeze({
  STAFF_PREFIX:'repair_staff_v3_',
  SESSION_PREFIX:'repair_session_v3_',
  FAIL_PREFIX:'repair_login_fail_v3_',
  TTL_SECONDS:4*60*60,
  MAX_ATTEMPTS:6,
  LOCK_SECONDS:15*60
});

function drivePilotDigest_(value){
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    String(value),Utilities.Charset.UTF_8)
    .map(b=>(b&255).toString(16).padStart(2,'0')).join('');
}
function drivePilotStaffId_(raw){
  const id=String(raw||'').trim();
  if(id.length<2||id.length>40||/[\\/\x00-\x1f\x7f]/.test(id))
    throw new Error('員工識別碼格式不正確');
  return id;
}
function drivePilotEffectiveOwner_(){
  const email=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
  if(email!==REPAIR_DRIVE_PILOT.OWNER_EMAIL)
    throw new Error('執行身分不是廠務室帳號，停止作業');
}
function drivePilotStaffKey_(id){
  return REPAIR_STAFF_AUTH.STAFF_PREFIX+drivePilotDigest_(id);
}
function drivePilotCredential_(id){
  const raw=PropertiesService.getScriptProperties().getProperty(drivePilotStaffKey_(id));
  if(!raw)return null;
  try{return JSON.parse(raw);}catch(_){return null;}
}
function drivePilotAuthorize_(sessionToken){
  drivePilotEffectiveOwner_();
  const token=String(sessionToken||'');
  if(!/^[0-9a-f-]{72}$/i.test(token))throw new Error('員工尚未完成上傳授權');
  const key=REPAIR_STAFF_AUTH.SESSION_PREFIX+drivePilotDigest_(token);
  const cached=CacheService.getScriptCache().get(key);
  if(!cached)throw new Error('員工上傳授權過期，請重新登入');
  const session=JSON.parse(cached);
  const saved=drivePilotCredential_(session.staffId);
  if(!saved||saved.disabled===true||saved.version!==session.version)
    throw new Error('員工上傳授權已停用');
  return session.staffId;
}

/** Public entry point: requires employee's individual 20-char random access code. */
function drivePilotLogin(staffId,accessCode){
  drivePilotEffectiveOwner_();
  const id=drivePilotStaffId_(staffId);
  const code=String(accessCode||'').trim();
  const cache=CacheService.getScriptCache();
  const failKey=REPAIR_STAFF_AUTH.FAIL_PREFIX+drivePilotDigest_(id);
  const failed=Number(cache.get(failKey)||0);
  if(failed>=REPAIR_STAFF_AUTH.MAX_ATTEMPTS)
    throw new Error('登入嘗試過多，15 分鐘後再試或聯絡廠務室');
  const record=drivePilotCredential_(id);
  const candidate=record?drivePilotDigest_(record.salt+':'+code):'';
  if(!record||record.disabled===true||!code||candidate!==record.digest){
    cache.put(failKey,String(failed+1),REPAIR_STAFF_AUTH.LOCK_SECONDS);
    throw new Error('員工識別碼或上傳授權碼不正確');
  }
  cache.remove(failKey);
  const token=Utilities.getUuid()+Utilities.getUuid();
  cache.put(REPAIR_STAFF_AUTH.SESSION_PREFIX+drivePilotDigest_(token),
    JSON.stringify({staffId:id,version:record.version}),
    REPAIR_STAFF_AUTH.TTL_SECONDS);
  return {ok:true,staffId:id,sessionToken:token,
    expiresInSeconds:REPAIR_STAFF_AUTH.TTL_SECONDS};
}

/**
 * Administrator-only provisioning:
 * 1. Script Properties -> REPAIR_STAFF_IDS_JSON = ["H001","T008",...]
 * 2. Run drivePilotAdminProvision_ manually in Apps Script editor as owner.
 * 3. Copy the one-time result from execution log, distribute privately, delete log.
 * This method ends "_" so it is NOT callable by the public browser.
 */
function drivePilotAdminProvision_(){
  drivePilotEffectiveOwner_();
  const props=PropertiesService.getScriptProperties();
  const ids=JSON.parse(props.getProperty('REPAIR_STAFF_IDS_JSON')||'[]');
  if(!Array.isArray(ids)||ids.length===0||ids.length>500)
    throw new Error('請先填寫 REPAIR_STAFF_IDS_JSON（最多 500 個員工識別碼）');
  const created=[];
  ids.forEach(raw=>{
    const id=drivePilotStaffId_(raw);
    if(drivePilotCredential_(id))return;
    const plain=Utilities.getUuid().replace(/-/g,'').slice(0,20);
    const salt=Utilities.getUuid();
    props.setProperty(drivePilotStaffKey_(id),JSON.stringify({
      salt,digest:drivePilotDigest_(salt+':'+plain),
      version:Utilities.getUuid(),disabled:false
    }));
    created.push({staffId:id,accessCode:plain});
  });
  Logger.log(JSON.stringify(created));
  return created.length;
}
/** Owner-only reset/revoke code. Set REPAIR_STAFF_RESET_ID then manually run. */
function drivePilotAdminResetOne_(){
  drivePilotEffectiveOwner_();
  const props=PropertiesService.getScriptProperties();
  const id=drivePilotStaffId_(props.getProperty('REPAIR_STAFF_RESET_ID'));
  const plain=Utilities.getUuid().replace(/-/g,'').slice(0,20);
  const salt=Utilities.getUuid();
  props.setProperty(drivePilotStaffKey_(id),JSON.stringify({
    salt,digest:drivePilotDigest_(salt+':'+plain),
    version:Utilities.getUuid(),disabled:false
  }));
  props.deleteProperty('REPAIR_STAFF_RESET_ID');
  Logger.log(JSON.stringify({staffId:id,accessCode:plain}));
  return true;
}


// ===== AdminDiagnostics.gs =====
/**
 * 管理員唯讀預檢：不建立工單、不刪資料、不上傳附件。
 * 僅在廠務室 Apps Script 編輯器由管理員手動執行。
 */
function drivePilotAdminPreflight_(){
  drivePilotEffectiveOwner_();
  const root=DriveApp.getFolderById(REPAIR_DRIVE_PILOT.ROOT_FOLDER_ID);
  const ss=SpreadsheetApp.openById(REPAIR_DRIVE_PILOT.FORMAL_SHEET_ID);
  const tab=ss.getSheetByName(REPAIR_DRIVE_PILOT.FORMAL_SHEET_NAME);
  if(!tab)throw new Error("正式機修維修單不存在");
  const report={
    ok:true,
    receiverVersion:"3.0",
    accountVerified:true,
    rootFolderName:root.getName(),
    sheetName:tab.getName(),
    lastRow:tab.getLastRow(),
    message:"僅讀取授權與資料夾狀態，沒有更動正式工單或雲端檔案"
  };
  Logger.log(JSON.stringify(report));
  return report;
}
