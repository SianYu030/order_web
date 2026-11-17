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
  const html=await fetchText(BASE+slug+"?smoke=v1.1.15&attempt="+i);
  if(html.includes("<title>"+title+"｜系統櫃廠</title>")&&html.includes("app.js?v=1.1.15")){
    pass=true;break;
  }
  if(i<11)await new Promise(resolve=>setTimeout(resolve,5000));
 }
 assert(pass,"published GitHub Pages wrong version / title: "+slug);
 console.log("PASS public webpage",slug||"employee",title);
}
const client=await fetchText(BASE+"overtime-client.js?v=1.1.15");
assert(client.includes("overtime-requests")&&client.includes("receipt_token"));
console.log("PASS public frontend API client");
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
const invalidReceipt=await post("receipt",{id:"00000000-0000-4000-8000-000000000000",receipt_token:"fake"});
assert.equal(invalidReceipt.status,400);
console.log("PASS anonymous receipt rejected");
console.log("ALL CHECKS PASSED; no actual employee applications or Google working hours modified.");
