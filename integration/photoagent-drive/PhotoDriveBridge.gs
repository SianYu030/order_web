/**
 * PhotoAgent Drive Bridge V4.493 (isolated Apps Script project)
 * Not deployed by this repository. No automatic deletion.
 * Use Script Properties for company IDs; never commit credentials.
 *
 * SOURCE_SPREADSHEET_ID: formal spreadsheet ID
 * PHOTO_STAGING_FOLDER_ID: private Drive photo staging folder ID
 * PHOTO_BRIDGE_ALLOWED_EMAILS: comma-separated authorized Google accounts
 * PHOTO_BRIDGE_UPLOADS_ENABLED: YES only after controlled test
 *
 * Deployment (pilot): Execute as owner; Who has access: Only myself.
 * WARNING: Do not change public access without an approved authentication plan.
 */
const PDB_MAX_BYTES = 5 * 1024 * 1024;
const PDB_TYPES = Object.freeze({
  "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp"
});
const PDB_RECEIPT_TTL = 21600;
function pdbSettings_(){
  const p=PropertiesService.getScriptProperties();
  return {
    sheetId:p.getProperty("SOURCE_SPREADSHEET_ID")||"",
    folderId:p.getProperty("PHOTO_STAGING_FOLDER_ID")||"",
    emails:(p.getProperty("PHOTO_BRIDGE_ALLOWED_EMAILS")||"").toLowerCase().split(",").map(x=>x.trim()).filter(Boolean),
    enabled:p.getProperty("PHOTO_BRIDGE_UPLOADS_ENABLED")==="YES"
  };
}
function pdbAuthorized_(cfg){
  if(!cfg.enabled)throw new Error("照片橋接尚未開放寫入");
  if(!cfg.sheetId||!cfg.folderId)throw new Error("照片橋接未完成資料夾或工單設定");
  const user=String(Session.getActiveUser().getEmail()||"").trim().toLowerCase();
  if(!user || !cfg.emails.includes(user))throw new Error("尚未通過公司 Google 帳號授權");
}
function pdbReceiptKey_(id){return "PDB_"+id;}
function pdbValidRequest_(id){return /^PD[0-9]{13}_[a-f0-9]{32}$/.test(String(id||""));}
function pdbWriteReceipt_(id,result){
  if(!pdbValidRequest_(id))return;
  CacheService.getScriptCache().put(pdbReceiptKey_(id),JSON.stringify(result),PDB_RECEIPT_TTL);
}
function pdbReply_(value){
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e){
  let id="";
  try{
    if(!e||!e.postData||!e.postData.contents)throw new Error("缺少照片資料");
    const payload=JSON.parse(e.postData.contents);
    id=String(payload.requestId||"");
    if(payload.action!=="photoSave"||!pdbValidRequest_(id))throw new Error("照片請求格式不正確");
    const cached=CacheService.getScriptCache().get(pdbReceiptKey_(id));
    if(cached)return pdbReply_({accepted:true,duplicateRequest:true});
    const result=pdbSave_(payload);
    pdbWriteReceipt_(id,result);
    return pdbReply_({accepted:true});
  }catch(error){
    pdbWriteReceipt_(id,{ok:false,status:"error",error:String(error&&error.message||error).slice(0,180)});
    return pdbReply_({accepted:false});
  }
}
function doGet(e){
  const p=e&&e.parameter||{};
  const cb=String(p.callback||"");
  if(!/^[A-Za-z_$][A-Za-z0-9_$]{0,75}$/.test(cb)){
    return ContentService.createTextOutput("Invalid callback").setMimeType(ContentService.MimeType.TEXT);
  }
  let data={ok:false,status:"error",error:"不支援的操作"};
  if(p.action==="photoReceipt" && pdbValidRequest_(p.requestId)){
    const raw=CacheService.getScriptCache().get(pdbReceiptKey_(p.requestId));
    data=raw?JSON.parse(raw):{ok:false,status:"pending"};
  }
  return ContentService.createTextOutput(cb+"("+JSON.stringify(data)+");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function pdbFindOrCreate_(parent,name){
  const items=parent.getFoldersByName(name);
  if(items.hasNext()){
    const folder=items.next();
    if(items.hasNext())throw new Error("雲端有重複資料夾："+name);
    return folder;
  }
  return parent.createFolder(name);
}
function pdbMagicOk_(bytes,mime){
  const b=i=>(bytes[i]||0)&255;
  if(mime==="image/jpeg")return b(0)===255&&b(1)===216&&b(2)===255;
  if(mime==="image/png")return b(0)===137&&b(1)===80&&b(2)===78&&b(3)===71;
  if(mime==="image/webp")return bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  return false;
}
function pdbSha_(bytes){
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes)
    .map(x=>("0"+(x&255).toString(16)).slice(-2)).join("");
}
function pdbOrderExists_(sheetId,orderNo){
  const sh=SpreadsheetApp.openById(sheetId).getSheetByName("機修維修單");
  if(!sh)throw new Error("找不到正式機修維修單");
  if(sh.getLastRow()<2)throw new Error("正式機修維修單沒有工單");
  const found=sh.getRange(2,1,sh.getLastRow()-1,1)
    .createTextFinder(orderNo).matchEntireCell(true).findNext();
  if(!found)throw new Error("正式工單不存在，拒絕儲存照片");
}
function pdbSave_(p){
  const cfg=pdbSettings_();pdbAuthorized_(cfg);
  const orderNo=String(p.orderNo||"").trim().toUpperCase();
  const kind=String(p.photoType||"");
  const mime=String(p.contentType||"").toLowerCase().split(";")[0];
  if(!/^MR20\d{8}$/.test(orderNo))throw new Error("MR 工單編號格式錯誤");
  if(kind!=="報修照片"&&kind!=="維修照片")throw new Error("照片類別錯誤");
  if(!Object.prototype.hasOwnProperty.call(PDB_TYPES,mime))throw new Error("不支援的照片格式");
  const base64=String(p.dataBase64||"");
  if(base64.length<8||base64.length>Math.ceil(PDB_MAX_BYTES*4/3)+8||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))
    throw new Error("照片 Base64 資料錯誤或超過限制");
  const bytes=Utilities.base64Decode(base64);
  if(bytes.length===0||bytes.length>PDB_MAX_BYTES||!pdbMagicOk_(bytes,mime))
    throw new Error("照片內容驗證未通過");
  pdbOrderExists_(cfg.sheetId,orderNo);
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(30000))throw new Error("照片儲存忙碌，請稍後重試");
  try{
    const root=DriveApp.getFolderById(cfg.folderId);
    const yyyy=orderNo.slice(2,6),mm=orderNo.slice(6,8);
    const month=pdbFindOrCreate_(pdbFindOrCreate_(root,yyyy),yyyy+"-"+mm);
    const order=pdbFindOrCreate_(month,orderNo);
    const dest=pdbFindOrCreate_(order,kind);
    const hash=pdbSha_(bytes);
    const name=orderNo+"_"+(kind==="報修照片"?"report":"repair")+"_"+hash.slice(0,24)+"."+PDB_TYPES[mime];
    const existing=dest.getFilesByName(name);
    if(existing.hasNext()){
      const f=existing.next();
      if(existing.hasNext())throw new Error("發現同名重複照片，停止寫入");
      if(f.getSize()!==bytes.length)throw new Error("同名檔案長度不一致，停止寫入");
      return {ok:true,status:"saved",duplicate:true,orderNo,photoType:kind,fileId:f.getId(),sha256:hash};
    }
    if(dest.getFiles().hasNext()){
      const files=dest.getFiles();let count=0;
      while(files.hasNext()&&count<=24){files.next();count++;}
      if(count>=25)throw new Error("同一工單類別照片已達安全上限 25 張");
    }
    const file=dest.createFile(Utilities.newBlob(bytes,mime,name));
    file.setDescription("PhotoAgent staging. Source: "+orderNo+"; type: "+kind+"; epoch: "+String(p.fileName||"").slice(0,65));
    if(file.getSize()!==bytes.length)throw new Error("照片寫入 Google Drive 後尺寸不符，需人工核對："+file.getId());
    return {ok:true,status:"saved",duplicate:false,orderNo,photoType:kind,fileId:file.getId(),sha256:hash};
  }finally{lock.releaseLock();}
}
function pdbEnvironmentCheck(){
  const cfg=pdbSettings_();
  return {configured:!!cfg.sheetId&&!!cfg.folderId,enabled:cfg.enabled,
    owner:Session.getActiveUser().getEmail(),
    sourceAccessible:cfg.sheetId?!!SpreadsheetApp.openById(cfg.sheetId).getSheetByName("機修維修單"):false,
    folderAccessible:cfg.folderId?!!DriveApp.getFolderById(cfg.folderId):false};
}