/**
 * 正道業務加班 Google 同步器 V1.9.4（雙端駁回驗證＋Google Sheets API 讀回＋每 1 分鐘補同步）
 * 附掛到正式「2026-加班及請假時數登記表」Google 試算表。
 * 執行者：具備該表編輯權限的廠務室 Google 帳號。
 * 安全：主管核准前只寫「業務假日或臨時加班登記」；原 E4/E5 工時禁止提前修改。
 * Bridge Token 只儲存在此私人 Apps Script 的 ScriptProperties，禁止放到 GitHub。
 */
var OT_BRIDGE={
 SPREADSHEET_ID:"1yx_QWF4CFiRYn1Fp4osMjBAkX97_0QQu03yGJIpteLM",
 SOURCE:"業務假日或臨時加班登記",
 MASTER:"系統櫃人員主檔（新版）",
 SOURCE_ID:1399193095,
 API:"https://mjcbixcgbcybtciribar.supabase.co/functions/v1/overtime-sheet-bridge",
 TOKEN_KEY:"BUSINESS_OVERTIME_SYNC_TOKEN",
 COMMENT_TAG:"\n\n［加班登記網站］"
};
/** 先到『專案設定 → 指令碼屬性』保存 BUSINESS_OVERTIME_SYNC_TOKEN；再從編輯器執行本函式。 */
function installBusinessOvertimeSync(){
 // 安裝過程不得開啟阻塞式視窗，避免編輯器等待六分鐘逾時。
 var ss=SpreadsheetApp.getActiveSpreadsheet();
 if(!ss||ss.getId()!==OT_BRIDGE.SPREADSHEET_ID)
  throw Error("請從正式加班試算表的擴充功能開啟此 Apps Script 專案，拒絕安裝到其他試算表。");
 var token=(PropertiesService.getScriptProperties().getProperty(OT_BRIDGE.TOKEN_KEY)||"").trim();
 if(!/^[A-Za-z0-9_-]{40,100}$/.test(token))
  throw Error("尚未設定 BUSINESS_OVERTIME_SYNC_TOKEN。請點左側齒輪『專案設定』→『指令碼屬性』→『新增指令碼屬性』，將管理員網站的同步授權碼貼入值欄並儲存，再重新執行。");
 Logger.log("正在驗證 Supabase 專用同步授權，未修改任何工時。");
 var result=otBridgeApi_("pull",{});
 if(result.ok!==true||!Array.isArray(result.records))
  throw Error("Supabase 驗證失敗；未建立同步排程，正式工時未修改。");
 var interval=otEnsureOneMinuteTrigger_();
 Logger.log("同步觸發器現在為每 "+interval+" 分鐘執行。");
 Logger.log("安裝完成：同步授權已驗證、每 1 分鐘補同步觸發器已存在；目前後端待處理 "+result.records.length+" 筆。");
 Logger.log("請回管理員網站按『檢查 Google 同步狀態』核對最近連線。");
 return {ok:true,triggers:1,interval_minutes:interval,pending:result.records.length};
}
/** 執行 installBusinessOvertimeSync 即可將舊的 5 分鐘排程安全更換成 1 分鐘。 */
function otEnsureOneMinuteTrigger_(){
 var key="BUSINESS_OT_TRIGGER_MINUTES";
 var props=PropertiesService.getScriptProperties();
 var old=ScriptApp.getProjectTriggers().filter(function(t){
  return t.getHandlerFunction()==="runBusinessOvertimeSync";
 });
 if(old.length===1 && props.getProperty(key)==="1"){
  return 1;
 }
 // 先建立新觸發器，確定建立成功才移除原觸發器。
 var next=ScriptApp.newTrigger("runBusinessOvertimeSync").timeBased().everyMinutes(1).create();
 try{
  old.forEach(function(t){ScriptApp.deleteTrigger(t);});
 }catch(e){
  // 移除舊排程失敗時，先撤回新的，避免雙重排程。
  try{ScriptApp.deleteTrigger(next);}catch(ignore){}
  throw Error("舊排程移除失敗，請到 Apps Script 左側觸發條件檢查："+String(e));
 }
 var active=ScriptApp.getProjectTriggers().filter(function(t){
  return t.getHandlerFunction()==="runBusinessOvertimeSync";
 });
 if(active.length!==1||active[0].getUniqueId()!==next.getUniqueId())
  throw Error("同步觸發器數量或識別碼不一致，請人工檢查，不可繼續建立更多排程。");
 props.setProperty(key,"1");
 return 1;
}
/**
 * 唯讀健康檢查：透過「正式同步實際使用的 Sheets REST API」核對 HTTP 200，
 * 再確認進階服務 Sheets(v4) 的連線，不會寫入、核准、刪除或重設任何工單。
 * 需於左側「服務」加入 Google Sheets API v4，識別碼維持 Sheets。
 */
