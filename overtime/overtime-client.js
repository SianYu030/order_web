/* V1.1.15 - Supabase 業務加班收件。只保存申請，Google 正式同步另行驗證。 */
(function(){
"use strict";
const URL="https://mjcbixcgbcybtciribar.supabase.co/functions/v1/overtime-requests";
const RECEIPTS_KEY="rightway-business-overtime-receipts-v1";
const SESSION_KEY="rightway-overtime-supervisor-session-v1";
const portal=document.documentElement.dataset.portal||"employee";
async function call(action,data={},auth=false){
 const token=auth?sessionStorage.getItem(SESSION_KEY):null;
 if(auth&&!token)throw Error("請先登入主管帳號並修改預設密碼");
 let r;
 try{r=await fetch(URL,{method:"POST",cache:"no-store",
   headers:{"Content-Type":"application/json",...(token?{"Authorization":"Bearer "+token}:{})},
   body:JSON.stringify({action,...data})});
 }catch(e){throw Error("連不上公司加班收件後端，請確認網路後再試；本次未送出");}
 const json=await r.json().catch(()=>({}));
 if(!r.ok||!json.ok)throw Error(json.error||"操作失敗，請重新整理核對");
 return json;
}
function localReceipts(){
 try{const data=JSON.parse(localStorage.getItem(RECEIPTS_KEY)||"[]");return Array.isArray(data)?data:[];}catch{return [];}
}
function save(record,token,publicKey){
 const all=localReceipts().filter(x=>x.id!==record.id);
 all.push({id:record.id,receipt_token:token,public_key:publicKey,date:record.date,department:record.department,employee_name:record.employee_name});
 try{localStorage.setItem(RECEIPTS_KEY,JSON.stringify(all.slice(-120)));return true;}catch{return false;}
}
function find(publicKey,department,month){
 return localReceipts().filter(x=>x.public_key===publicKey&&x.department===department&&x.date.startsWith(month));
}
const api={call,save,find,localReceipts,
 roster:()=>call("roster"),
 submit:(data)=>call("submit",data),
 update:(data)=>call("update",data),
 receipt:(id,receipt_token)=>call("receipt",{id,receipt_token}),
 queue:()=>call("queue",{},true),
 reject:(id)=>call("reject",{id},true)
};
window.OvertimeApi=api;
if(portal!=="supervisor")return;
function element(tag,cls,txt){
 const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el;
}
let panel,content,status,refresh;
function init(){
 const parent=document.getElementById("view-batch");
 if(!parent)return;
 panel=element("section","panel overtime-backend-panel");
 const heading=element("div","overtime-backend-heading");
 heading.append(element("h3","","後端已收到的申請"));
 refresh=element("button","secondary-btn","更新收件清單");
 refresh.type="button";refresh.addEventListener("click",load);
 heading.append(refresh);panel.append(heading);
 status=element("p","helper","主管登入後顯示已送達後端的申請。");
 panel.append(status);
 content=element("div","overtime-backend-list");panel.append(content);
 parent.insertBefore(panel,parent.firstChild);
 document.addEventListener("supervisor-auth-change",load);
 if(window.SupervisorAuth?.signedIn())load();
}
async function load(){
 if(!panel)return;
 if(!window.SupervisorAuth?.signedIn()){
  status.textContent="請先登入主管帳號，才可查看後端申請。";
  content.replaceChildren();return;
 }
 refresh.disabled=true;status.textContent="正在讀取後端申請…";
 try{
  const result=await api.queue();
  content.replaceChildren();
  const rows=result.records||[];
  status.textContent="目前後端收件 "+rows.length+" 筆（包括待同步、同步失敗及已進入正式待核准）。注意：待同步不等於正式月檢視已有紀錄。";
  if(!rows.length){content.append(element("div","empty","目前沒有未處理的後端申請。"));return;}
  for(const x of rows){
   const card=element("div","overtime-backend-item");
   const top=element("div","overtime-backend-top");
   top.append(element("strong","",x.date+" · "+x.employee_name+" · "+x.hours+" 小時"));
   top.append(element("span","overtime-backend-status",x.status));
   card.append(top);
   card.append(element("p","helper",x.department+"｜"+x.reason));
   card.append(element("p","helper small","申請編號："+x.request_no));
   if(x.status==="待同步"||x.status==="同步失敗"){
    const btn=element("button","secondary-btn","駁回（移出待辦）");
    btn.type="button";
    btn.addEventListener("click",async()=>{
     if(!confirm("確定駁回 "+x.employee_name+" "+x.date+" 的加班申請？\n將保留稽核紀錄，不寫入正式工時。"))return;
     btn.disabled=true;
     try{await api.reject(x.id);await load();}
     catch(e){status.textContent="駁回未完成："+e.message;btn.disabled=false;}
    });
    card.append(btn);
   }else{
    card.append(element("p","helper small","已進入正式待核准，請改從 Google 月檢視操作。"));
   }
   content.append(card);
  }
 }catch(e){content.replaceChildren();status.textContent="讀取後端清單失敗："+e.message;}
 finally{refresh.disabled=false;}
}
document.addEventListener("DOMContentLoaded",init);
})();