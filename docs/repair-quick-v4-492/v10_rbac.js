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
     await wait(350+Math.min(i*160,800));
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
   b.disabled=true;hint.classList.add("hidden");
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
   }finally{b.disabled=false}
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
   if(account!==actor.account || !oldPassword || newPassword.length<12 ||
      newPassword.length>128 || newPassword!==confirmPassword ||
      newPassword===oldPassword){
     hint.textContent=account!==actor.account?"只能修改自己帳號的密碼":
       !oldPassword?"請輸入目前密碼":
       (newPassword.length<12||newPassword.length>128)?"新密碼需要12～128碼":
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
 deleteLiveOrder_=async function(o,btn){
   let u;
   try{u=authorized();}catch(e){return alert(e.message)}
   if(!o||!o.no)return alert("找不到工單，無法刪除");
   const typed=prompt("刪除將移除工單及追蹤紀錄（含已完成工時），並保留刪除稽核。請輸入工單號："+o.no);
   if(typed===null)return;
   if(typed.trim()!==o.no)return alert("工單號不符，已取消");
   const reason=prompt("請填寫刪除原因（至少2字）：");
   if(!reason||reason.trim().length<2)return alert("未填寫刪除原因，沒有刪除");
   const operationId=uuid();
   if(btn){btn.disabled=true;btn.textContent="刪除核對中…"}
   try{
     try{await post({action:"deleteRepairOrder",sessionToken:u.sessionToken,
       orderNo:o.no,confirmOrderNo:o.no,operationId,reason:reason.trim()});}catch(e){}
     const r=await poll("deleteResult",{operationId});
     if(!r.ok||!r.deleted||r.operationId!==operationId||r.orderNo!==o.no)
       throw Error(r.error||"後端未完成刪除");
     LIVE_ORDERS=LIVE_ORDERS.filter(x=>x.no!==o.no);
     delete REPAIR_STORE[o.no];saveLiveOrdersCache_();renderRepairOrders();
     alert("已刪除工單："+o.no+"，操作帳號："+r.account+"。稽核紀錄已保留。");
     setTimeout(()=>refreshLiveOrdersInBackground_(true),700);
   }catch(e){alert("尚未確認刪除成功："+e.message)}
   finally{if(btn){btn.disabled=false;btn.textContent="🗑 刪除工單"}}
 };
  window.__v10RepairAuthReady=true;
})();