function testBusinessOvertimeSheetsApi(){
 var id=OT_BRIDGE.SPREADSHEET_ID;
 var url="https://sheets.googleapis.com/v4/spreadsheets/"+id+
  "?fields="+encodeURIComponent("spreadsheetId,properties(title),sheets(properties(sheetId,title))");
 var response=UrlFetchApp.fetch(url,{
  method:"get",muteHttpExceptions:true,
  headers:{"Authorization":"Bearer "+ScriptApp.getOAuthToken()}
 });
 var status=response.getResponseCode();
 if(status!==200){
  var body=String(response.getContentText()||"").slice(0,500);
  Logger.log("Google Sheets API 健康檢查失敗，HTTP "+status+"："+body);
  throw Error("Google Sheets API 讀取測試失敗（HTTP "+status+"）；禁止執行正式工時同步。請核對 Apps Script 所屬 Google Cloud 專案已啟用 Sheets API v4。");
 }
 var json=JSON.parse(response.getContentText());
 if(json.spreadsheetId!==id)throw Error("API 讀回的正式試算表 ID 不吻合。");
 var registered=(json.sheets||[]).some(function(s){
  return s.properties&&s.properties.sheetId===OT_BRIDGE.SOURCE_ID&&
   s.properties.title===OT_BRIDGE.SOURCE;
 });
 if(!registered)throw Error("正式業務加班登記分頁的名稱或 sheetId 不吻合。");
 if(typeof Sheets==="undefined"||!Sheets.Spreadsheets||
    typeof Sheets.Spreadsheets.get!=="function")
  throw Error("尚未在 Apps Script 左側『服務』新增 Google Sheets API v4，服務 ID 應為 Sheets。");
 var viaAdvanced=Sheets.Spreadsheets.get(id,{fields:"spreadsheetId,properties(title)"});
 if(!viaAdvanced||viaAdvanced.spreadsheetId!==id)
  throw Error("進階服務 Google Sheets API 讀取結果不吻合。");
 var title=String((viaAdvanced.properties||{}).title||"");
 Logger.log("Google Sheets API 唯讀測試成功：HTTP 200，試算表="+title+"，來源分頁 ID 正確。");
 Logger.log("僅驗證讀取權限，未修改任何儲存格；原『需人工核對』工單仍須另外安全處理。");
 return {ok:true,read_only:true,http_status:200,spreadsheet_id:id,title:title};
}
function testBusinessOvertimeSync(){
 var result=otBridgeApi_("pull",{});
 Logger.log(JSON.stringify({ok:result.ok,count:result.count}));
 return {ok:result.ok,count:result.count};
}
function runBusinessOvertimeSync(){
 var lock=LockService.getScriptLock();
 if(!lock.tryLock(30000)){
  Logger.log("另一個同步程序正在執行，略過這次排程。");
  return;
 }
 try{
  var result=otBridgeApi_("pull",{});
  var rows=result.records||[],rosterPending=result.roster_pending||[],success=0,failed=0;
  try{otBridgeApi_("capabilities",{version:"1.9.3"});}
  catch(e){Logger.log("版本回報失敗："+String(e));}
  if(rows.length===0&&rosterPending.length===0){
   Logger.log("Google 業務加班補同步：目前無待處理申請。");
   return {ok:true,processed:0,failed:0};
  }
  var ss=otOpen_();
  for(var p=0;p<rosterPending.length&&p<20;p++){
   var item=rosterPending[p];
   try{
    var validation=otCheckRoster_(ss,item);
    otBridgeApi_("roster_ack",{department:item.department,employee_id:item.employee_id,
      employee_name:item.employee_name,team:item.team,valid:validation.ok,message:validation.message});
   }catch(e){Logger.log("新人員驗證暫停："+String(e).slice(0,200));}
  }
  for(var i=0;i<rows.length&&i<20;i++){
   var r=rows[i];
   try{
    if(["待同步","同步失敗","同步中"].indexOf(r.status)!==-1){
     if(r.status==="同步中"&&Date.now()-Date.parse(r.updated_at)<10*60*1000)continue;
     r=otBridgeApi_("claim",{id:r.id,status:r.status,updated_at:r.updated_at}).record;
     if(!r)throw Error("後端鎖定工單失敗。");
     var registered=otRegister_(ss,r);
     otBridgeApi_("ack",{id:r.id,stage:"registered",
      source_sheet:OT_BRIDGE.SOURCE,source_row:registered.row});
     success++;
    }else if(r.status==="核准待同步"){
     var approved=otApprove_(ss,r);
     otBridgeApi_("ack",{id:r.id,stage:"approved",
      source_sheet:OT_BRIDGE.SOURCE,source_row:approved.row});
     success++;
    }else if(r.status==="駁回待同步"&&r.source_range){
     var rejected=otReject_(ss,r);
     otBridgeApi_("ack",{id:r.id,stage:"rejected",
      source_sheet:OT_BRIDGE.SOURCE,source_row:rejected.row});
     success++;
    }else if(r.status==="取消待同步"&&r.source_range){
     var cancelled=otCancelApproved_(ss,r);
     otBridgeApi_("ack",{id:r.id,stage:"cancelled",
      source_sheet:OT_BRIDGE.SOURCE,source_row:cancelled.row});
     success++;
    }
   }catch(e){
    failed++;
    Logger.log("工單 "+String(r.request_no||r.id)+" 同步受阻："+String(e));
    // 不確定是否已寫入 Google 時一律改人工核對，避免再次覆蓋正式工時。
    if(r.status!=="已駁回"){
     try{otBridgeApi_("problem",{id:r.id,safe:false,error:String(e)});}
     catch(a){Logger.log("問題回報失敗："+String(a));}
    }
   }
  }
  Logger.log("Google 業務加班同步，本次成功="+success+"，異常="+failed);
  return {ok:failed===0,processed:success,failed:failed};
 }finally{lock.releaseLock();}
}
/** Apps Script 網頁應用程式接收簽章通知後，才喚醒既有的安全同步流程。
 * 必須部署為「以我身分執行／所有人」，公開網址不可直接帶有工時更新參數。
 * 同步憑證只存在私人 ScriptProperties，絕不暴露給訪客。
 */
