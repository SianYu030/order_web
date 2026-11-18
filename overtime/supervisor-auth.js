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
  function msg(t,fail=false){const e=$("supervisorMessage");if(!e)return;e.textContent=t;e.style.color=fail?"#b13032":"#35546d";e.classList.toggle("is-alert",!!fail);}
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
    // Compact only on the signed-in supervisor site; admin and login pages retain full controls.
    $("supervisorAccess")?.classList.toggle("supervisor-compact",PORTAL==="supervisor"&&signed&&!user.must_change);
    if(!signed){syncPanel();return;}
    $("supervisorSignedName").textContent=user.username+(user.display_name?" · "+user.display_name:"")+" · "+(user.role==="admin"?"系統管理員":"主管");
    $("supervisorRolePill").textContent=user.role==="admin"?"管理員":"主管";
    show("supervisorChangePrompt",!!user.must_change);
    show("supervisorChangeForm",!!user.must_change);
    show("supervisorTogglePasswordBtn",!user.must_change);
    show("supervisorAdminBox",PORTAL==="admin"&&user.role==="admin"&&!user.must_change&&isView("settings"));
    if(user.must_change)msg("這個既有帳號目前仍設有強制改密碼限制，請先修改密碼。");
    else msg("已登入"+ROLE_LABEL+"系統。主管核准會進入 Google 待同步佇列，正式工時以 Google 讀回驗證成功為準。");
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
      const identity=document.createElement("div");
      identity.className="supervisor-user-identity";
      const label=document.createElement("span");
      label.textContent=entry.username+" · "+(entry.role==="admin"?"管理員":"主管")+" · "+(entry.enabled?"啟用":"停用")+(entry.must_change?" · 待改密碼":"");
      identity.append(label);
      if(entry.role==="supervisor"){
        const name=document.createElement("small");
        name.className="supervisor-display-name";
        name.textContent=entry.display_name?"姓名："+entry.display_name:"姓名：尚未設定";
        identity.append(name);
      }
      card.append(identity);
      if(entry.role==="supervisor"){
        const actions=document.createElement("div");
        actions.className="supervisor-user-actions";
        const editName=document.createElement("button");
        editName.className="secondary-btn";
        editName.type="button";
        editName.textContent="編輯姓名";
        editName.addEventListener("click",async()=>{
          const next=prompt("請輸入主管 "+entry.username+" 的姓名（1～40字）：",entry.display_name||"");
          if(next===null)return;
          const name=next.trim();
          if(name.length<1||name.length>40||/[\u0000-\u001f\u007f]/.test(name)){
            msg("主管姓名需為1至40字且不可包含換行",true);return;
          }
          try{
            setBusy(true);
            const result=await call("rename",{username:entry.username,display_name:name});
            await loadUsers();msg(result.message);
          }catch(e){msg(e.message,true);}
          finally{setBusy(false);}
        });
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
          const pw=prompt("設定 "+entry.username+" 的登入密碼（至少4碼，可用1234，日後可由本人修改）：");
          if(pw===null)return;
          if(pw.length<4||pw.length>72){msg("密碼需為4至72碼，可先使用1234，之後自行修改",true);return;}
          try{setBusy(true);await call("reset",{username:entry.username,password:pw});await loadUsers();msg("已重設 "+entry.username+" 密碼，原登入已失效；新密碼可直接登入，日後可自行修改。");}
          catch(e){msg(e.message,true);}finally{setBusy(false);}
        });
        const remove=document.createElement("button");
        remove.className="secondary-btn delete-account-btn";
        remove.type="button";
        remove.textContent="刪除";
        remove.setAttribute("aria-label","刪除主管帳號 "+entry.username);
        remove.title="永久刪除帳號，保留過往核准與工時紀錄";
        remove.addEventListener("click",async()=>{
          const name=entry.username;
          const warning="確定永久刪除主管帳號「"+name+"」？\n\n此操作會立即取消該帳號的登入權限與所有工作階段，無法復原。原有核准、工時與稽核紀錄會保留。\n\n如果只是暫時不讓他登入，請使用「停用」。";
          if(!confirm(warning))return;
          const typed=prompt("為避免誤刪，請輸入要刪除的完整帳號："+name);
          if(typed===null)return;
          if(typed!==name){msg("帳號確認不一致，沒有刪除任何資料。",true);return;}
          try{
            setBusy(true);
            const result=await call("delete",{username:name,confirm_username:typed});
            await loadUsers();
            msg(result.message||("主管帳號 "+name+" 已刪除，歷史資料保留。"));
          }catch(e){msg(e.message,true);}
          finally{setBusy(false);}
        });
        actions.append(editName,toggle,reset,remove);
        card.append(actions);
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
    const username=value("supervisorAddName").trim(),displayName=value("supervisorAddDisplayName").trim(),password=value("supervisorAddPassword");
    try{
      setBusy(true);
      if(!/^[A-Za-z0-9_-]{2,32}$/.test(username)){
        msg("帳號需為2至32碼英文字母、數字、底線或連字號",true);return;
      }
      if(displayName.length<1||displayName.length>40||/[\u0000-\u001f\u007f]/.test(displayName)){
        msg("請填寫1至40字的主管姓名",true);return;
      }
      if(password.length<4||password.length>72){
        msg("初始密碼需為4至72碼，可先使用1234，日後自行修改",true);return;
      }
      await call("add",{username,password,display_name:displayName});
      $("supervisorAddForm").reset();
      await loadUsers();
      msg("主管 "+displayName+"（"+username+"）新增成功，可用初始密碼登入，日後可自行改密碼。");
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