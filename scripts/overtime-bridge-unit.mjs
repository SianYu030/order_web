// Offline contract checks for the bound Google Apps Script worker.
// Never calls Sheets, Supabase or changes real work-hour cells.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const source=readFileSync("integrations/overtime-google/Code.gs","utf8");
const ctx={console,Date,Math,Number,String,Array,RegExp,Error,JSON};
runInNewContext(source,ctx,{filename:"Code.gs",timeout:3000});
assert.equal(ctx.otSerial_("2026-11-01"),46327);
assert.equal(ctx.otSerial_("2026-11-02"),46328);
assert.throws(()=>ctx.otDateParts_("2026-11-31"),/日期超出/);
assert.equal(ctx.otCol_(7),"H");
assert.equal(ctx.otCol_(12),"M");
assert.equal(ctx.otCol_(157),"FB");
const person={date:"2026-11-02",department:"E4",employee_id:"3045",
 employee_name:"潘詠升",hours:2,reason:"假日支援",
 request_no:"BUS-20261102-E4-3045-1234ABCD"};
const people=Array.from({length:173},()=>["",""]);
people[12]=["3045","潘詠升"];
const master={
 getSheetId:()=>1406600017,
 getRange:(range)=>{assert.equal(range,"A4:F503");return {getValues:()=>
  [["3045","潘詠升","大成鋼","E4","E4櫃體股","在職"]]};}
};
const month={
 getSheetId:()=>546352969,
 isSheetHidden:()=>false,
 getMaxColumns:()=>161,
 getRange:(a,b)=>{
  if(a===1){assert.equal(b,12);return {getValue:()=>new Date("2026-11-02T00:00:00Z")};}
  assert.equal(a,"C8:D180");
  return {getValues:()=>people};
 }
};
const ss={
 getSheetByName:(name)=>{
  if(name==="系統櫃人員主檔（新版）")return master;
  if(name==="11月份E4")return month;
  return null;
 }
};
ctx.Utilities={formatDate:(v,zone,fmt)=>{
 assert.equal(fmt,"yyyy-MM-dd");
 assert(["Asia/Taipei","UTC"].includes(zone));
 return v.toISOString().slice(0,10);
}};
const target=ctx.otTarget_(ss,person);
assert.equal(target.row,20);
assert.equal(target.col,13);
assert.equal(target.a1,"M20");
assert.equal(target.name,"11月份E4");
const expectedSource=[person.request_no,46328,2026,11,"E4","3045","潘詠升",2,"假日支援",
 "待同步","11月份E4","M20",0,0,"Supabase員工網站","待核准","",""];
assert.equal(ctx.otMatches_(expectedSource,person,target),true);
assert(scriptSourceValid_());
function scriptSourceValid_(){
  assert.match(source,/r\.employee_name,r\.hours,r\.reason,"待同步",target\.name/,"source J status must be a valid dropdown value");
  assert.match(source,/String\(verify\[9\]\)!=="待同步"/,"source status must be checked after write");
  return true;
}
assert.equal(ctx.otSourceFind_([expectedSource],person).row,2);
assert.throws(()=>ctx.otSourceFind_([expectedSource,expectedSource],person),/重複/);
const modified=[...expectedSource];modified[7]=4;
assert.equal(ctx.otMatches_(modified,person,target),false);
const badMonth={...month,getRange:(a,b)=>a===1?{getValue:()=>new Date("2026-11-03T00:00:00Z")}:{getValues:()=>people}};
assert.throws(()=>ctx.otTarget_({...ss,getSheetByName:n=>n==="11月份E4"?badMonth:ss.getSheetByName(n)},person),/日期欄不吻合/);
console.log("PASS offline Google synchronization mapping and safety checks");


// Install function must never suspend the IDE with Spreadsheet UI prompts.
const installerSource=source.slice(source.indexOf("function installBusinessOvertimeSync(){"),source.indexOf("function testBusinessOvertimeSync(){"));
assert(!installerSource.includes("getUi("),"installer must not show Spreadsheet UI");
assert(!installerSource.includes(".prompt(")&&!installerSource.includes(".alert("),"installer must not wait for a dialog");
const originalBridge=ctx.otBridgeApi_;
let bridgeCalls=0, triggerCreations=0, triggerDeletes=0, token="A".repeat(48),
 triggerSeq=0, scriptProperties={};
