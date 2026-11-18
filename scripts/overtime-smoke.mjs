// Read-only GitHub Pages + Supabase Edge API smoke checks. No real overtime submissions.
import assert from "node:assert/strict";
const BASE="https://sianyu030.github.io/order_web/overtime/";
const EDGE="https://mjcbixcgbcybtciribar.supabase.co/functions/v1/overtime-requests";
async function fetchText(url){
 const r=await fetch(url,{headers:{"Cache-Control":"no-cache"}});assert.equal(r.status,200,url+" HTTP "+r.status);return r.text();
}
async function post(action,body={}){
 const r=await fetch(EDGE,{method:"POST",headers:{"Content-Type":"application/json","Origin":"https://sianyu030.github.io"},
 body:JSON.stringify({action,...body})});
 return {status:r.status,body:await r.json()};
}
const expected=[
 ["","業務假日或臨時加班登記"],
 ["supervisor/","業務假日或臨時加班審核"],
 ["admin/","業務假日或臨時加班管理"]
];
for(const [slug,title] of expected){
 let pass=false;
 for(let i=0;i<12;i++){
  const html=await fetchText(BASE+slug+"?smoke=v1.1.25&attempt="+i);
  if(html.includes("<title>"+title+"｜系統櫃廠</title>")&&html.includes("app.js?v="+(slug===""?"1.1.25":slug==="supervisor/"?"1.1.26":"1.1.17"))){
    pass=true;break;
  }
  if(i<11)await new Promise(resolve=>setTimeout(resolve,5000));
 }
 assert(pass,"published GitHub Pages wrong version / title: "+slug);
 console.log("PASS public webpage",slug||"employee",title);
}
let completePage="",completeApp="",receiptPublished=false;
for(let i=0;i<16;i++){
 completePage=await fetchText(BASE+"?receipt-ui=1.1.25&attempt="+i);
 if(completePage.includes('id="view-receipt"')&&completePage.includes('id="receiptRefresh"')&&completePage.includes('app.js?v=1.1.25')){
  completeApp=await fetchText(BASE+"app.js?v=1.1.25&attempt="+i);
  if(completeApp.includes('showReceiptPage(result.record,entry,saved,')&&completeApp.includes('window.OvertimeApi.receipt(latestReceipt.id,latestReceipt.token)')){
   receiptPublished=true;break;
  }
 }
 if(i<15)await new Promise(resolve=>setTimeout(resolve,5000));
}
assert(receiptPublished,"mobile receipt screen must be published with matching app.js, GitHub Pages may still be deploying");
assert(completeApp.includes('switchView("receipt")')&&completeApp.includes('state.editKey=""'),"post-submit must hide form and reset duplicate action");
assert(completeApp.includes('receiptPoller=window.setInterval(')&&completeApp.includes('window.clearInterval(receiptPoller)'),"receipt must auto-refresh without background polling after leaving");
console.log("PASS mobile completion screen, single-submit path and live status refresh code deployed");
let supervisorPageUpdated=false;
for(let i=0;i<15;i++){
 const page=await fetchText(BASE+"supervisor/?admin-review=v1.1.26&attempt="+i);
 if(page.includes('app.js?v=1.1.26')&&page.includes('overtime-client.js?v=1.1.26')&&page.includes("不需另做瀏覽器 Google OAuth")){
  const liveClient=await fetchText(BASE+"overtime-client.js?v=1.1.26&attempt="+i);
  if(liveClient.includes("主管加班審核清單")&&liveClient.includes("不要重新提交同日申請。")){
   supervisorPageUpdated=true;break;
  }
 }
 if(i<14)await new Promise(resolve=>setTimeout(resolve,4000));
}
assert(supervisorPageUpdated,"supervisor backend-only queue not yet published");
console.log("PASS supervisor no obsolete Google OAuth approval gate, true backend error displayed");
const client=await fetchText(BASE+"overtime-client.js?v=1.1.17");
assert(client.includes("overtime-requests")&&client.includes("receipt_token"));
console.log("PASS public frontend API client");
const preflight=await fetch(EDGE,{method:"OPTIONS",headers:{
 "Origin":"https://sianyu030.github.io",
 "Access-Control-Request-Method":"POST",
 "Access-Control-Request-Headers":"content-type,authorization"
}});
assert.equal(preflight.status,204,"browser preflight OPTIONS must succeed");
assert.equal(preflight.headers.get("access-control-allow-origin"),"https://sianyu030.github.io");
assert.match(preflight.headers.get("access-control-allow-methods")||"",/POST/);
assert.match(preflight.headers.get("access-control-allow-headers")||"",/content-type/i);
console.log("PASS browser CORS preflight POST/Authorization");
const roster=await post("roster");
assert.equal(roster.status,200,"roster HTTP "+roster.status+" "+JSON.stringify(roster.body));
assert.equal(roster.body.ok,true);
const people=roster.body.people;
assert.equal(people.length,7);
assert.equal(people.filter(x=>x.department==="E4").length,1);
assert.equal(people.filter(x=>x.department==="E5").length,6);
assert.equal(people.find(x=>x.department==="E4").employee_name,"潘詠升");
assert(people.every(x=>typeof x.public_key==="string"&&!Object.hasOwn(x,"employee_id")));
console.log("PASS live roster E4 1 / E5 6, private employee IDs not exposed");
const invalid=await post("submit",{department:"E4",roster_key:"00000000-0000-4000-8000-000000000000",employee_name:"測試用戶",date:"2026-11-17",hours:2,reason:"安全負面測試"});
assert.equal(invalid.status,400,"invalid submit must be rejected");
console.log("PASS invalid employee cannot submit");
const withoutAuth=await post("queue");
assert.equal(withoutAuth.status,401,"supervisor queue should require login");
console.log("PASS queue unauthorized denied");
const withoutApprove=await post("approve",{id:"00000000-0000-4000-8000-000000000000"});
assert.equal(withoutApprove.status,401,"approval must require supervisor login");
console.log("PASS supervisor approval unauthorized denied");
const invalidReceipt=await post("receipt",{id:"00000000-0000-4000-8000-000000000000",receipt_token:"fake"});
assert.equal(invalidReceipt.status,400);
console.log("PASS anonymous receipt rejected");
const BRIDGE="https://mjcbixcgbcybtciribar.supabase.co/functions/v1/overtime-sheet-bridge";
const pair=await fetch(BRIDGE,{method:"POST",headers:{"Content-Type":"application/json","Origin":"https://sianyu030.github.io"},body:JSON.stringify({action:"pair"})});
assert.equal(pair.status,401,"bridge pairing requires an authenticated administrator");
console.log("PASS bridge pairing blocked without admin session");
const pull=await fetch(BRIDGE,{method:"POST",headers:{"Content-Type":"application/json","Origin":"https://sianyu030.github.io"},body:JSON.stringify({action:"pull"})});
assert.equal(pull.status,401,"bridge pull requires its own secret token");
console.log("PASS bridge pull blocked without key");
const anonymousRegister=await fetch(BRIDGE,{method:"POST",headers:{"Content-Type":"application/json","Origin":"https://sianyu030.github.io"},body:JSON.stringify({action:"register_webhook",url:"https://script.google.com/macros/s/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/exec"})});
assert.equal(anonymousRegister.status,401,"anonymous webhook registration must be blocked");
console.log("PASS unauthorized webhook registration rejected");
const bad=await fetch(BRIDGE,{method:"POST",headers:{"Content-Type":"application/json","Origin":"https://sianyu030.github.io","X-Bridge-Token":"00000000000000000000000000000000000000000000"},body:JSON.stringify({action:"pull"})});
assert.equal(bad.status,401,"bridge pull rejects forged keys");
console.log("PASS forged bridge key rejected");
const noStatus=await fetch(BRIDGE,{method:"POST",headers:{"Content-Type":"application/json","Origin":"https://sianyu030.github.io"},body:JSON.stringify({action:"status"})});
assert.equal(noStatus.status,401,"bridge connection diagnostics must require administrator login");
console.log("PASS Google sync status diagnostics require administrator login");
const AUTH="https://mjcbixcgbcybtciribar.supabase.co/functions/v1/overtime-auth";
const unauthDelete=await fetch(AUTH,{method:"POST",headers:{"Content-Type":"application/json","Origin":"https://sianyu030.github.io"},
 body:JSON.stringify({action:"delete",username:"1494",confirm_username:"1494"})});
