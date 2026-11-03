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
  // First-party page: users visit the signed-in Google web app directly.
  if(p.action!=="photoReceipt"&&!p.callback){
    return HtmlService.createHtmlOutput(pdbUploaderHtml_(p))
      .setTitle("PhotoAgent｜設備維修照片上傳")
      .addMetaTag("viewport","width=device-width,initial-scale=1,viewport-fit=cover");
  }
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
/**
 * 直接在 Apps Script 執行 pdbEnvironmentCheck：
 * 執行記錄會顯示完整結果。僅讀取，不寫入照片或工單。
 */
function pdbEnvironmentCheck(){
  const cfg=pdbSettings_();
  const result={
    configured:!!cfg.sheetId&&!!cfg.folderId,
    enabled:cfg.enabled,
    owner:Session.getActiveUser().getEmail(),
    sourceAccessible:cfg.sheetId?!!SpreadsheetApp.openById(cfg.sheetId).getSheetByName("機修維修單"):false,
    folderAccessible:cfg.folderId?!!DriveApp.getFolderById(cfg.folderId):false
  };
  console.log("PhotoAgent 環境檢查： "+JSON.stringify(result));
  return result;
}

/**
 * 可選的嚴格檢查：有任一重要項目失敗就顯示錯誤。
 * 為安全起見 enabled=false 屬正常結果。
 */
function pdbShowCheck(){
  const result=pdbEnvironmentCheck();
  if(!result.configured)throw new Error("尚未設定 Google 試算表或照片暫存資料夾的指令碼屬性");
  if(!result.owner)throw new Error("目前無法確認登入的 Google 帳號");
  if(!result.sourceAccessible)throw new Error("無法取得正式「機修維修單」工作表");
  if(!result.folderAccessible)throw new Error("無法開啟公司 Google Drive 照片暫存資料夾");
  console.log("PhotoAgent 環境檢查通過，照片上傳目前"+(result.enabled?"已啟用":"仍停用（安全測試模式）"));
  return result;
}

/**
 * First-party upload page: load this Web App in the browser directly.
 * Unlike Github cross-site script requests, google.script.run uses Apps Script
 * authentication in its own HTML service page.
 * This is a PILOT for the authorized company account, NOT a public upload API.
 */
