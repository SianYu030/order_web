/* 業務假日或臨時加班｜員工自助取消、主管已核准取消、管理員人員名冊 V1.2.3 */
(function(){
"use strict";
const ROOT="https://mjcbixcgbcybtciribar.supabase.co/functions/v1/overtime-management";
const RECEIPTS="rightway-business-overtime-receipts-v1",SESSION="rightway-overtime-supervisor-session-v1";
const portal=document.documentElement.dataset.portal||"employee";
const $=id=>document.getElementById(id);
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function block(title,parent){
 const box=node("section",undefined,"panel overtime-management-box");
 box.style.marginBottom="16px";box.style.padding="18px";box.style.background="#fff";
 const h=node("h3",title);h.style.margin="0 0 12px";box.append(h);parent.prepend(box);return box;
}
function hint(parent,text){const p=node("p",text,"helper");p.style.margin="8px 0";p.style.lineHeight="1.6";parent.append(p);return p;}
function btn(text,handler,variant){
 const b=node("button",text,variant||"secondary-btn");b.type="button";b.style.minHeight="40px";
 b.addEventListener("click",handler);return b;
}
function textField(label,type="text",max=40){
 const wrap=node("label",undefined,"field"),head=node("span",label),input=node("input");
 input.type=type;input.maxLength=max;input.required=true;input.autocomplete="off";
 wrap.append(head,input);return {wrap,input};
}
async function api(action,body={},auth=true){
 const token=auth?sessionStorage.getItem(SESSION):"";
 if(auth&&!token)throw Error("請先登入主管／管理員");
 let res;try{res=await fetch(ROOT,{method:"POST",headers:{"Content-Type":"application/json",...(auth?{"Authorization":"Bearer "+token}:{})},
 cache:"no-store",body:JSON.stringify({action,...body})});}
 catch(e){throw Error("目前無法連接公司系統，沒有完成任何操作");}
 const data=await res.json().catch(()=>({}));
 if(!res.ok||!data.ok)throw Error(data.error||"操作失敗，請更新後重試");
 return data;
}
function styleForm(form){
 form.style.display="grid";form.style.gridTemplateColumns="repeat(auto-fit,minmax(170px,1fr))";
 form.style.gap="10px";form.style.alignItems="end";form.style.marginBottom="12px";
}
function renderRoster(){
 const target=$("view-settings");if(!target)return;
 const box=block("員工名冊管理",target);
 const desc=hint(box,"新增只填工號、姓名與分類，按一次新增即可。系統自動更新驗證狀態，通過 Google 主檔與當月工時表核對後啟用。停用與刪除不影響歷史紀錄。");
 const form=node("form");styleForm(form);const id=textField("工號","text",15),name=textField("姓名","text",40),teamWrap=node("label",undefined,"field"),teamLabel=node("span","分類");
 const team=node("select");for(const t of ["業務","業助","審圖"]){const o=node("option",t);o.value=t;team.append(o);}teamWrap.append(teamLabel,team);
 const submit=btn("新增人員",()=>{},"primary-btn");submit.type="submit";form.append(id.wrap,name.wrap,teamWrap,submit);box.append(form);
 const state=hint(box,"登入管理員後讀取正式名冊。");
 const refresh=btn("重新讀取名冊",()=>void load());box.append(refresh);
 const list=node("div");box.append(list);
 let busy=false,refreshTimer=null;
 async function load(){
  if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=null;}
  let hasPending=false;
  if(!window.SupervisorAuth?.isAdmin()){state.textContent="僅管理員登入後可管理人員。";list.replaceChildren();return;}
  if(busy)return;busy=true;refresh.disabled=true;
  try{
   const r=await api("roster_list");list.replaceChildren();
   const n=(r.people||[]).length;
   hasPending=(r.people||[]).some(p=>!p.enabled&&p.validation_state==="待驗證");
   state.textContent="已登錄 "+n+" 人。"+(r.roster_ready?"Google 自動核對已接通。":"Google 新名冊驗證尚未啟用，新增人員會保持待驗證，不會直接開放申請。");
   for(const p of r.people||[]){
    const row=node("div",undefined,"supervisor-user-row");
    row.style.display="flex";row.style.flexWrap="wrap";row.style.gap="10px";
    row.style.alignItems="center";row.style.justifyContent="space-between";
    row.style.padding="10px 0";row.style.borderBottom="1px solid #e3e9f3";
    const left=node("div");left.append(node("strong",p.employee_id+" · "+p.employee_name));
    left.append(node("div",p.team+" · "+(p.enabled?"啟用":(p.validation_state==="待驗證"?"自動驗證中":(p.validation_state==="驗證失敗"?"驗證未通過":"已停用"))),"helper"));
    if(p.validation_error)left.append(node("div",p.validation_error,"helper"));
    row.append(left);
    const actions=node("div");
    actions.style.display="flex";actions.style.gap="8px";actions.style.alignItems="center";actions.style.marginLeft="auto";
    if(p.enabled){
     const off=btn("停用",async()=>{
      if(!confirm("確定停用 "+p.employee_name+"（"+p.employee_id+"）？\n既有加班與核准紀錄會保留。"))return;
      off.disabled=true;try{
       await api("roster_disable",{employee_id:p.employee_id,employee_name:p.employee_name,team:p.team});
       await loadForce();
      }catch(e){state.textContent="停用失敗："+e.message;off.disabled=false;}
     });
     actions.append(off);
    }else if(p.validation_state==="待驗證"){
     const status=node("span","驗證中，無須再點","helper");
     status.style.padding="6px 8px";status.style.color="#47627f";actions.append(status);
    }else{
     const re=btn(p.validation_state==="驗證失敗"?"重新驗證":"重新啟用",async()=>{
      re.disabled=true;try{
       const result=await api("roster_add",{employee_id:p.employee_id,employee_name:p.employee_name,team:p.team});
       await loadForce();state.textContent=result.message;
      }catch(e){state.textContent="驗證未送出："+e.message;re.disabled=false;}
     });
     actions.append(re);
    }
    const remove=btn("刪除",async()=>{
     const identity=p.employee_id+" · "+p.employee_name;
     if(!confirm("確定從員工名冊刪除「"+identity+"」？\n這會立即停用該員工，並從管理員清單移除。\n過去的加班、核准及 Google 正式工時紀錄均會保留。"))return;
     if(!confirm("最後確認：刪除「"+identity+"」的名冊資料？\n這個動作不會刪除正式人員主檔或過去工時。"))return;
     remove.disabled=true;
     try{
      const r=await api("roster_delete",{employee_id:p.employee_id,employee_name:p.employee_name,team:p.team});
      await loadForce();
      state.textContent=r.message;
     }catch(e){state.textContent="刪除失敗："+e.message;remove.disabled=false;}
    },"secondary-btn");
    remove.style.borderColor="#f4b4b4";remove.style.color="#b42323";remove.style.background="#fff8f8";
    actions.append(remove);
    row.append(actions);
    list.append(row);
   }
  }catch(e){state.textContent="名冊讀取失敗："+e.message;}
  finally{
   busy=false;refresh.disabled=false;
   if(hasPending)refreshTimer=setTimeout(()=>void load(),10000);
  }
 }
 async function loadForce(){busy=false;await load();}
 form.addEventListener("submit",async e=>{
  e.preventDefault();if(!window.SupervisorAuth?.isAdmin()||busy)return;
  const person={employee_id:id.input.value.trim(),employee_name:name.input.value.trim(),team:team.value};
  if(!person.employee_id||!person.employee_name){state.textContent="請先輸入工號與姓名";return;}
  submit.disabled=true;try{
   const r=await api("roster_add",person);state.textContent=r.message;
   id.input.value="";name.input.value="";await loadForce();state.textContent=r.message;
  }catch(err){state.textContent="新增失敗："+err.message;}
  finally{submit.disabled=false;}
 });
 document.addEventListener("supervisor-auth-change",()=>void load());
 setTimeout(()=>void load(),0);
}
function renderSupervisorCancel(){
 const target=$("view-batch");if(!target)return;
 const box=block("已核准加班取消",target);
 const notice=hint(box,"原核准工時不會直接刪除。主管確認取消後，Google 需核對原時數與備註一致，才會精準撤銷該筆。");
 const refresh=btn("更新已核准清單",()=>void load());box.append(refresh);
 const list=node("div");list.style.marginTop="12px";box.append(list);
 let busy=false;
 async function act(action,r,reason){
  try{
   const res=await api(action,{id:r.id,reason});
   notice.textContent=res.message||"已更新，請稍後核對 Google 同步狀態。";
   busy=false;await load();
  }catch(e){busy=false;notice.textContent="操作未完成："+e.message;await load();}
 }
 async function load(){
  if(busy)return;
  if(!window.SupervisorAuth?.signedIn()){
   list.replaceChildren();notice.textContent="登入主管帳號後才可查看已核准的加班。";return;
  }
  busy=true;refresh.disabled=true;list.replaceChildren();
  try{
   const data=await api("cancel_list"),ready=data.ready===true;
   const rows=(data.records||[]).filter(x=>x.status!=="已取消");
   notice.textContent=ready?"Google 安全取消同步器已接通。":"Google 安全取消同步器尚未更新，取消按鈕暫時鎖定，已核准工時不會異動。";
   if(!rows.length){list.append(node("div","目前沒有可取消或待處理的核准紀錄。","empty"));return;}
   for(const r of rows){
    const row=node("div",undefined,"overtime-backend-item");
    row.style.padding="12px";row.style.marginBottom="10px";
    row.append(node("strong",r.date+" · "+r.employee_name+" · "+r.hours+" 小時"));
    row.append(node("div",r.department+" · "+r.reason+"｜"+r.status,"helper"));
    if(r.cancellation_reason)row.append(node("div","取消原因："+r.cancellation_reason,"helper"));
    const actions=node("div");actions.style.display="flex";actions.style.gap="8px";actions.style.flexWrap="wrap";
    if(["已核准","取消待審核"].includes(r.status)){
     const cancel=btn(r.status==="取消待審核"?"確認取消":"取消已核准加班",async()=>{
      const reason=r.status==="取消待審核"?r.cancellation_reason:prompt("請輸入取消原因（例如：臨時取消加班）","");
      if(reason===null)return;
      if(String(reason).trim().length<2||String(reason).length>400){notice.textContent="請輸入 2 至 400 字取消原因";return;}
      if(!confirm("確認取消這筆已核准加班？\n"+r.date+" · "+r.employee_name+
       " · "+r.hours+" 小時\n原因："+reason+
       "\nGoogle 將僅在正式工時與原申請完全吻合時撤銷。原核准與取消紀錄都會保留。"))return;
      busy=true;cancel.disabled=true;await act("cancel_confirm",r,reason);
     },"secondary-btn");
     cancel.disabled=!ready;actions.append(cancel);
     if(r.status==="取消待審核"){
      const decline=btn("拒絕取消",async()=>{
       const explanation=prompt("拒絕取消的原因：","");
       if(explanation===null)return;
       if(explanation.trim().length<2)return;
       if(!confirm("確定拒絕這筆取消要求，保留原核准工時？"))return;
       busy=true;decline.disabled=true;await act("cancel_decline",r,explanation.trim());
      });
      actions.append(decline);
     }
    }
    if(r.status==="取消待同步")row.append(node("div","取消已核准，正在等待 Google 驗證，請勿重複操作。","helper"));
    if(r.status==="取消需人工核對")row.append(node("div","Google 工時與申請資料有衝突，已停止自動清除，需由管理員核對。","helper"));
    row.append(actions);list.append(row);
   }
  }catch(e){notice.textContent="讀取已核准清單失敗："+e.message;}
  finally{busy=false;refresh.disabled=false;}
 }
 document.addEventListener("supervisor-auth-change",()=>void load());
 setTimeout(()=>void load(),0);
}
function renderEmployeeCancel(){
 const target=$("view-entry");if(!target)return;
 // 取消申請保留為登記頁底部的收合入口，不再依賴查詢／修改分頁。
 const details=node("details",undefined,"employee-cancel-details");
 details.style.marginTop="16px";
 const box=block("取消已核准加班",details);
 const summary=node("summary","臨時取消已核准加班");
 summary.style.cssText="padding:14px 18px;cursor:pointer;font-weight:700;color:#2355ac;border:1px solid #d9e3f5;border-radius:12px;background:#fff;list-style-position:inside;";
 details.prepend(summary);
 target.append(details);
 const note=hint(box,"在原本送出申請的裝置提出取消，主管確認後才會撤銷已核准工時。");
 const trigger=btn("查看可取消的申請",()=>void load());box.append(trigger);
 const list=node("div");box.append(list);
 let busy=false;
 async function load(){
  if(busy)return;busy=true;trigger.disabled=true;list.replaceChildren();
  try{
   let items=[];try{items=JSON.parse(localStorage.getItem(RECEIPTS)||"[]");}catch{}
   if(!Array.isArray(items))items=[];
   const keys=new Set(),records=[];
   for(const r of items.slice(-40).reverse()){
    if(!r?.id||!r?.receipt_token||keys.has(r.id))continue;
    keys.add(r.id);
    try{
     const res=await fetch("https://mjcbixcgbcybtciribar.supabase.co/functions/v1/overtime-requests",{
      method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",
      body:JSON.stringify({action:"receipt",id:r.id,receipt_token:r.receipt_token})});
     const out=await res.json();
     if(res.ok&&out.ok&&["已核准","取消待審核","取消待同步","已取消","取消需人工核對"].includes(out.record?.status))
      records.push({local:r,remote:out.record});
    }catch{}
   }
   if(!records.length){note.textContent="目前這台裝置沒有可查詢的已核准申請憑證；可請主管從審核網站提出取消。";return;}
   for(const row of records){
    const r=row.remote,card=node("div",undefined,"overtime-backend-item");
    card.style.padding="10px";card.style.marginTop="8px";
    card.append(node("strong",r.date+" · "+r.employee_name+" · "+r.hours+" 小時"));
    card.append(node("div","狀態："+r.status+"｜"+r.reason,"helper"));
    if(r.status==="已核准"){
     const request=btn("申請取消",async()=>{
      const reason=prompt("請填寫臨時取消加班的原因：","");
      if(reason===null)return;if(reason.trim().length<2){note.textContent="取消原因至少 2 個字";return;}
      if(!confirm("確認向主管提出取消？\n原核准工時在主管確認之前不會清除。"))return;
      request.disabled=true;try{
       const res=await api("cancel_request",{id:r.id,receipt_token:row.local.receipt_token,reason:reason.trim()},false);
       note.textContent=res.message;await loadForce();
      }catch(e){note.textContent="取消申請未送出："+e.message;request.disabled=false;}
     });card.append(request);
    }
    list.append(card);
   }
  }catch(e){note.textContent="查詢失敗："+e.message;}
  finally{busy=false;trigger.disabled=false;}
 }
 async function loadForce(){busy=false;await load();}
}
document.addEventListener("DOMContentLoaded",()=>{
 if(portal==="admin")renderRoster();
 if(portal==="supervisor")renderSupervisorCancel();
 if(portal==="employee")renderEmployeeCancel();
});
})();
