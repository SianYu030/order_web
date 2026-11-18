/* V1.1.29 - 同步核准與駁回，Google 來源驗證，月檢視深連結及定時更新。 */
(function(){
"use strict";
const URL="https://mjcbixcgbcybtciribar.supabase.co/functions/v1/overtime-requests";
const RECEIPTS_KEY="rightway-business-overtime-receipts-v1";
const SESSION_KEY="rightway-overtime-supervisor-session-v1";
const portal=document.documentElement.dataset.portal||"employee";
async function call(action,data={},auth=false){
 const token=auth?sessionStorage.getItem(SESSION_KEY):null;
 if(auth&&!token)throw Error("請先登入主管帳號");
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
let panel,content,status,refresh,loading=false,deepLinkHandled=false;
const query=new URLSearchParams(window.location.search);
const deepRequest=String(query.get("approve")||"").slice(0,120);
const deepAction=query.get("action")==="reject"?"reject":"approve";
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
 if(window.SupervisorAuth?.signedIn())void load();
 document.addEventListener("visibilitychange",()=>{if(!document.hidden&&window.SupervisorAuth?.signedIn())void load();});
 window.addEventListener("focus",()=>{if(window.SupervisorAuth?.signedIn())void load();});
 window.setInterval(()=>{if(!document.hidden&&window.SupervisorAuth?.signedIn())void load();},30000);
}
async function load(){
 if(!panel||loading)return;
 if(!window.SupervisorAuth?.signedIn()){
  status.textContent="請先登入主管帳號，才可查看後端申請。";
  content.replaceChildren();return;
 }
 loading=true;refresh.disabled=true;status.textContent="正在讀取後端申請…";
 try{
  const result=await api.queue();
  content.replaceChildren();
  const rows=result.records||[];
  const approvable=rows.filter(x=>x.status==="待核准"&&x.source_sheet==="業務假日或臨時加班登記"&&/^A([2-9]|[1-9][0-9]{1,3}):R\1$/.test(x.source_range||"")).length;
  const manual=rows.filter(x=>x.status==="需人工核對").length;
  const pendingReject=rows.filter(x=>x.status==="駁回待同步").length;
  status.textContent="後端待辦 "+rows.length+" 筆，其中可核准 "+approvable+" 筆"+
   (manual?"、需人工核對 "+manual+" 筆":"")+
   (pendingReject?"、駁回待同步 "+pendingReject+" 筆":"")+
   "。Google 登記成功才可核准；駁回也須等待 Google 確認後，才從月檢視移除。";
  if(!rows.length){content.append(element("div","empty","目前沒有未處理的後端申請，Google 寫入由 Apps Script 處理。"));return;}
  for(const x of rows){
   const card=element("div","overtime-backend-item");
   const top=element("div","overtime-backend-top");
   top.append(element("strong","",x.date+" · "+x.employee_name+" · "+x.hours+" 小時"));
   top.append(element("span","overtime-backend-status",x.status));
   card.append(top);
   card.append(element("p","helper",x.department+"｜"+x.reason));
   card.append(element("p","helper small","申請編號："+x.request_no));
   const googleReady=x.status==="待核准"&&x.source_sheet==="業務假日或臨時加班登記"&&
    /^A([2-9]|[1-9][0-9]{1,3}):R\1$/.test(x.source_range||"");
   const unsynced=["待同步","同步失敗"].includes(x.status);
   if(googleReady||unsynced){
    const controls=element("div","overtime-backend-actions");
    if(googleReady){
      const approve=element("button","primary-btn","主管核准");
      approve.type="button";controls.append(approve);
      approve.addEventListener("click",async()=>{
       if(!confirm("確定核准？\n"+x.date+" · "+x.employee_name+
         "\n加班 "+x.hours+" 小時\n原因："+x.reason+
         "\n\n核准後由 Google 同步器核對並寫入正式工時；尚未代表已完成寫入。"))return;
       Array.from(controls.querySelectorAll("button")).forEach(b=>b.disabled=true);
       try{await api.approve(x.id);await loadAfterAction("主管核准已送出，正在等待 Google 回寫正式工時。");}
       catch(e){status.textContent="核准未完成："+e.message;Array.from(controls.querySelectorAll("button")).forEach(b=>b.disabled=false);}
      });
    }
    const reject=element("button","secondary-btn overtime-reject-btn",
      googleReady?"駁回刪除（移出月檢視）":"駁回申請");
    reject.type="button";controls.append(reject);
    reject.addEventListener("click",async()=>{
     const warning="確定駁回？\n"+x.date+" · "+x.employee_name+
       "\n加班 "+x.hours+" 小時\n原因："+x.reason+
       "\n\n駁回後不會寫入正式工時；已同步至 Google 的申請，會在 Google 確認駁回後從月檢視移除。原申請與操作紀錄仍保留。";
     if(!confirm(warning))return;
     Array.from(controls.querySelectorAll("button")).forEach(b=>b.disabled=true);
     try{
      const result=await api.reject(x.id);
      await loadAfterAction(result.message||"駁回已送出，請確認 Google 同步狀態。");
     }catch(e){status.textContent="駁回未完成："+e.message;Array.from(controls.querySelectorAll("button")).forEach(b=>b.disabled=false);}
    });
    card.append(controls);
    card.append(element("p","helper small",googleReady?
     "核准與駁回皆需主管確認；駁回時會先同步 Google，成功才從月檢視移除。":
     "Google 來源清單尚未完成同步，目前不可核准；仍可駁回未同步的申請。"));
   }else if(x.status==="待核准"){
    card.append(element("p","helper small","Google 來源儲存格尚未通過驗證，暫停核准與駁回，請管理員核對。"));
   }else if(x.status==="同步中"){
    card.append(element("p","helper small","Google 同步器正在處理，完成前不可核准或駁回。"));
   }else if(x.status==="核准待同步"){
    card.append(element("p","helper small","主管已核准，正在等待 Google 寫入並讀回正式工時與註解。"));
   }else if(x.status==="駁回待同步"){
    card.append(element("p","helper small","主管已駁回，正在等待 Google 更新來源表並驗證，完成後才從月檢視移除。請勿重複操作。"));
   }else if(x.status==="需人工核對"){
    card.append(element("p","helper small","Google 同步或驗證失敗，已停止自動寫入，需管理員核對原工單與 Google 來源表；不要重複提交。"));
   }else{
    card.append(element("p","helper small","目前狀態不允許再次處理。"));
   }
   if(deepRequest&&x.request_no===deepRequest&&!deepLinkHandled){
     card.classList.add("overtime-targeted-card");
     const guide=element("p","overtime-deeplink-guide",deepAction==="reject"?
      "已從 Google 月檢視定位到這筆申請。請核對資料，再按「駁回刪除」，系統不會自動駁回。":
      "已從 Google 月檢視定位到這筆申請。請核對資料，再按「主管核准」，系統不會自動核准。");
     card.prepend(guide);
     deepLinkHandled=true;
     window.requestAnimationFrame(()=>card.scrollIntoView({behavior:"smooth",block:"center"}));
   }
   content.append(card);
  }
 }catch(e){content.replaceChildren();status.textContent="讀取後端清單失敗："+e.message;}
 finally{refresh.disabled=false;loading=false;}
}
async function loadAfterAction(successMessage){
 loading=false;
 await load();
 status.textContent=successMessage+"（資料已重新讀取）";
}
document.addEventListener("DOMContentLoaded",init);
})();