function pdbUploaderStatus(){
  const cfg=pdbSettings_();
  const email=String(Session.getActiveUser().getEmail()||"").trim().toLowerCase();
  return {
    authenticated:!!email && cfg.emails.includes(email),
    enabled:cfg.enabled,
    ready:!!cfg.sheetId&&!!cfg.folderId
  };
}
function pdbUploadFromPage(payload){
  const result=pdbSave_(payload);
  console.log("PhotoAgent cloud upload "+JSON.stringify({
    orderNo:result.orderNo,photoType:result.photoType,
    id:result.fileId,duplicate:result.duplicate
  }));
  return result;
}
function pdbUploaderHtml_(query){
  const q=query||{};
  const mr=/^MR20\d{8}$/.test(String(q.orderNo||""))?String(q.orderNo):"";
  const kind=["報修照片","維修照片"].includes(String(q.photoType||""))?String(q.photoType):"";
  const html="<!doctype html>\n<html lang=\"zh-Hant\"><head><meta charset=\"utf-8\"><base target=\"_top\">\n<style>\n*{box-sizing:border-box}body{margin:0;background:#eef3f7;padding:16px;font-family:system-ui,-apple-system,\"Microsoft JhengHei\",sans-serif;color:#193245}\nmain{max-width:540px;margin:auto;background:#fff;border-radius:16px;padding:22px 17px;box-shadow:0 4px 16px #3452}\nh1{font-size:22px;margin:0}p{line-height:1.6;font-size:14px;color:#597083}\nlabel{display:block;margin-top:16px;font-weight:700}\ninput,select,button{width:100%;font:inherit;border-radius:10px;min-height:48px;padding:10px}\ninput,select{border:1px solid #b1c5d4;margin-top:7px;font-size:17px;background:#fff}\nbutton{background:#125c88;border:0;color:#fff;font-weight:700;margin-top:18px}\nbutton:disabled{background:#95a7b1}\n#access{padding:11px;background:#e4f1fc;border-radius:9px;line-height:1.55;margin-top:12px}\n#result{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;margin-top:14px}\n#warn{background:#fff1d5;border-radius:10px;padding:10px;color:#734b10}\nimg{width:100%;max-height:180px;object-fit:contain}\na{color:#14628d}\n</style></head>\n<body><main><h1>📷 PhotoAgent 設備照片上傳</h1>\n<p>公司 Google 帳號專用，照片先存至 Google Drive 暫存區。</p>\n<div id=\"access\">正在檢查登入身分與上傳狀態…</div>\n<label for=\"mr\">MR 工單編號</label><input id=\"mr\" placeholder=\"MR2026110301\" maxlength=\"12\" autocomplete=\"off\">\n<label for=\"kind\">照片類別</label>\n<select id=\"kind\"><option value=\"報修照片\">報修照片</option><option value=\"維修照片\">維修照片</option></select>\n<label for=\"files\">拍照或選取照片（最多 5 張）</label><input id=\"files\" type=\"file\" accept=\"image/*\" multiple>\n<div id=\"preview\"></div><button id=\"upload\" disabled>儲存至 Google Drive</button>\n<div id=\"result\" role=\"status\"></div>\n<p id=\"warn\">注意：雲端上傳成功不代表 NAS 已備份。PhotoAgent NAS 驗證與 72 小時清理目前尚未啟用。</p>\n<p><a href=\"https://sianyu030.github.io/order_web/repair-quick-v4-493-photo-pilot/\">返回設備報修測試版</a></p>\n</main><script>\n(function(){\n\"use strict\";\nvar $=function(id){return document.getElementById(id);};\nvar order=\"__INITIAL_ORDER__\",kind=\"__INITIAL_KIND__\";\nif(order)$(\"mr\").value=order;\nif(kind)$(\"kind\").value=kind;\nvar allowed=false;\nvar show=function(s){$(\"result\").textContent=s;};\ngoogle.script.run.withSuccessHandler(function(r){\n allowed=!!r.authenticated&&!!r.enabled&&!!r.ready;\n $(\"access\").textContent=!r.authenticated?\"⛔ 此帳號未列入授權名單\":\n !r.enabled?\"⚠️ 接收功能尚未啟用（PHOTO_BRIDGE_UPLOADS_ENABLED=NO）\":\n !r.ready?\"⛔ 接收端缺少資料夾或試算表設定\":\"✅ 已授權，可寫入公司 Google Drive\";\n $(\"upload\").disabled=!allowed;\n}).withFailureHandler(function(e){\n $(\"access\").textContent=\"⛔ 檢查失敗：\"+(e&&e.message||e);\n}).pdbUploaderStatus();\n$(\"files\").onchange=function(){\n var f=$(\"files\").files[0],div=$(\"preview\");div.textContent=\"\";\n if(f){var img=document.createElement(\"img\");img.alt=\"選擇的第一張照片\";img.src=URL.createObjectURL(f);div.appendChild(img);}\n};\nfunction toJpeg(file){return new Promise(function(resolve,reject){\n var url=URL.createObjectURL(file),im=new Image();\n im.onerror=function(){URL.revokeObjectURL(url);reject(Error(\"無法讀取圖片：\"+file.name));};\n im.onload=function(){\n  URL.revokeObjectURL(url);\n  var w=im.naturalWidth,h=im.naturalHeight,m=Math.min(1,1600/Math.max(w,h));\n  var c=document.createElement(\"canvas\");\n  c.width=Math.max(1,Math.round(w*m));c.height=Math.max(1,Math.round(h*m));\n  var ctx=c.getContext(\"2d\");if(!ctx){reject(Error(\"無法壓縮照片\"));return;}\n  ctx.drawImage(im,0,0,c.width,c.height);\n  c.toBlob(function(blob){blob?resolve(blob):reject(Error(\"照片壓縮失敗\"));},\"image/jpeg\",0.8);\n };im.src=url;\n});}\nfunction b64(blob){return new Promise(function(resolve,reject){\n var reader=new FileReader();\n reader.onload=function(){resolve(String(reader.result||\"\").split(\",\")[1]||\"\");};\n reader.onerror=function(){reject(Error(\"讀取照片失敗\"));};\n reader.readAsDataURL(blob);\n});}\nfunction save(p){return new Promise(function(resolve,reject){\n google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).pdbUploadFromPage(p);\n});}\n$(\"upload\").onclick=async function(){\n if(!allowed){show(\"上傳未開放，請檢查帳號與設定。\");return;}\n var mr=$(\"mr\").value.trim().toUpperCase();\n if(!/^MR20\\d{8}$/.test(mr)){show(\"MR 工單編號格式錯誤\");return;}\n var fs=Array.from($(\"files\").files||[]),kind=$(\"kind\").value;\n if(!fs.length||fs.length>5){show(\"請選擇 1 到 5 張照片。\");return;}\n $(\"upload\").disabled=true;\n var good=0,fail=[];\n for(var i=0;i<fs.length;i++){\n  show(\"正在上傳第 \"+(i+1)+\" / \"+fs.length+\" 張\");\n  try{\n   var photo=await toJpeg(fs[i]);\n   if(photo.size>5*1024*1024)throw Error(\"壓縮後仍超過 5 MB\");\n   var p={orderNo:mr,photoType:kind,contentType:\"image/jpeg\",\n     fileName:(fs[i].name||\"photo\").replace(/\\.[^.]+$/,\"\")+\".jpg\",dataBase64:await b64(photo)};\n   var res=await save(p);\n   if(!res||!res.ok||res.orderNo!==mr||res.photoType!==kind||!res.fileId)throw Error(\"未收到 Google Drive 寫入確認\");\n   good++;\n  }catch(err){fail.push(fs[i].name+\"：\"+String(err&&err.message||err));}\n }\n show(\"已確認 Google Drive 寫入：\"+good+\" 張（NAS 尚未驗證）\"+\n  (fail.length?\"\\n失敗：\"+fail.length+\" 張\\n\"+fail.join(\"\\n\"):\"\"));\n $(\"upload\").disabled=false;\n};\n})();\n</script></body></html>";
  return html.replace("__INITIAL_ORDER__",mr).replace("__INITIAL_KIND__",kind);
}
