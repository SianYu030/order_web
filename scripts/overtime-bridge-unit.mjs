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
let bridgeCalls=0, triggerCreations=0, token="A".repeat(48), triggerSet=[];
ctx.SpreadsheetApp={getActiveSpreadsheet:()=>({getId:()=>ctx.OT_BRIDGE.SPREADSHEET_ID})};
ctx.PropertiesService={getScriptProperties:()=>({getProperty:()=>token})};
ctx.ScriptApp={
 getProjectTriggers:()=>triggerSet,
 newTrigger:(name)=>{assert.equal(name,"runBusinessOvertimeSync");return {
  timeBased(){return this;},
  everyMinutes(x){assert.equal(x,5);return this;},
  create(){triggerCreations++;triggerSet.push({getHandlerFunction:()=>name});return this;}
 };}
};
ctx.Logger={log:()=>{}};
ctx.otBridgeApi_=(action,data)=>{assert.equal(action,"pull");bridgeCalls++;return {ok:true,records:[]};};
const installed=ctx.installBusinessOvertimeSync();
assert.equal(installed.ok,true);
assert.equal(installed.triggers,1);
assert.equal(triggerCreations,1);
assert.equal(bridgeCalls,1);
ctx.installBusinessOvertimeSync();
assert.equal(triggerCreations,1,"second install must not duplicate triggers");
token="";
assert.throws(()=>ctx.installBusinessOvertimeSync(),/BUSINESS_OVERTIME_SYNC_TOKEN/);
assert.equal(triggerCreations,1);
ctx.otBridgeApi_=originalBridge;
console.log("PASS installer no UI prompts, one sync trigger, second run idempotent, missing token rejected");
