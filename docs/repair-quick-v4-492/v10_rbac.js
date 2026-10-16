/*
 * RBAC-B staging: server-authenticated unified maintenance-manager login and auditable deletion.
 * Deploy together with matching Webhook V10; do not include passwords or secrets.
 */
(function(){
 const oldJsonp=jsonp_,wait=ms=>new Promise(r=>setTimeout(r,ms));
 const uuid=()=>{
   if(typeof crypto==="undefined"||!crypto.randomUUID)throw Error("此瀏覽器不支援安全操作，請更新");
   return crypto.randomUUID();
 };
 let auth=null;
 const deletingOrders=new Set();
 function authorized(){
   if(!auth||!repairAuth||auth.account!==currentRepairUser||!["admin","repair","repair_manager"].includes(auth.role)||auth.expiresAt<=Date.now())
     throw Error("登入已過期，請重新登入維修工作台");
   return auth;
 }
 window.v10AuthToken_=()=>authorized().sessionToken;
 async function post(body){
   await fetch(SYNC_API_URL,{method:"POST",mode:"no-cors",
      headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(body)});
 }
 async function poll(action,params,limit=20){
   for(let i=0;i<limit;i++){
     // First check immediately after POST; the POST already awaited the
     // server request. Only back off when the backend says pending.
     if(i>0)await wait(220+Math.min((i-1)*150,650));
     const r=await oldJsonp(action,params,20000);
     if(!r.pending)return r;
   }
   throw Error("尚未收到 GS 回讀確認，請先檢查試算表，避免重複操作");
 }
 // General staff can still report without logging in. Writes are POST, never GET.
 jsonp_=async function(action,params={},timeoutMs=12000){
   if(action!=="createMobileReportTest")return oldJsonp(action,params,timeoutMs);
   const requestId=String(params.requestId||uuid());
   try{await post({...params,action,requestId});}catch(e){}
   const r=await poll("createReportResult",{requestId},25);
   if(!r.ok)throw Error(r.error||"報修未成功");
   return r;
 };
 doRepairLogin=async function(){
   const account=el("repairLoginAccount").value.trim().toUpperCase();
   const password=el("repairLoginPassword").value;
   const b=el("repairLoginSubmit"),hint=el("repairLoginError");
   const originalLabel=b.textContent;
   b.disabled=true;b.textContent="登入驗證中…";hint.classList.add("hidden");
   try{
     const requestId=uuid();
     try{await post({action:"authLogin",requestId,account,password});}catch(e){}
     const r=await poll("authResult",{requestId});
     if(!r.ok||r.account!==account||!r.sessionToken||!["admin","repair","repair_manager"].includes(r.role))
       throw Error(r.error||"登入失敗");
     auth={sessionToken:r.sessionToken,account,role:r.role,expiresAt:Number(r.expiresAt)};
     repairAuth=true;currentRepairUser=account;
     el("repairLoginUser").textContent=account+"｜機修管理員";
     el("repairLoginPassword").value="";
     hideRepairLogin();switchMode("repair");
   }catch(e){
     auth=null;repairAuth=false;currentRepairUser="";
     hint.textContent="登入失敗："+e.message;hint.classList.remove("hidden");
   }finally{b.disabled=false;b.textContent=originalLabel;}
 };
 el("repairLoginSubmit").onclick=doRepairLogin;
 // Login-screen recovery requires a verified admin reset. Logged-in users can change own passwords.
 el("repairLoginChangePasswordBtn").onclick=()=>alert("請先登入機修管理員，再從右上角「修改密碼」變更；忘記密碼請洽系統管理人。");
 el("repairChangePasswordBtn").onclick=()=>{
   try{
     authorized();
     openChangePassword(currentRepairUser);
   }catch(e){alert(e.message);}
 };
 saveChangedPassword=async function(){
   const hint=el("changePasswordError"),success=el("changePasswordSuccess");
   const btn=el("changePasswordSave");
   hint.classList.add("hidden");success.classList.add("hidden");
   let actor;
   try{actor=authorized();}
   catch(e){hint.textContent=e.message;hint.classList.remove("hidden");return;}
   const account=el("changePasswordAccount").value.trim().toUpperCase();
   const oldPassword=el("changePasswordOld").value;
   const newPassword=el("changePasswordNew").value;
   const confirmPassword=el("changePasswordConfirm").value;
   if(account!==actor.account || !oldPassword || newPassword.length<4 ||
      newPassword.length>12 || newPassword!==confirmPassword ||
      newPassword===oldPassword){
     hint.textContent=account!==actor.account?"只能修改自己帳號的密碼":
       !oldPassword?"請輸入目前密碼":
       (newPassword.length<4||newPassword.length>12)?"新密碼需要4～12碼":
       newPassword!==confirmPassword?"兩次新密碼不一致":"新密碼不得和舊密碼相同";
     hint.classList.remove("hidden");return;
   }
   btn.disabled=true;
   try{
     const requestId=uuid();
     try{await post({action:"authChangePassword",sessionToken:actor.sessionToken,
       requestId,oldPassword,newPassword});}
     catch(e){/* cannot infer success from no-cors; check result */}
     const result=await poll("authChangeResult",{requestId},22);
     if(!result.ok||!result.changed||result.account!==actor.account)
       throw Error(result.error||"後端沒有確認修改成功");
     // A password update revokes all sessions because the backend stores a password-hash epoch.
     auth=null;repairAuth=false;currentRepairUser="";
     el("repairLoginUser").textContent="—";
     el("changePasswordOld").value="";
     el("changePasswordNew").value="";
     el("changePasswordConfirm").value="";
     closeChangePassword();switchMode("report");
     alert("密碼已更新。其他裝置也需要使用新密碼重新登入。");
   }catch(e){
     hint.textContent="修改密碼未確認："+e.message;
     hint.classList.remove("hidden");
   }finally{btn.disabled=false;}
 };
 el("changePasswordSave").onclick=saveChangedPassword;
 el("repairLogoutBtn").onclick=()=>{
   const prev=auth;auth=null;repairAuth=false;currentRepairUser="";
   el("repairLoginUser").textContent="—";switchMode("report");
   if(prev)post({action:"authLogout",sessionToken:prev.sessionToken}).catch(()=>{});
 };
 // No opaque-response success claims: confirm legacy content/status in a fresh list read.
 syncPost_=async function(body){
   const u=authorized();
   try{await post({...body,sessionToken:u.sessionToken});}catch(e){}
   for(let i=0;i<12;i++){
     await wait(450+Math.min(i*180,900));
     try{
       const v=await oldJsonp("listTestOrders",{},20000);
       const r=(v.orders||[]).find(x=>x.no===body.orderNo);
       if(!r)continue;
       if(body.action==="saveRepair"&&r.type===body.repairType&&r.classification===body.classification&&
          r.technician===u.account&&r.content===body.content&&r.note===body.note)return true;
       if(body.action==="setStatus"&&r.status===body.status&&r.technician===u.account)return true;
       if(body.action==="closeRepair"&&r.status==="已完成")return true;
     }catch(e){}
   }
   throw Error("未能回讀證實資料更新，請先查核正式工單");
 };
 // Unified maintenance-manager permission: signed-in accounts can delete open and completed orders.
 function deleteMessage(message,warning){
   let notice=document.getElementById("v10DeleteNotice");
   if(!notice){
     notice=document.createElement("div");notice.id="v10DeleteNotice";
     notice.setAttribute("role","status");
     notice.style.cssText="position:fixed;bottom:22px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 30px);padding:12px 18px;border-radius:12px;color:white;z-index:10000;box-shadow:0 5px 22px #0003;font-weight:700";
     document.body.appendChild(notice);
   }
   notice.style.background=warning?"#805224":"#173848";
   notice.textContent=message;
   setTimeout(()=>{if(notice.isConnected&&notice.textContent===message)notice.remove()},warning?9000:5000);
 }
 // This is a fallback only: it does not mean the delete POST succeeded.
 // An authoritative V10 backend list can confirm that the old MR is absent
 // when the operation-result poll itself times out or loses its cached result.
 async function deletedFromServerList(orderNo){
   try{
     const r=await oldJsonp("listTestOrders",{},12000);
     return !!(r && r.ok===true && r.spreadsheetId===EXPECTED_SPREADSHEET_ID &&
       Array.isArray(r.orders) && !r.orders.some(x=>x.no===orderNo));
   }catch(_){return false;}
 }
 deleteLiveOrder_=async function(o,btn){
   let u;
   try{u=authorized();}catch(e){return alert(e.message)}
   if(!o||!o.no)return alert("找不到工單，無法刪除");
   if(deletingOrders.has(o.no))return;
   const operationId=uuid();
   deletingOrders.add(o.no);
   if(btn){btn.disabled=true;btn.textContent="⏳ 刪除同步中…"}
   let confirmed=false;
   try{
     try{await post({action:"deleteRepairOrder",sessionToken:u.sessionToken,
       orderNo:o.no,confirmOrderNo:o.no,operationId,
       reason:"管理員於網頁直接刪除（未另填原因）"});}catch(e){}
     try{
       const r=await poll("deleteResult",{operationId});
       if(!r.ok||!r.deleted||r.operationId!==operationId||r.orderNo!==o.no)
         throw Error(r.error||"後端尚未確認刪除");
       confirmed=true;
     }catch(pollError){
       // Do not report 'delete failed' merely because the result cache timed out.
       if(await deletedFromServerList(o.no)) confirmed=true;
       else throw pollError;
     }
     if(!confirmed)throw Error("尚未取得正式刪除確認");
     LIVE_ORDERS=LIVE_ORDERS.filter(x=>x.no!==o.no);
     delete REPAIR_STORE[o.no];saveLiveOrdersCache_();renderRepairOrders();
     deleteMessage("✅ 工單已從正式資料刪除："+o.no,false);
     setTimeout(()=>refreshLiveOrdersInBackground_(true),1000);
   }catch(e){
     // Under a slow Apps Script connection the write may already have finished.
     // Leave the record intact until we can confirm success; never resubmit on
     // behalf of the user and never claim that a timeout means no deletion.
     deleteMessage("⏳ 刪除結果尚未確認；請按上方「更新」查看。勿重複點刪除。",true);
   }finally{
     deletingOrders.delete(o.no);
     if(btn){btn.disabled=false;btn.textContent="🗑 刪除工單"}
   }
 };
  window.__v10RepairAuthReady=true;
})();