function otWakeHex_(bytes){
 return Array.prototype.map.call(bytes,function(x){
  return ("0"+(x&255).toString(16)).slice(-2);
 }).join("");
}
function otWakeSignature_(canonical){
 var raw=(PropertiesService.getScriptProperties().getProperty(OT_BRIDGE.TOKEN_KEY)||"").trim();
 if(!/^[A-Za-z0-9_-]{40,100}$/.test(raw))throw Error("未設定 Google 同步授權。");
 var hash=otWakeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw,Utilities.Charset.UTF_8));
 return otWakeHex_(Utilities.computeHmacSha256Signature(canonical,hash));
}
function otWakeEqual_(a,b){
 if(typeof a!=="string"||typeof b!=="string"||a.length!==64||b.length!==64)return false;
 var diff=0;
 for(var i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
function otWakeReply_(data){
 return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e){
 try{
  var raw=String(e&&e.postData&&e.postData.contents||"");
  if(raw.length>1024)return otWakeReply_({ok:false,error:"Invalid payload"});
  var data=JSON.parse(raw);
  var ts=data.ts,id=String(data.id||""),event=String(data.event||""),
      signature=String(data.signature||"");
  if(typeof ts!=="number"||!Number.isSafeInteger(ts)||Math.abs(Date.now()-ts)>120000||
    !/^[0-9a-f-]{36}$/i.test(id)||["submit","approve","update","reject","cancel","roster"].indexOf(event)<0||
    !/^[a-f0-9]{64}$/.test(signature))
   return otWakeReply_({ok:false,error:"Invalid wake-up request"});
  var expected=otWakeSignature_(ts+"."+id+"."+event);
  if(!otWakeEqual_(signature,expected))
   return otWakeReply_({ok:false,error:"Invalid signature"});
  // 重複通知只可喚醒同步，不能直接指定任何工時／日期／儲存格。
  var cache=CacheService.getScriptCache(),cacheKey="OT_WAKE_"+id+"_"+ts;
  if(cache.get(cacheKey))return otWakeReply_({ok:true,duplicate:true});
  cache.put(cacheKey,"1",150);
  var result=runBusinessOvertimeSync();
  return otWakeReply_({ok:true,accepted:true,processed:result&&result.processed||0});
 }catch(err){
  Logger.log("Google 即時同步通知處理失敗："+String(err).slice(0,200));
  return otWakeReply_({ok:false,error:"Wake-up temporarily unavailable"});
 }
}
/** 將這個專案部署為 Google 網頁應用程式後，從 Apps Script 編輯器執行一次。
 * 只向 Supabase 儲存 Google 部署網址，不修改正式工時。
 */
function registerBusinessOvertimeInstantWebhook(){
 // 有正式部署但 Apps Script 無法自動回傳 URL 時，允許私有 ScriptProperties 指定。
 // 部署網址不是同步 Token；同步 Token 仍只保存在 BUSINESS_OVERTIME_SYNC_TOKEN。
 var props=PropertiesService.getScriptProperties();
 var manual=String(props.getProperty("BUSINESS_OVERTIME_WEBAPP_URL")||"").trim();
 var detected=String(ScriptApp.getService().getUrl()||"").trim();
 var url=manual||detected;
 if(!/^https:\/\/script[.]google[.]com\/macros\/s\/[A-Za-z0-9_-]{30,256}\/exec$/.test(url))
  throw Error("已部署卻無法自動取得 /exec 網址。請按「部署→管理部署作業」複製「網頁應用程式網址」；在「專案設定→指令碼屬性」新增 BUSINESS_OVERTIME_WEBAPP_URL，值為完整 /exec 網址，儲存後再執行。不要重新建立部署，也不要貼同步 Token。");
 // 同步授權存在 Apps Script 私有設定；此操作不須再次產生授權碼。
 var result=otBridgeApi_("register_webhook",{url:url});
 if(!result.ok||!result.registered)throw Error("Supabase 即時通知網址登記失敗。");
 Logger.log("已建立即時通知管道；每 1 分鐘補同步排程仍保留。");
 return {ok:true,registered:true,backup_minutes:1};
}
/** 停用即時通知但保留每 1 分鐘補同步，提供安全回復路徑。 */
function disableBusinessOvertimeInstantWebhook(){
 var result=otBridgeApi_("unregister_webhook",{});
 Logger.log("即時通知已停用，定時補同步仍保持啟用。");
 return result;
}
function otBridgeApi_(action,data){
 var token=PropertiesService.getScriptProperties().getProperty(OT_BRIDGE.TOKEN_KEY);
 if(!token)throw Error("同步憑證尚未設定。請執行 installBusinessOvertimeSync。");
 var payload={action:action};
 Object.keys(data||{}).forEach(function(k){payload[k]=data[k];});
 var response=UrlFetchApp.fetch(OT_BRIDGE.API,{
  method:"post",muteHttpExceptions:true,
  contentType:"application/json; charset=utf-8",
  headers:{"X-Bridge-Token":token},
  payload:JSON.stringify(payload)
 });
 var json;
 try{json=JSON.parse(response.getContentText());}
 catch(e){throw Error("Supabase 回應不是 JSON，HTTP "+response.getResponseCode());}
 if(response.getResponseCode()!==200||!json.ok)
  throw Error("Supabase "+response.getResponseCode()+"："+String(json.error||"操作未完成"));
 return json;
}
function otOpen_(){
 var ss=SpreadsheetApp.openById(OT_BRIDGE.SPREADSHEET_ID);
 var source=ss.getSheetByName(OT_BRIDGE.SOURCE);
 if(!source||source.getSheetId()!==OT_BRIDGE.SOURCE_ID)
  throw Error("業務加班來源分頁不存在或 sheetId 不正確。");
 var headers=source.getRange("A1:R1").getValues()[0];
 if(String(headers[0])!=="登記ID"||String(headers[15])!=="主管核准狀態")
  throw Error("正式登記表欄位發生變更，拒絕寫入。");
 if(source.getMaxRows()<1500||source.getMaxColumns()<18)
  throw Error("正式登記表未保留 A2:R1500 範圍。");
 return ss;
}
function otDateParts_(v){
 if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))
  throw Error("工單日期格式錯誤。");
 var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v),y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
 var actual=new Date(Date.UTC(y,mo-1,d));
 if(y<2026||y>2030||actual.getUTCFullYear()!==y||
   actual.getUTCMonth()+1!==mo||actual.getUTCDate()!==d)
  throw Error("工單日期超出安全範圍。");
 return {year:y,month:mo,day:d,iso:v};
}
function otIso_(x){
 if(x instanceof Date&&!isNaN(x.getTime()))
  return Utilities.formatDate(x,"Asia/Taipei","yyyy-MM-dd");
 if(typeof x==="number"&&x>20000)
  return Utilities.formatDate(new Date(Date.UTC(1899,11,30)+Math.floor(x)*86400000),"UTC","yyyy-MM-dd");
 if(typeof x==="string"&&/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(x)){
  var a=x.split(/[/-]/);return a[0]+"-"+String(a[1]).padStart(2,"0")+"-"+String(a[2]).padStart(2,"0");
 }
 return "";
}
function otSerial_(iso){
 var a=otDateParts_(iso);
 return (Date.UTC(a.year,a.month-1,a.day)-Date.UTC(1899,11,30))/86400000;
}
function otTaiwanDateSerial_(instant){
 var p=Utilities.formatDate(new Date(instant),"Asia/Taipei","yyyy-MM-dd-HH-mm-ss").split("-").map(Number);
 return (Date.UTC(p[0],p[1]-1,p[2],p[3],p[4],p[5])-Date.UTC(1899,11,30))/86400000;
}
function otCol_(index){
 var out="";
 for(var n=index+1;n>0;n=Math.floor((n-1)/26))
  out=String.fromCharCode(65+(n-1)%26)+out;
 return out;
}
function otVerifyPerson_(ss,r,allowHistorical){
 if(!["E4","E5"].includes(r.department)||!/^[A-Za-z0-9]+$/.test(r.employee_id)||
    !r.employee_name||!r.request_no||String(r.reason||"").trim().length===0 ||
    String(r.reason).length>1600||!(r.hours>=0.5&&r.hours<=24)||
    Math.round(r.hours*2)!==r.hours*2)
  throw Error("工單員工、時數或原因未通過檢查。");
 // 已核准取消依原核准來源和月份工時進行驗證；不強制要求員工仍在職。
 if(allowHistorical===true)return;
 var master=ss.getSheetByName(OT_BRIDGE.MASTER);
 if(!master||master.getSheetId()!==1406600017)
  throw Error("人員主檔未找到或分頁 ID 改變。");
 var rows=master.getRange("A4:F503").getValues();
 var found=rows.filter(function(x){return String(x[0])===String(r.employee_id)&&String(x[1])===r.employee_name;});
 if(found.length!==1||String(found[0][5])!=="在職")throw Error("人員主檔無唯一在職員工。");
 // 在職員工須同時存在 Supabase 授權名冊、Google 正式主檔與月份工時表。
 // 此處不再硬編碼個別姓名／工號，新增相同職務的人員不必修改同步器。
 if(r.department==="E4"){
  if(String(found[0][3])!=="E4"||String(found[0][4])!=="E4櫃體股")
   throw Error("E4 人員單位與主檔不符。");
 }else if(String(found[0][3])!=="內勤"||
    !["業務","審圖"].includes(String(found[0][4])))
  throw Error("E5 人員非已開放的業務／審圖職務。");
}
function otTarget_(ss,r,allowHistorical){
 otVerifyPerson_(ss,r,allowHistorical);
 var d=otDateParts_(r.date);
 var sheetName=d.month+"月份"+(r.department==="E4"?"E4":"E5機修課");
 var sheet=ss.getSheetByName(sheetName);
 if(!sheet||(sheet.isSheetHidden()&&allowHistorical!==true))throw Error("找不到原月份表或已封存："+sheetName);
 var dateCol=7+5*(d.day-1),overtimeCol=dateCol+1;
 if(overtimeCol>sheet.getMaxColumns())throw Error("月份表日期超出原欄位範圍。");
 if(otIso_(sheet.getRange(1,dateCol).getValue())!==r.date)
  throw Error("月份表日期欄不吻合："+sheetName);
 var people=sheet.getRange("C8:D180").getValues(),matches=[];
 for(var i=0;i<people.length;i++)
  if(String(people[i][0])===String(r.employee_id)&&String(people[i][1])===r.employee_name)
   matches.push(i+8);
 if(matches.length!==1)throw Error("月份表工號／姓名不是唯一："+sheetName);
 var row=matches[0];
 return {sheet:sheet,sheetId:sheet.getSheetId(),name:sheetName,
  row:row,col:overtimeCol,a1:otCol_(overtimeCol-1)+row};
}

