/* V1.1.26 - 主管只用後端審核清單；Google 寫入由 Apps Script 驗證。 */
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
 approve:(id)=>call("approve",{id},true),
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
 heading.append(element("h3","","主管加班審核清單"));
 refresh=element("button","secondary-btn","更新收件清單");
 refresh.type="button";refresh.addEventListener("click",load);
 heading.append(refresh);panel.append(heading);
 status=element("p","helper","主管帳號登入後，從公司後端查詢申請；不需要另行 Google OAuth。");
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
  const approvable=rows.filter(x=>x.status==="待核准"&&x.source_sheet==="業務假日或臨時加班登記"&&/^A([2-9]|[1-9][0-9]{1,3}):R\\1$/.test(x.source_range||"")).length;
  const manual=rows.filter(x=>x.status==="需人工核對").length;
  status.textContent="後端待辦 "+rows.length+" 筆，其中可核准 "+approvable+" 筆"+
   (manual?"、需人工核對 "+manual+" 筆":"")+"。只有 Google 來源登記完成後才能核准；核准後需待 Google 寫入及讀回驗證。";
  if(!rows.length){content.append(element("div","empty","目前沒有未處理的後端申請，Google 寫入由 Apps Script 處理。"));return;}
  for(const x of rows){
   const card=element("div","overtime-backend-item");
   const top=element("div","overtime-backend-top");
   top.append(element("strong","",x.date+" · "+x.employee_name+" · "+x.hours+" 小時"));
   top.append(element("span","overtime-backend-status",x.status));
   card.append(top);
   card.append(element("p","helper",x.department+"｜"+x.reason));
   card.append(element("p","helper small","申請編號："+x.request_no));
   if(x.status==="待核准" && x.source_sheet==="業務假日或臨時加班登記" && /^A([2-9]|[1-9][0-9]{1,3}):R\1$/.test(x.source_range||"")){
    const approve=element("button","primary-btn","主管核准（待正式同步）");
    approve.type="button";
    approve.addEventListener("click",async()=>{
     if(!confirm("主管確認核准？\n"+x.date+" · "+x.employee_name+"\n加班 "+x.hours+" 小時\n原因："+x.reason+
       "\n\n核准會送入 Google 工時寫入佇列；目前尚未完成 Google 正式寫入。"))return;
     approve.disabled=true;
     try{await api.approve(x.id);await load();}
     catch(e){status.textContent="核准未完成："+e.message;approve.disabled=false;}
    });
    card.append(approve);
   }
   if(["待同步","同步失敗"].includes(x.status)){
    const reject=element("button","secondary-btn","駁回（保留紀錄）");
    reject.type="button";
    reject.addEventListener("click",async()=>{
     if(!confirm("確定駁回 "+x.employee_name+" "+x.date+" 的加班申請？\n保留稽核紀錄，Google 正式工時不寫入。"))return;
     reject.disabled=true;
     try{await api.reject(x.id);await load();}
     catch(e){status.textContent="駁回未完成："+e.message;reject.disabled=false;}
    });
    card.append(reject);
    card.append(element("p","helper small","等待來源清單同步完成，暫不可核准。"));
   }else if(x.status==="待核准"){
    card.append(element("p","helper small","申請已寫入 Google 來源清單；可核准後排入正式工時同步，但此頁暫不提供跨系統駁回。"));
   }else if(x.status==="同步中"){
    card.append(element("p","helper small","Google 同步器已鎖定此申請，處理完成前禁止修改或駁回。"));
   }else if(x.status==="核准待同步"){
    card.append(element("p","helper small","主管已核准；正式 Google 工時及註解尚待同步核對，不會重複核准。"));
   }else if(x.status==="需人工核對"){
    card.append(element("p","helper small","Google 同步失敗或資料檢核未通過，系統已停止此筆自動寫入。尚未完成主管核准，請管理員查明錯誤並確認 Google 來源表，再安全恢復同步；不要重新提交同日申請。"));
   }else{
    card.append(element("p","helper small","目前狀態不允許再次處理。"));
   }
   content.append(card);
  }
 }catch(e){content.replaceChildren();status.textContent="讀取後端清單失敗："+e.message;}
 finally{refresh.disabled=false;}
}
document.addEventListener("DOMContentLoaded",init);
})();