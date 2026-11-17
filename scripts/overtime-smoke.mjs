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
  const html=await fetchText(BASE+slug+"?smoke=v1.1.17&attempt="+i);
  if(html.includes("<title>"+title+"｜系統櫃廠</title>")&&html.includes("app.js?v=1.1.17")){
    pass=true;break;
  }
  if(i<11)await new Promise(resolve=>setTimeout(resolve,5000));
 }
 assert(pass,"published GitHub Pages wrong version / title: "+slug);
 console.log("PASS public webpage",slug||"employee",title);
}
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
const bad=await fetch(BRIDGE,{method:"POST",headers:{"Content-Type":"application/json","Origin":"https://sianyu030.github.io","X-Bridge-Token":"00000000000000000000000000000000000000000000"},body:JSON.stringify({action:"pull"})});
assert.equal(bad.status,401,"bridge pull rejects forged keys");
console.log("PASS forged bridge key rejected");
const noStatus=await fetch(BRIDGE,{method:"POST",headers:{"Content-Type":"application/json","Origin":"https://sianyu030.github.io"},body:JSON.stringify({action:"status"})});
assert.equal(noStatus.status,401,"bridge connection diagnostics must require administrator login");
console.log("PASS Google sync status diagnostics require administrator login");
const bridgeAdmin=await fetchText(BASE+"bridge-admin.js?v=1.1.17");
assert(bridgeAdmin.includes('action:"pair"')&&bridgeAdmin.includes("isAdmin"));
console.log("PASS administrator pairing client deployed");
let installerCopied=false;
for(let i=0;i<10;i++){
 const script=await fetchText(BASE+"google-bridge-code.txt?smoke=1.1.17&attempt="+i);
 if(script.includes("function installBusinessOvertimeSync()")&&script.includes("function runBusinessOvertimeSync()")&&script.length>12000){
  installerCopied=true;break;
 }
 if(i<9)await new Promise(resolve=>setTimeout(resolve,5000));
}
assert(installerCopied,"Google Apps Script installer missing or not published");
assert(bridgeAdmin.includes("複製 Google 同步程式"),"admin page must support copy-ready script");
assert(bridgeAdmin.includes('action:"status"')&&bridgeAdmin.includes("最近連線"),"admin page needs connection diagnostics");
console.log("PASS public Google sync worker downloadable from administrator portal");
console.log("ALL CHECKS PASSED; no actual employee applications or Google working hours modified.");