assert.equal(unauthDelete.status,401,"supervisor deletion must require a logged-in admin");
console.log("PASS unauthenticated supervisor deletion blocked");
const authClient=await fetchText(BASE+"supervisor-auth.js?v=1.1.23");
assert(authClient.includes('call("delete"')&&authClient.includes('confirm_username:typed')&&authClient.includes("delete-account-btn"),"admin deletion requires confirmation and UI button");
const adminPage=await fetchText(BASE+"admin/?delete-test=v1.1.21");
assert(adminPage.includes("supervisor-auth.js?v=1.1.23")&&adminPage.includes("只有管理員可刪除主管帳號"),"admin page must publish account deletion controls");
console.log("PASS administrator delete button and two-stage confirmation deployed");
assert(adminPage.includes("初始密碼（至少 4 碼，可用 1234）")&&adminPage.includes("刪除的主管帳號可以重新建立相同名稱"),"re-adding deleted accounts and temporary 1234 guidance must be visible");
console.log("PASS deleted username reuse and temporary password guidance deployed");
assert(adminPage.includes("日後於「修改我的密碼」自行更改"),"admin must explain voluntary password change");
assert(authClient.includes("可直接用初始密碼登入"),"client must allow login before voluntary password change");
console.log("PASS newly added supervisor accounts can sign in immediately; voluntary change available");
let bridgeAdmin="";
for(let i=0;i<12;i++){
 const js=await fetchText(BASE+"bridge-admin.js?v=1.1.27&attempt="+i);
 if(js.includes('action:"pair"')&&js.includes('action:"status"')&&js.includes("最近連線")){
  bridgeAdmin=js;break;
 }
 if(i<11)await new Promise(resolve=>setTimeout(resolve,5000));
}
assert(bridgeAdmin,"published bridge-admin.js is stale");
assert(bridgeAdmin.includes('action:"pair"')&&bridgeAdmin.includes("isAdmin"));
console.log("PASS administrator pairing client deployed");
assert(bridgeAdmin.includes("管理員身分已確認"),"paired admin must not display stale login-required instruction");
console.log("PASS admin authenticated state guidance is accurate");
assert(bridgeAdmin.includes("installBusinessOvertimeSync")&&bridgeAdmin.includes("registerBusinessOvertimeInstantWebhook"),"admin must show minute backup and instant webhook setup");
console.log("PASS Google script property instructions displayed");
const adminHTML=await fetchText(BASE+"admin/?bridge-ui=1.1.27");
assert(adminHTML.includes("legacyGoogleOAuthPanel")&&adminHTML.includes("bridge-admin.js?v=1.1.27"),
 "legacy OAuth must be collapsed and latest bridge guidance loaded");
