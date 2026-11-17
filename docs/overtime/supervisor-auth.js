/* 正道業務加班：主管帳號登入。公開網站不保存密碼及伺服器金鑰。 */
(function(){
  "use strict";
  const ROOT="https://mjcbixcgbcybtciribar.supabase.co/functions/v1/overtime-auth";
  const KEY="rightway-overtime-supervisor-session-v1";
  const PORTAL=(document.documentElement.dataset&&document.documentElement.dataset.portal)||"employee";
  const ROLE_LABEL=PORTAL==="admin"?"管理員":"主管";
  const $=id=>document.getElementById(id);
  let token=sessionStorage.getItem(KEY)||"";
  let user=null;
  let busy=false;
  const show=(id,visible)=>$(id)?.classList.toggle("hidden",!visible);
  const value=id=>$(id)?.value||"";
  function msg(t,fail=false){const e=$("supervisorMessage");if(!e)return;e.textContent=t;e.style.color=fail?"#b13032":"#35546d";}
  async function call(action,body={}){
    const res=await fetch(ROOT,{
      method:"POST",cache:"no-store",
      headers:{"Content-Type":"application/json",...(token?{"Authorization":"Bearer "+token}:{})},
      body:JSON.stringify({action,...body})
    });
    let data;try{data=await res.json()}catch{throw Error("伺服器回應格式錯誤");}
    if(!res.ok||!data.ok){
      if(data.code==="AUTH"||res.status===401&&action!=="login"){token="";user=null;sessionStorage.removeItem(KEY);render();}
      throw Error(data.error||"伺服器處理失敗");
    }
    return data;
  }
  function setBusy(x){busy=x;document.querySelectorAll("#supervisorAccess button").forEach(b=>{b.disabled=x;});}
  function render(){
    const signed=!!user;
    show("supervisorLoginBox",!signed);
    show("supervisorSignedBox",signed);
    show("supervisorRolePill",signed);
    if(!signed){syncPanel();return;}
    $("supervisorSignedName").textContent=user.username+" · "+(user.role==="admin"?"系統管理員":"主管");
    $("supervisorRolePill").textContent=user.role==="admin"?"管理員":"主管";
    show("supervisorChangePrompt",!!user.must_change);
    show("supervisorChangeForm",!!user.must_change);
    show("supervisorTogglePasswordBtn",!user.must_change);
    show("supervisorAdminBox",PORTAL==="admin"&&user.role==="admin"&&!user.must_change&&isView("settings"));
    if(user.must_change)msg("初次登入必須先修改密碼，完成後才會開放"+ROLE_LABEL+"功能。");
    else msg("已登入"+ROLE_LABEL+"系統。正式核准仍須完成 Google 試算表授權。");
    syncPanel();
  }
  function isView(name){
    const section=$("view-"+name);
    return Boolean(section && !section.classList.contains("hidden"));
  }
  function ready(){
    return Boolean(user && !user.must_change && (user.role==="admin" || user.role==="supervisor"));
  }
  function syncPanel(){
    const allowed=ready(), admin=allowed&&user.role==="admin";
    const supervisorPage=PORTAL==="supervisor", adminPage=PORTAL==="admin";
    const authorized=(supervisorPage&&allowed)||(adminPage&&admin);
    show("navBatch",supervisorPage&&allowed);
    show("navSettings",adminPage&&admin);
    show("connectionStatus",adminPage&&admin);
    show("modeNotice",adminPage&&admin&&isView("settings"));
    show("supervisorPortal",true);
    show("supervisorAdminBox",adminPage&&admin&&isView("settings"));
    show("supervisorAccess",supervisorPage||adminPage);
    document.body.classList.toggle("portal-authorized",authorized);
    document.body.classList.toggle("supervisor-auth-gate",(supervisorPage||adminPage)&&!authorized);
    if(adminPage&&allowed&&!admin)msg("此網頁僅限 3109 系統管理員。請改用主管審核網址。",true);
  }
  function changed(){
    document.dispatchEvent(new CustomEvent("supervisor-auth-change",{detail:{user}}));
  }
  async function loadUsers(){
    if(user?.role!=="admin"||user.must_change)return;
    const result=await call("users");
    const box=$("supervisorUsersList");
    box.replaceChildren();
    for(const entry of result.users||[]){
      const card=document.createElement("div");
      card.className="supervisor-user-row";
      const label=document.createElement("span");
      label.textContent=entry.username+" · "+(entry.role==="admin"?"管理員":"主管")+" · "+(entry.enabled?"啟用":"停用")+(entry.must_change?" · 待改密碼":"");
      card.append(label);
      if(entry.role==="supervisor"){
        const toggle=document.createElement("button");
        toggle.className="secondary-btn";
        toggle.type="button";
        toggle.textContent=entry.enabled?"停用":"啟用";
        toggle.addEventListener("click",async()=>{
          if(!confirm("確定"+toggle.textContent+"帳號 "+entry.username+"？"))return;
          try{setBusy(true);await call("toggle",{username:entry.username,enabled:!entry.enabled});await loadUsers();msg("帳號狀態已更新");}
          catch(e){msg(e.message,true);}finally{setBusy(false);}
        });
        const reset=document.createElement("button");
        reset.className="secondary-btn";
        reset.type="button";
        reset.textContent="重設密碼";
        reset.addEventListener("click",async()=>{
          const pw=prompt("設定 "+entry.username+" 的新暫時密碼（至少4碼），主管首次登入必須更改：");
          if(pw===null)return;
          if(pw.length<4){msg("新密碼至少4碼",true);return;}
          try{setBusy(true);await call("reset",{username:entry.username,password:pw});await loadUsers();msg("已重設 "+entry.username+" 密碼，原工作階段已失效。");}
          catch(e){msg(e.message,true);}finally{setBusy(false);}
        });
        card.append(toggle,reset);
      }
      box.append(card);
    }
  }
  async function login(e){
    e.preventDefault();
    try{
      if(busy)return;setBusy(true);msg("正在核對"+ROLE_LABEL+"帳號…");
      const result=await call("login",{username:value("supervisorUsername").trim(),password:value("supervisorPassword")});
      token=result.token;user=result.user;sessionStorage.setItem(KEY,token);
      $("supervisorPassword").value="";
      render();
      if(user.role==="admin"&&!user.must_change)await loadUsers();
      changed();
    }catch(e){msg(e.message,true);}finally{setBusy(false);}
  }
  async function passwordChange(e){
    e.preventDefault();
    const old=value("supervisorOldPassword"),next=value("supervisorNewPassword"),again=value("supervisorConfirmPassword");
    if(next!==again){msg("兩次輸入的新密碼不一致",true);return;}
    if(next.length<4){msg("新密碼至少4碼",true);return;}
    try{
      setBusy(true);
      await call("change-password",{old_password:old,new_password:next});
      ["supervisorOldPassword","supervisorNewPassword","supervisorConfirmPassword"].forEach(id=>{$(id).value="";});
      const result=await call("me");user=result.user;
      render();
      if(user.role==="admin")await loadUsers();
      if(PORTAL==="admin"&&user.role!=="admin")msg("密碼修改成功，但此頁僅限 3109 系統管理員。請前往主管審核頁。",true);
      else msg("密碼修改成功。其他裝置的登入已失效。");
      changed();
    }catch(e){msg(e.message,true);}finally{setBusy(false);}
  }
  async function logOut(){
    setBusy(true);
    try{if(token)await call("logout");}catch(_){}
    token="";user=null;sessionStorage.removeItem(KEY);
    render();msg("已登出"+ROLE_LABEL+"系統。");changed();setBusy(false);
  }
  async function addUser(e){
    e.preventDefault();
    const username=value("supervisorAddName").trim(),password=value("supervisorAddPassword");
    try{
      setBusy(true);
      await call("add",{username,password});
      $("supervisorAddForm").reset();
      await loadUsers();
      msg("已新增主管 "+username+"，首次登入需修改密碼。");
    }catch(e){msg(e.message,true);}finally{setBusy(false);}
  }
  async function init(){
    $("supervisorLoginForm").addEventListener("submit",login);
    $("supervisorChangeForm").addEventListener("submit",passwordChange);
    $("supervisorLogoutBtn").addEventListener("click",logOut);
    $("supervisorAddForm").addEventListener("submit",addUser);
    $("supervisorTogglePasswordBtn").addEventListener("click",()=>show("supervisorChangeForm",$("supervisorChangeForm").classList.contains("hidden")));
    document.querySelectorAll(".view").forEach(view=>new MutationObserver(syncPanel).observe(view,{attributes:true,attributeFilter:["class"]}));
    render();syncPanel();
    if(token){
      try{const result=await call("me");user=result.user;render();if(user.role==="admin"&&!user.must_change)await loadUsers();changed();}
      catch(e){token="";user=null;sessionStorage.removeItem(KEY);render();msg("登入已過期，請重新登入。",true);}
    }
  }
  window.SupervisorAuth={
    async requireApprover(){
      if(!token)throw Error("請先在上方輸入"+ROLE_LABEL+"帳號與密碼。");
      const response=await call("review-access");
      user=response.user;render();
      return user.username;
    },
    signedIn(){return ready();},
    isAdmin(){return ready()&&user.role==="admin";},
    currentUser(){return user;}
  };
  document.addEventListener("DOMContentLoaded",init);
})();