function fakeTrigger(id){
 return {getHandlerFunction:()=> "runBusinessOvertimeSync",getUniqueId:()=>id};
}
let triggerSet=[fakeTrigger("old-five-minute")];
ctx.SpreadsheetApp={getActiveSpreadsheet:()=>({getId:()=>ctx.OT_BRIDGE.SPREADSHEET_ID})};
ctx.PropertiesService={getScriptProperties:()=>({
 getProperty:(key)=>key==="BUSINESS_OVERTIME_SYNC_TOKEN"?token:(scriptProperties[key]||null),
 setProperty:(key,value)=>{scriptProperties[key]=value;}
})};
ctx.ScriptApp={
 getProjectTriggers:()=>triggerSet,
 deleteTrigger:(old)=>{triggerDeletes++;triggerSet=triggerSet.filter(x=>x!==old);},
 newTrigger:(name)=>{assert.equal(name,"runBusinessOvertimeSync");return {
  timeBased(){return this;},
  everyMinutes(x){assert.equal(x,1,"the backup must run every minute");return this;},
  create(){triggerCreations++;const t=fakeTrigger("new-"+(++triggerSeq));triggerSet.push(t);return t;}
 }}
};
ctx.Logger={log:()=>{}};
ctx.otBridgeApi_=(action,data)=>{assert.equal(action,"pull");bridgeCalls++;return {ok:true,records:[]};};
const installed=ctx.installBusinessOvertimeSync();
assert.equal(installed.ok,true);
assert.equal(installed.triggers,1);
assert.equal(installed.interval_minutes,1);
assert.equal(triggerCreations,1);
assert.equal(triggerDeletes,1,"old five-minute trigger must be removed");
assert.equal(triggerSet.length,1);
assert.equal(triggerSet[0].getUniqueId(),"new-1");
assert.equal(scriptProperties.BUSINESS_OT_TRIGGER_MINUTES,"1");
assert.equal(bridgeCalls,1);
ctx.installBusinessOvertimeSync();
assert.equal(triggerCreations,1,"second install must not duplicate one-minute trigger");
token="";
assert.throws(()=>ctx.installBusinessOvertimeSync(),/BUSINESS_OVERTIME_SYNC_TOKEN/);
assert.equal(triggerCreations,1);
console.log("PASS replace existing five-minute trigger with exactly one one-minute trigger");

// Webhook must reject forgery, stale timestamps and invalid events without touching a sheet.
// Signed notifications may only invoke the same audited Google polling routine.
import {createHash,createHmac} from "node:crypto";
token="A".repeat(48);
ctx.Utilities.DigestAlgorithm={SHA_256:"sha256"};
ctx.Utilities.Charset={UTF_8:"utf8"};
const signedBytes=(buffer)=>Array.from(buffer).map(n=>n>127?n-256:n);
ctx.Utilities.computeDigest=(algorithm,value)=>signedBytes(createHash("sha256").update(value,"utf8").digest());
ctx.Utilities.computeHmacSha256Signature=(message,key)=>signedBytes(createHmac("sha256",key).update(message,"utf8").digest());
ctx.ContentService={
 createTextOutput:(payload)=>({payload,setMimeType(){return this;}}),
 MimeType:{JSON:"application/json"}
};
let callCount=0;
const wakeCache=new Map();
ctx.CacheService={getScriptCache:()=>({
 get:k=>wakeCache.get(k)||null,
 put:(k,v)=>wakeCache.set(k,v)
})};
ctx.runBusinessOvertimeSync=()=>{callCount++;return {ok:true,processed:0};};
const webhookId="00000000-0000-4000-8000-000000000000";
const timestamp=Date.now();
const makePost=(body)=>({postData:{contents:JSON.stringify(body)}});
const readResult=(res)=>JSON.parse(res.payload);
const canonical=timestamp+"."+webhookId+".submit";
const signature=ctx.otWakeSignature_(canonical);
assert.match(signature,/^[a-f0-9]{64}$/);
assert.equal(readResult(ctx.doPost(makePost({ts:timestamp,id:webhookId,event:"submit",signature:"0".repeat(64)}))).ok,false);
assert.equal(readResult(ctx.doPost(makePost({ts:timestamp-500000,id:webhookId,event:"submit",signature}))).ok,false);
assert.equal(readResult(ctx.doPost(makePost({ts:timestamp,id:webhookId,event:"forged",signature}))).ok,false);
assert.equal(callCount,0,"forged notifications must not wake Google");
assert.equal(readResult(ctx.doPost(makePost({ts:timestamp,id:webhookId,event:"submit",signature}))).ok,true);
assert.equal(callCount,1);
assert.equal(readResult(ctx.doPost(makePost({ts:timestamp,id:webhookId,event:"submit",signature}))).duplicate,true);
assert.equal(callCount,1,"replayed webhook must not re-enter synchronization");
ctx.ScriptApp.getService=()=>({getUrl:()=>"https://script.google.com/macros/s/"+"A".repeat(80)+"/exec"});
ctx.otBridgeApi_=(action,payload)=>{
 assert.equal(action,"register_webhook");
 assert.equal(payload.url,"https://script.google.com/macros/s/"+"A".repeat(80)+"/exec");
 return {ok:true,registered:true};
};
assert.equal(ctx.registerBusinessOvertimeInstantWebhook().registered,true);
ctx.otBridgeApi_=originalBridge;
console.log("PASS signed webhook, time window, replay guard and installation URL validation");