/** 新人員核對：主檔、單位及本月正式工時列三者都相符才啟用。 */
function otCheckRoster_(ss,p){
 try{
  if(!p||!/^[A-Za-z0-9]{2,15}$/.test(String(p.employee_id||""))||
    !p.employee_name||!["E4","E5"].includes(p.department)||
    !["業務","業助","審圖"].includes(p.team)||
    (p.team==="業助")!==(p.department==="E4"))
   return {ok:false,message:"工號或分類有誤"};
  var master=ss.getSheetByName(OT_BRIDGE.MASTER);
  if(!master||master.getSheetId()!==1406600017)return {ok:false,message:"正式主檔不存在"};
  var rows=master.getRange("A4:F503").getValues().filter(function(r){
   return String(r[0])===String(p.employee_id)&&String(r[1])===String(p.employee_name)&&String(r[5])==="在職";
  });
  if(rows.length!==1)return {ok:false,message:"Google 主檔找不到唯一在職工號姓名"};
  var m=rows[0];
  if(p.department==="E4"&&!(String(m[3])==="E4"&&String(m[4])==="E4櫃體股"))
   return {ok:false,message:"業助尚未登錄 E4 主檔"};
  if(p.department==="E5"&&!(String(m[3])==="內勤"&&String(m[4])===p.team))
   return {ok:false,message:"內勤分類與正式主檔不一致"};
  var mo=Number(Utilities.formatDate(new Date(),"Asia/Taipei","M"));
  var sheetName=mo+"月份"+(p.department==="E4"?"E4":"E5機修課");
  var sheet=ss.getSheetByName(sheetName);
  if(!sheet||sheet.isSheetHidden())return {ok:false,message:"當月工時分頁尚未建立："+sheetName};
  var found=sheet.getRange("C8:D180").getValues().filter(function(r){
   return String(r[0])===String(p.employee_id)&&String(r[1])===String(p.employee_name);
  });
  if(found.length!==1)return {ok:false,message:"當月工時表沒有唯一員工資料："+sheetName};
  return {ok:true,message:"正式主檔及當月工時表均已核對"};
 }catch(e){return {ok:false,message:"Google 主檔查詢異常："+String(e).slice(0,110)};}
}
/** 已核准的取消，要求值、註解、來源狀態全部吻合後才精準清除該單格。 */
function otCancelApproved_(ss,r){
 if(r.status!=="取消待同步"||!String(r.cancellation_reason||"").trim()||
    !String(r.cancellation_confirmed_by||"").trim())
  throw Error("取消未經主管確認，禁止修改正式工時。");
 var src=otRegisteredSource_(ss,r,true),t=src.target,v=src.values;
 var cell=otCellReadApi_(t),reason=String(r.reason);
 var acceptable=[reason,"BUS-SYNC: "+r.request_no+"\n"+reason];
 if(String(v[15])==="已取消"&&String(v[9])==="不需同步"&&
    cell.kind==="blank"&&cell.formula===""&&cell.note==="")return {row:src.row};
 if(String(v[15])!=="已核准"||String(v[9])!=="已同步"||
    !String(v[16]||"").trim())throw Error("原申請未通過主管 Google 核准來源核對。");
 if(cell.kind!=="number"||Number(cell.number)!==Number(r.hours)||
    cell.formula!==""||acceptable.indexOf(cell.note)<0)
  throw Error("工時格與原申請的時數或註解不符，禁止清空，改人工核對。");
 // 同一批次更新：只清除已核准的工時格、來源 J 欄及 P 欄。
 otGoogleBatch_([
  {updateCells:{start:{sheetId:t.sheetId,rowIndex:t.row-1,columnIndex:t.col-1},
   rows:[{values:[{}]}],fields:"userEnteredValue,note"}},
  {updateCells:{start:{sheetId:OT_BRIDGE.SOURCE_ID,rowIndex:src.row-1,columnIndex:9},
   rows:[{values:[{userEnteredValue:{stringValue:"不需同步"}}]}],fields:"userEnteredValue"}},
  {updateCells:{start:{sheetId:OT_BRIDGE.SOURCE_ID,rowIndex:src.row-1,columnIndex:15},
   rows:[{values:[{userEnteredValue:{stringValue:"已取消"}}]}],fields:"userEnteredValue"}}
 ]);
 var check=otCellReadApi_(t),after=otSourceReadApi_(src.row);
 if(check.kind!=="blank"||check.formula!==""||check.note!==""||
    String(after[0])!==r.request_no||String(after[15])!=="已取消"||
    String(after[9])!=="不需同步"||String(after[16])!==String(v[16]))
  throw Error("取消後 Google 讀回不一致，停止處理以免重複修改。");
 return {row:src.row};
}
function otSourceRows_(ss){
 return ss.getSheetByName(OT_BRIDGE.SOURCE).getRange("A2:R1500").getValues();
}
/**
 * 用 Sheets REST API 重新讀取 Google 來源登記表，避開 SpreadsheetApp
 * 在同一輪 REST batchUpdate 後可能仍持有的舊讀取快取。
 * 日期採 SERIAL_NUMBER，避免 Apps Script Date 物件的時區轉換差異。
 * 唯讀，嚴格限定來源 A2:R1500，不修改正式月表。
 */
