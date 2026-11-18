/* V1.1.20：正式 Google Apps Script 同步授權管理。只有後端驗證通過的管理員可產生授權碼。 */
(function(){
"use strict";
const ROOT="https://mjcbixcgbcybtciribar.supabase.co/functions/v1/overtime-sheet-bridge";
const SESSION="rightway-overtime-supervisor-session-v1";
const APP_SCRIPT_URL="https://github.com/SianYu030/order_web/blob/main/integrations/overtime-google/Code.gs";
const COPYABLE_CODE="../google-bridge-code.txt";
const MANIFEST_URL="https://github.com/SianYu030/order_web/blob/main/integrations/overtime-google/appsscript.json";
const SPREADSHEET_URL="https://docs.google.com/spreadsheets/d/1yx_QWF4CFiRYn1Fp4osMjBAkX97_0QQu03yGJIpteLM/edit";
const $=(id)=>document.getElementById(id);
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;}
function link(href,title){const a=el("a","link",title);a.href=href;a.target="_blank";a.rel="noopener noreferrer";return a;}
function init(){
 const parent=$("view-settings");if(!parent)return;
 const panel=el("section","panel hidden");
 panel.id="overtimeGoogleBridgeSetup";
 const title=el("h3","","Google 自動同步設定");
 const intro=el("p","helper","正式同步方式：送出申請與主管核准後立即通知 Google，並保留每 1 分鐘自動補同步。Google 仍會重新核對員工、日期與主管授權，不直接相信通知內容。Google 原有工時與公式受到防覆蓋檢查。");
 const links=el("p","helper");
 links.append(link(SPREADSHEET_URL,"開啟正式試算表"),document.createTextNode("　"),link(APP_SCRIPT_URL,"查看同步程式"),document.createTextNode("　"),link(MANIFEST_URL,"權限設定"));
 const codeCopy=el("button","secondary-btn","複製 Google 同步程式");
 codeCopy.type="button";
 codeCopy.addEventListener("click",async()=>{
  codeCopy.disabled=true;
  try{
   const resp=await fetch(COPYABLE_CODE+"?v=1.1.20",{cache:"no-store"});
   if(!resp.ok)throw Error("讀取同步程式失敗 HTTP "+resp.status);
   const script=await resp.text();
   if(!script.includes("function installBusinessOvertimeSync()")||!script.includes("function runBusinessOvertimeSync()"))
    throw Error("同步程式不完整，已拒絕複製");
   await navigator.clipboard.writeText(script);
   status.textContent="已複製 V1.1.20 同步程式。請只替換「業務加班同步.gs」內容；原有「程式碼.gs」與「假日午餐月結紀錄.gs」不要更動。";
  }catch(e){status.textContent="複製失敗："+e.message+"。請使用「查看同步程式」連結。";}
  finally{codeCopy.disabled=false;}
 });
 const info=el("p","helper","V1.1.20 升級步驟：① 按「複製 Google 同步程式」，只替換現有「業務加班同步.gs」內容，保留其他程式檔與原本的 BUSINESS_OVERTIME_SYNC_TOKEN。② 儲存後，在 Apps Script 執行 installBusinessOvertimeSync，會以 1 分鐘觸發器取代原有 5 分鐘觸發器。③ 點右上角「部署 → 新增部署 → 網頁應用程式」，執行身分選「我」、存取權選「所有人」，完成 Google 授權。④ 回編輯器執行 registerBusinessOvertimeInstantWebhook，登記 Google /exec 網址。⑤ 回本頁按「檢查 Google 同步狀態」。不需要重新產生授權碼或輸入舊式 OAuth。");
 const button=el("button","primary-btn","建立 Google 同步授權碼");
 button.type="button";button.id="overtimeBridgePairButton";
 const status=el("p","helper","管理員登入後可建立此試算表專用的同步授權碼。");
 status.id="overtimeBridgePairStatus";status.setAttribute("role","status");
 const health=el("p","helper","Google 同步排程尚未確認連線。");
 health.id="overtimeBridgeHealth";health.setAttribute("role","status");
 const healthCheck=el("button","secondary-btn","檢查 Google 同步狀態");
 healthCheck.type="button";
 async function fetchHealth(){
  if(window.SupervisorAuth?.isAdmin()!==true)return;
  const sessionToken=sessionStorage.getItem(SESSION);
  if(!sessionToken){health.textContent="管理員登入逾時，暫無法查詢 Google 同步狀態。";return;}
  healthCheck.disabled=true;
  try{
   const resp=await fetch(ROOT,{method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+sessionToken},
    body:JSON.stringify({action:"status"})});
   const data=await resp.json().catch(()=>({}));
   if(!resp.ok||data.ok!==true)throw Error(data.error||"同步狀態無法查詢");
   if(!data.paired)health.textContent="Google 尚未配對：沒有有效的專用同步授權碼。";
   else if(!data.connected)health.textContent="已有 "+data.active_keys+" 組同步授權碼，但目前沒有近期 Google 連線紀錄，尚未確認自動同步已啟用。";
   else health.textContent="Google 同步器已回報連線，最近連線："+
    new Date(data.last_seen_at).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})+
    "。此狀態只證明橋接器連線，並不代表正式工時已驗收。";
   if(data.paired){
    if(!data.instant_configured)health.textContent+=" 即時通知尚未登記，請依上方步驟部署；既有定時補同步不受影響。";
    else if(data.instant_last_result==="accepted")health.textContent+=" 即時通知最近已成功送達 Google，正式工時仍以讀回驗證為準。";
    else health.textContent+=" 即時通知網址已登記，尚無成功送達的紀錄，請使用一筆已授權申請驗證。";
   }
  }catch(e){health.textContent="檢查失敗："+e.message;}
  finally{healthCheck.disabled=false;}
 }
 healthCheck.addEventListener("click",fetchHealth);
 const secretBox=el("div","hidden");secretBox.id="overtimeBridgeSecretBox";
 const secretLabel=el("label","field");
 secretLabel.append(el("span","","同步授權碼（只顯示一次）"));
 const tokenInput=el("textarea","","");tokenInput.readOnly=true;tokenInput.rows=3;
 tokenInput.style.width="100%";tokenInput.autocomplete="off";tokenInput.spellcheck=false;
 tokenInput.id="overtimeBridgeSecret";secretLabel.append(tokenInput);
 const copy=el("button","secondary-btn","複製授權碼");copy.type="button";
 copy.addEventListener("click",async()=>{
  if(!tokenInput.value)return;
  try{await navigator.clipboard.writeText(tokenInput.value);status.textContent="授權碼已複製，請貼入正式 Google Apps Script 的安裝提示框。";}
  catch(_){
   tokenInput.focus();tokenInput.select();
   status.textContent="無法自動複製，授權碼已反白，可以使用裝置的複製功能。";
  }
 });
 secretBox.append(secretLabel,copy);
 panel.append(title,intro,health,healthCheck,links,codeCopy,info,button,status,secretBox);
 parent.insertBefore(panel,parent.firstChild);
 function refresh(){
  const allowed=window.SupervisorAuth?.isAdmin()===true;
  panel.classList.toggle("hidden",!allowed);
  button.disabled=!allowed;
  if(!allowed){
   tokenInput.value="";secretBox.classList.add("hidden");
   status.textContent="需以管理員帳號登入後才能設定 Google 同步。";
   health.textContent="需登入管理員才能查看 Google 同步連線狀態。";
  }else{
   if(!tokenInput.value){
    status.textContent="管理員身分已確認。請建立 Google 同步授權碼，並將其填入 Apps Script 專案設定的指令碼屬性，勿再等待安裝對話框。";
   }
   fetchHealth();
  }
 }
 button.addEventListener("click",async()=>{
  if(!window.SupervisorAuth?.isAdmin())return;
  if(!confirm("確認建立新的 Google 同步授權碼？授權碼只能給正式試算表所屬的 Apps Script 使用，請勿傳到群組或公開網站。"))return;
  const sessionToken=sessionStorage.getItem(SESSION);
  if(!sessionToken){status.textContent="登入已過期，請重新登入管理員。";return;}
  button.disabled=true;status.textContent="正在向 Supabase 核對管理員權限並建立憑證…";
  try{
   const resp=await fetch(ROOT,{method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+sessionToken},
    body:JSON.stringify({action:"pair"})});
   const data=await resp.json().catch(()=>({}));
   if(!resp.ok||data.ok!==true||typeof data.token!=="string")
    throw Error(data.error||"管理員授權建立失敗");
   tokenInput.value=data.token;
   secretBox.classList.remove("hidden");
   status.textContent="授權碼已建立。請到 Apps Script「專案設定 → 指令碼屬性」建立 BUSINESS_OVERTIME_SYNC_TOKEN，貼上授權碼並儲存；授權碼只顯示這一次。";
   await fetchHealth();
  }catch(e){
   tokenInput.value="";secretBox.classList.add("hidden");
   status.textContent="尚未建立授權碼："+e.message;
  }finally{button.disabled=false;}
 });
 document.addEventListener("supervisor-auth-change",refresh);
 refresh();
}
document.addEventListener("DOMContentLoaded",init);
})();