// V1.4: read-only health check covers direct REST API and advanced Sheets service.
assert(source.includes("function testBusinessOvertimeSheetsApi()"));
const previousProperties=ctx.PropertiesService, previousSheets=ctx.Sheets, previousUrl=ctx.UrlFetchApp;
ctx.ScriptApp.getOAuthToken=()=>"test-only-token";
let getCalls=0;
ctx.UrlFetchApp={
 fetch:(url,opts)=>{
  assert(url.startsWith("https://sheets.googleapis.com/v4/spreadsheets/"+ctx.OT_BRIDGE.SPREADSHEET_ID+"?fields="));
  assert.equal(opts.method,"get");
  assert.equal(opts.headers.Authorization,"Bearer test-only-token");
  getCalls++;
  return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({
   spreadsheetId:ctx.OT_BRIDGE.SPREADSHEET_ID,properties:{title:"正式試算表"},
   sheets:[{properties:{sheetId:ctx.OT_BRIDGE.SOURCE_ID,title:ctx.OT_BRIDGE.SOURCE}}]
  })};
 }
};
ctx.Sheets={Spreadsheets:{get:(id,fields)=>{
 assert.equal(id,ctx.OT_BRIDGE.SPREADSHEET_ID);
 assert.equal(fields.fields,"spreadsheetId,properties(title)");
 return {spreadsheetId:id,properties:{title:"正式試算表"}};
}}};
const inspected=ctx.testBusinessOvertimeSheetsApi();
assert.equal(inspected.ok,true);
assert.equal(inspected.read_only,true);
assert.equal(inspected.http_status,200);
assert.equal(getCalls,1);
ctx.UrlFetchApp={fetch:()=>({getResponseCode:()=>403,getContentText:()=>'{"error":{"message":"API disabled"}}'})};
assert.throws(()=>ctx.testBusinessOvertimeSheetsApi(),/HTTP 403/);
ctx.UrlFetchApp=previousUrl;
ctx.Sheets=previousSheets;
ctx.PropertiesService=previousProperties;
console.log("PASS Google Sheets v4 read-only health check; 403 fail-closed; no writes");


// V1.5 registration readback must use REST to avoid stale SpreadsheetApp values.
assert(source.includes("function otSourceReadApi_(row)"));
assert(source.includes("dateTimeRenderOption=SERIAL_NUMBER"));
assert(source.includes("var verify=otSourceReadApi_(empty);"));
assert(source.includes("otMatches_(otSourceReadApi_(found.row),r,target)"));
assert(source.includes("var values=otSourceReadApi_(row);"));
assert(source.includes("var after=otSourceReadApi_(src.row);"));
let batchCalled=false,restReadCalled=false,staleRangeRead=false;
const saved={target:ctx.otTarget_,rows:ctx.otSourceRows_,batch:ctx.otGoogleBatch_,
 api:ctx.UrlFetchApp,serial:ctx.otTaiwanDateSerial_};
const restoredSource=[person.request_no,46328,2026,11,"E4","3045","潘詠升",2,
 "假日支援","待同步","11月份E4","M20",46328.56,46328.56,"Supabase員工網站","待核准"];
ctx.otTarget_=()=>target;
ctx.otSourceRows_=()=>Array.from({length:1499},()=>Array(18).fill(""));
ctx.otTaiwanDateSerial_=()=>46328.56;
ctx.otGoogleBatch_=(batch)=>{batchCalled=true;assert.equal(batch.length,1);return {};};
ctx.UrlFetchApp={
 fetch:(url,opts)=>{
  assert(batchCalled,"REST read must happen after batchUpdate");
  assert.equal(opts.method,"get");
  assert(url.includes("/values/"),"Readback must query Sheets values API");
  assert(url.includes("dateTimeRenderOption=SERIAL_NUMBER"));
  restReadCalled=true;
  return {
   getResponseCode:()=>200,
   getContentText:()=>JSON.stringify({values:[restoredSource]})
  };
 }
};
const sourceSheet={
 getRange:()=>{staleRangeRead=true;return {getValues:()=>[Array(18).fill("")]};}
};
const registration=ctx.otRegister_({getSheetByName:n=>n===ctx.OT_BRIDGE.SOURCE?sourceSheet:null},person);
assert.equal(registration.row,2);
assert.equal(batchCalled,true);
assert.equal(restReadCalled,true);
assert.equal(staleRangeRead,false,"must never use the potentially stale SpreadsheetApp cache for readback");
assert.equal(ctx.otIso_(restoredSource[1]),person.date);
const invalidSource=restoredSource.slice();
invalidSource[7]=3;
ctx.UrlFetchApp.fetch=()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({values:[invalidSource]})});
assert.throws(()=>ctx.otRegister_({getSheetByName:()=>sourceSheet},person),/讀回不一致/);
ctx.otTarget_=saved.target;
ctx.otSourceRows_=saved.rows;
ctx.otGoogleBatch_=saved.batch;
ctx.UrlFetchApp=saved.api;
ctx.otTaiwanDateSerial_=saved.serial;
console.log("PASS register writes once, verifies via Google REST not stale SpreadsheetApp cache, rejects mismatched rows");
