/*
 * In-place maintenance center upgrade gate.
 * V9 remains the live UI until the EXISTING GS deployment announces its V10
 * backend marker. No second site, no alternate spreadsheet and no test data.
 *
 * Safety: V10 modules are downloaded ONLY after the live /exec ping confirms
 * V10-manager-20261014. Repair entry is disabled during the short check.
 */
(function () {
  "use strict";
  const repairBtn=document.getElementById("repairModeBtn");
  if(!repairBtn) return;
  const oldTitle=repairBtn.getAttribute("title")||"";
  const oldButtonLabel=repairBtn.textContent;
  const scriptVersion="20261016d";
  repairBtn.disabled=true;
  repairBtn.textContent="維修處理（載入中…）";
  repairBtn.setAttribute("title","確認維修系統後端版本中");
  // Preload code in parallel with ping, but NEVER execute it before backend
  // compatibility is verified. Actual execution stays ordered (timer, RBAC).
  ["./v10_worktimer.js","./v10_rbac.js"].forEach(path=>{
    const preload=document.createElement("link");
    preload.rel="preload";preload.as="script";
    preload.href=path+"?v="+scriptVersion;
    document.head.appendChild(preload);
  });

  function appendScript(path){
    return new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src=path+"?v="+scriptVersion;
      script.onload=resolve;
      script.onerror=()=>reject(new Error("V10 網頁程式載入失敗："+path));
      document.body.appendChild(script);
    });
  }

  function showUnavailable(error){
    repairBtn.disabled=true;
    repairBtn.textContent=oldButtonLabel;
    repairBtn.setAttribute("title","維修模式暫時無法啟用，請重新整理");
    let note=document.getElementById("v10LoadNotice");
    if(!note){
      note=document.createElement("div");
      note.id="v10LoadNotice";
      note.setAttribute("role","alert");
      note.style.cssText="padding:10px 13px;margin:8px 0;background:#fff1ee;border:1px solid #e6a69a;color:#8b3023;border-radius:10px;font-weight:700;font-size:13px";
      const parent=repairBtn.closest(".mode-tabs")||repairBtn.parentNode;
      parent.parentNode.insertBefore(note,parent.nextSibling);
    }
    note.textContent="維修模式暫停啟用："+(error&&error.message?error.message:"後端連線異常")+"。報修資料請勿重複送出；稍後重新整理。";
  }

  (async()=>{
    try{
      const ping=await jsonp_("ping",{},18000);
      if(!ping || ping.ok!==true) throw new Error("後端健康檢查失敗");
      if(ping.timerVersion==="V10-manager-20261014"){
        await appendScript("./v10_worktimer.js");
        await appendScript("./v10_rbac.js");
        if(!window.__v10RepairTimerReady || !window.__v10RepairAuthReady || typeof v10AuthToken_!=="function")
          throw new Error("V10 計時或機修管理員模組未正確載入");
        const title=document.querySelector("#repairLoginModal h2");
        if(title) title.textContent="機修管理員登入";
        const hint=document.querySelector("#repairLoginModal .login-demo");
        if(hint) hint.textContent="機修管理員請以個人帳號與密碼登入。登入後可自行修改密碼。";
      }else if(ping.timerVersion) {
        throw new Error("後端版本尚未通過 V10 相容檢查");
      }
      // No V10 marker = the original V9 deployment is still running.
      // Keep original V4.4.52 handlers fully unchanged.
      repairBtn.disabled=false;
      repairBtn.textContent=oldButtonLabel;
      if(oldTitle) repairBtn.setAttribute("title",oldTitle);
      else repairBtn.removeAttribute("title");
    }catch(err){
      showUnavailable(err);
    }
  })();
})();