console.log("PASS Google OAuth legacy fallback collapsed by default");
let installerCopied=false;
for(let i=0;i<10;i++){
 const script=await fetchText(BASE+"google-bridge-code.txt?smoke=1.4&attempt="+i);
 if(script.includes("function testBusinessOvertimeSheetsApi()")&&script.includes("read_only:true")&&script.includes("function installBusinessOvertimeSync()")&&script.includes("function doPost(e)")&&script.includes("registerBusinessOvertimeInstantWebhook")&&script.includes("everyMinutes(1)")&&script.length>18000){
  installerCopied=true;break;
 }
 if(i<9)await new Promise(resolve=>setTimeout(resolve,5000));
}
assert(installerCopied,"Google Apps Script installer missing or not published");
assert(bridgeAdmin.includes("複製 Google 同步程式"),"admin page must support copy-ready script");
assert(bridgeAdmin.includes("testBusinessOvertimeSheetsApi")&&bridgeAdmin.includes("每 1 分鐘補同步"),"admin must instruct read-only API test before installing minute trigger");
assert(bridgeAdmin.includes('action:"status"')&&bridgeAdmin.includes("最近連線"),"admin page needs connection diagnostics");
console.log("PASS public Google sync worker downloadable from administrator portal");
console.log("ALL CHECKS PASSED; no actual employee applications or Google working hours modified.");