function otSourceReadApi_(row){
 if(!Number.isInteger(row)||row<2||row>1500)
  throw Error("Google 來源登記列超出允許範圍。");
 var range="'"+OT_BRIDGE.SOURCE.replace(/'/g,"''")+"'!A"+row+":R"+row;
 var url="https://sheets.googleapis.com/v4/spreadsheets/"+
  OT_BRIDGE.SPREADSHEET_ID+"/values/"+encodeURIComponent(range)+
  "?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER";
 var response=UrlFetchApp.fetch(url,{
  method:"get",muteHttpExceptions:true,
  headers:{"Authorization":"Bearer "+ScriptApp.getOAuthToken()}
 });
 if(response.getResponseCode()!==200)
  throw Error("Google 來源表 API 讀回失敗（HTTP "+response.getResponseCode()+"），不更改工單狀態。");
 var payload;
 try{payload=JSON.parse(response.getContentText());}
 catch(e){throw Error("Google 來源表 API 讀回格式不正確。");}
 var found=payload.values||[];
 if(found.length!==1||!Array.isArray(found[0])||found[0].length<16||found[0].length>18)
  throw Error("Google 來源表 API 讀回列數或欄數異常。");
 var values=found[0].slice();
 while(values.length<18)values.push("");
 return values;
}
function otSourceFind_(rows,r){
 var result=[];
 rows.forEach(function(values,i){
  if(String(values[0]||"")===r.request_no)result.push({row:i+2,values:values});
 });
 if(result.length>1)throw Error("同一申請編號重複出現在 Google 來源表。");
 return result[0]||null;
}
function otMatches_(row,r,target){
 return String(row[0]||"")===r.request_no&&otIso_(row[1])===r.date&&
  String(row[4])===r.department&&String(row[5])===String(r.employee_id)&&
  String(row[6])===r.employee_name&&Number(row[7])===r.hours&&
  String(row[8])===r.reason&&String(row[10])===target.name&&
  String(row[11])===target.a1;
}
function otRequest_(v){
 return {userEnteredValue:typeof v==="number"?{numberValue:v}:{stringValue:String(v==null?"":v)}};
}
function otGoogleBatch_(requests){
 var url="https://sheets.googleapis.com/v4/spreadsheets/"+OT_BRIDGE.SPREADSHEET_ID+":batchUpdate";
 var r=UrlFetchApp.fetch(url,{method:"post",muteHttpExceptions:true,
  contentType:"application/json; charset=utf-8",
  headers:{"Authorization":"Bearer "+ScriptApp.getOAuthToken()},
  payload:JSON.stringify({requests:requests})});
 var body;
 try{body=JSON.parse(r.getContentText());}catch(e){body={};}
 if(r.getResponseCode()!==200)
  throw Error("Google Sheets API 批次寫入失敗："+r.getResponseCode()+" "+String(body.error&&body.error.message||""));
 return body;
}
function otRegister_(ss,r){
 var target=otTarget_(ss,r),source=ss.getSheetByName(OT_BRIDGE.SOURCE);
 var rows=otSourceRows_(ss);
 var found=otSourceFind_(rows,r);
 // 同日只禁止與尚未駁回或未完成取消的申請重疊，即使來源表由其他工具建立。
 rows.forEach(function(x){
  if(String(x[0]||"")!==r.request_no&&
    String(x[5]||"")===String(r.employee_id)&&String(x[4]||"")===r.department&&
    otIso_(x[1])===r.date&&["已駁回","已取消"].indexOf(String(x[15]||""))<0)
    throw Error("Google 來源表同人同日另有未駁回工單，禁止重複。");
 });
 if(found){
  if(!otMatches_(otSourceReadApi_(found.row),r,target))throw Error("Google 原來源資料與 Supabase 不吻合，禁止覆蓋。");
  if(String(found.values[15])!=="待核准")
   throw Error("Google 來源表已被核准、駁回或發生狀態衝突，禁止重設為待核准，請人工核對。");
  return {row:found.row};
 }
 var empty=-1;
 for(var i=0;i<rows.length;i++){
  if(rows[i].every(function(x){return x===""||x===null;})){empty=i+2;break;}
 }
 if(empty<2)throw Error("來源表 A2:R1500 已滿。");
 var now=otTaiwanDateSerial_(new Date());
 var values=[r.request_no,otSerial_(r.date),Number(r.date.slice(0,4)),
  Number(r.date.slice(5,7)),r.department,String(r.employee_id),
  r.employee_name,r.hours,r.reason,"待同步",target.name,target.a1,now,now,
  "Supabase員工網站","待核准","",""];
 otGoogleBatch_([{updateCells:{
  start:{sheetId:OT_BRIDGE.SOURCE_ID,rowIndex:empty-1,columnIndex:0},
  rows:[{values:values.map(otRequest_)}],fields:"userEnteredValue"
 }}]);
 var verify=otSourceReadApi_(empty);
 if(!otMatches_(verify,r,target)||String(verify[9])!=="待同步"||String(verify[15])!=="待核准")
  throw Error("Google 來源表寫入後讀回不一致，禁止標示同步成功。");
 return {row:empty};
}
function otRegisteredSource_(ss,r,allowHistorical){
 if(r.source_sheet!==OT_BRIDGE.SOURCE||!/^A([2-9]|[1-9][0-9]{1,3}):R\1$/.test(String(r.source_range||"")))
  throw Error("後端來源儲存格範圍錯誤。");
 var row=Number(/A(\d+):R/.exec(r.source_range)[1]);
 var values=otSourceReadApi_(row);
 var target=otTarget_(ss,r,allowHistorical);
 if(!otMatches_(values,r,target))throw Error("來源表申請內容被修改，拒絕寫入原工時。");
 return {row:row,values:values,target:target};
}
/**
 * 正式工時單格唯讀：由 Sheets API 讀回值、公式與 Note，避開 SpreadsheetApp 快取。
 * Google Comment（討論留言）不納入正式加班備註，且永不修改既有 Comment。
 */
function otCellReadApi_(target){
 var range="'"+target.name.replace(/'/g,"''")+"'!"+target.a1;
 var fields="spreadsheetId,sheets(properties(sheetId),data(startRow,startColumn,rowData(values(userEnteredValue,note))))";
 var url="https://sheets.googleapis.com/v4/spreadsheets/"+OT_BRIDGE.SPREADSHEET_ID+
  "?ranges="+encodeURIComponent(range)+"&fields="+encodeURIComponent(fields);
 var failures=[];
 for(var attempt=1;attempt<=3;attempt++){
  var resp=UrlFetchApp.fetch(url,{method:"get",muteHttpExceptions:true,
   headers:{"Authorization":"Bearer "+ScriptApp.getOAuthToken()}});
  var code=resp.getResponseCode();
  if(code===200){
   var data;
   try{data=JSON.parse(resp.getContentText());}
   catch(e){throw Error("原工時格資料回應不是 JSON，禁止寫入。");}
   if(data.spreadsheetId!==OT_BRIDGE.SPREADSHEET_ID)
    throw Error("原工時格資料回應試算表 ID 不符，禁止寫入。");
   var matches=(data.sheets||[]).filter(function(s){
    return s.properties&&s.properties.sheetId===target.sheetId;
   });
   if(matches.length!==1)throw Error("原工時格來源分頁 ID 不符，禁止寫入。");
   var blocks=(matches[0].data||[]).filter(function(x){
    return x.startRow===target.row-1&&x.startColumn===target.col-1;
   });
   if(blocks.length!==1)
    throw Error("原工時格資料缺少預期的唯一座標，禁止寫入。");
   var row=blocks[0].rowData||[],cell=(row[0]&&row[0].values||[])[0]||{};
   var v=cell.userEnteredValue||{};
   var kind=Object.prototype.hasOwnProperty.call(v,"formulaValue")?"formula":
    Object.prototype.hasOwnProperty.call(v,"numberValue")?"number":
    Object.prototype.hasOwnProperty.call(v,"stringValue")?"string":
    Object.prototype.hasOwnProperty.call(v,"boolValue")?"bool":"blank";
   return {kind:kind,number:kind==="number"?v.numberValue:null,
    formula:kind==="formula"?String(v.formulaValue):"",
    note:String(cell.note||"")};
  }
  failures.push(code);
  if([429,500,502,503,504].indexOf(code)<0||attempt===3)break;
  Utilities.sleep(400*attempt);
 }
 throw Error("原工時格值／公式／Note 讀取失敗（HTTP "+failures.join(",")+"），禁止寫入。");
}
/**
 * V1.9：工時格 Note 只顯示申請人的加班原因。
 * 工單編號放在隱藏來源表 A 欄及 Supabase，避免顯示 BUS-SYNC。
 * 為防重複核准，正式工時與來源表 J 欄在同一個 batchUpdate 內原子寫入。
 */
function otApprove_(ss,r){
 if(!r.manager_name||!r.manager_time)throw Error("後端沒有主管核准人或核准時間。");
 var src=otRegisteredSource_(ss,r),values=src.values,target=src.target;
 if(!["待核准","已核准"].includes(String(values[15])))
  throw Error("來源表已駁回或狀態異常。");
 if(String(values[15])==="已核准"&&String(values[16])!==String(r.manager_name))
  throw Error("Google 核准人與後端不符。");
 var expectedNote=String(r.reason);
 var before=otCellReadApi_(target);
 // 來源必須由同一申請編號找到對應列。已同步標記與工時格必須同時吻合。
 var sourceSynced=String(values[9])==="已同步";
 var already=before.kind==="number"&&Number(before.number)===Number(r.hours)&&
  before.note===expectedNote&&before.formula===""&&sourceSynced;
 if(!already){
  if(before.kind!=="blank"||before.note!=="")
   throw Error("原工時格已有工時／公式／註解，禁止覆蓋或重複加時數。");
  if(sourceSynced||String(values[9])!=="待同步")
   throw Error("Google 來源同步狀態與空白工時格不一致，禁止重複寫入。");
  var update={updateCells:{
   start:{sheetId:target.sheetId,rowIndex:target.row-1,columnIndex:target.col-1},
   rows:[{values:[{userEnteredValue:{numberValue:r.hours},note:expectedNote}]}],
   fields:"userEnteredValue,note"
  }};
  // 同一 Google batchUpdate 內同步寫入原工時與來源 J/K/L，成功才有冪等依據。
  var status={updateCells:{
   start:{sheetId:OT_BRIDGE.SOURCE_ID,rowIndex:src.row-1,columnIndex:9},
   rows:[{values:["已同步",target.name,target.a1].map(otRequest_)}],
   fields:"userEnteredValue"
  }};
  otGoogleBatch_([update,status]);
 }
 var checked=null;
 for(var attempt=0;attempt<3;attempt++){
  checked=otCellReadApi_(target);
  if(checked.kind==="number"&&Number(checked.number)===Number(r.hours)&&
     checked.formula===""&&checked.note===expectedNote)break;
  if(attempt<2)Utilities.sleep(350*(attempt+1));
 }
 if(checked.kind!=="number"||Number(checked.number)!==Number(r.hours)||
    checked.formula!==""||checked.note!==expectedNote)
  throw Error("正式工時與加班原因 Note 讀回不一致，禁止標示已核准。");
 // 核准前再次驗證來源表已同步及申請編號、目的儲存格相符。
 var afterHours=otSourceReadApi_(src.row);
 if(String(afterHours[0])!==String(r.request_no)||
    String(afterHours[9])!=="已同步"||
    String(afterHours[10])!==target.name||
    String(afterHours[11])!==target.a1)
  throw Error("正式工時與 Google 來源表的同步標記不一致，禁止標示已核准。");
 if(String(values[15])!=="已核准"){
  var approve={updateCells:{
   start:{sheetId:OT_BRIDGE.SOURCE_ID,rowIndex:src.row-1,columnIndex:15},
   rows:[{values:["已核准",r.manager_name,otTaiwanDateSerial_(r.manager_time)].map(otRequest_)}],
   fields:"userEnteredValue"
  }};
  otGoogleBatch_([approve]);
 }
 var after=otSourceReadApi_(src.row);
 if(String(after[15])!=="已核准"||String(after[16])!==String(r.manager_name)||
    String(after[9])!=="已同步")
  throw Error("主管核准資料更新後讀回不吻合。");
 return {row:src.row};
}
function otReject_(ss,r){
 var src=otRegisteredSource_(ss,r);
 if(String(src.values[15])==="已駁回"){
  if(String(src.values[9])!=="不需同步")
   throw Error("Google 來源表駁回狀態與同步狀態不一致，需人工核對。");
  return {row:src.row};
 }
 if(String(src.values[15])!=="待核准")throw Error("已核准工單禁止駁回覆蓋。");
 var now=r.manager_time?otTaiwanDateSerial_(r.manager_time):otTaiwanDateSerial_(new Date());
 otGoogleBatch_([
  {updateCells:{start:{sheetId:OT_BRIDGE.SOURCE_ID,rowIndex:src.row-1,columnIndex:9},
   rows:[{values:[otRequest_("不需同步")]}],fields:"userEnteredValue"}},
  {updateCells:{start:{sheetId:OT_BRIDGE.SOURCE_ID,rowIndex:src.row-1,columnIndex:15},
   rows:[{values:["已駁回",r.manager_name||"系統",now].map(otRequest_)}],
   fields:"userEnteredValue"}}
 ]);
 var after=otSourceReadApi_(src.row);
 if(after[15]!=="已駁回"||after[9]!=="不需同步")throw Error("駁回寫入讀回失敗。");
 return {row:src.row};
}

/**
 * 讀取測試：只核對 11月份E4!CO20 的工時、註解、留言。
 * 不寫入任何儲存格、不調整 Supabase 工單狀態、不執行主管核准。
 * 用途：復原 BUS-20261118-E4-3045-B23FB6D7 前進行安全確認。
 */
/**
 * 唯讀診斷：不會寫入正式月表、申請狀態或授權資訊。
 * 工時與同格 Note 由 Google REST API 讀回，不再依賴留言 API。
 */
function diagnoseBusinessOvertimeCO20(){
 var ss=SpreadsheetApp.getActiveSpreadsheet();
 if(!ss||ss.getId()!==OT_BRIDGE.SPREADSHEET_ID)
  throw Error("請從正式 2026 加班試算表開啟此 Apps Script。");
 var sheet=ss.getSheetByName("11月份E4");
 if(!sheet||sheet.getSheetId()!==546352969)
  throw Error("正式 11月份E4 分頁 ID 不符，停止診斷。");
 var target={sheetId:sheet.getSheetId(),name:sheet.getName(),
  row:20,col:93,a1:"CO20"};
 var result={ok:false,read_only:true,request_no:"BUS-20261118-E4-3045-B23FB6D7",
  target:"11月份E4!CO20",note_only_mode:true,
  comments_untouched:true,comments_verified:false,safe_for_note_only:false};
 try{
  var cell=otCellReadApi_(target);
  result.value_empty=cell.kind==="blank";
  result.formula_empty=cell.formula==="";
  result.note_empty=cell.note==="";
  result.ok=true;
  result.safe_for_note_only=result.value_empty&&result.formula_empty&&result.note_empty;
  result.existing_kind=cell.kind;
 }catch(e){result.error=String(e);}
 Logger.log(JSON.stringify(result));
 return result;
}
