/**
 * Read-only Google Apps Script V3.3 receiver handshake test.
 * No MR creation, no LINE, no file transfer, no staff credential form.
 * Only allowed RPC action: drivePilotHealthcheck (health).
 */
(() => {
  'use strict';
  const CHANNEL='repair-drive-mr-v1';
  const EXPECT_VERSION='3.3';
  const id=(s)=>document.getElementById(s);
  const form=id('configForm'), input=id('devUrl'), connect=id('connectBtn'),
        verify=id('verifyBtn'), detail=id('status'), steps=id('steps');
  const DEV=/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/dev$/;
  let popup=null,nonce='',remote=null,remoteOrigin='',counter=0, pending=null, ready=false;

  function message(text,good=false){
    detail.textContent=text;
    detail.dataset.state=good?'success':'pending';
  }
  function originAllowed(origin){
    try {
      const u=new URL(origin);
      if(u.protocol!=='https:')return false;
      return u.hostname==='script.google.com' ||
             u.hostname==='script.googleusercontent.com' ||
             /^[a-z0-9-]+-script\.googleusercontent\.com$/.test(u.hostname);
    }catch(_){return false;}
  }
  function reset(){
    ready=false;remote=null;remoteOrigin='';pending=null;
    verify.disabled=true;
    steps.textContent='尚未確認跨網頁通訊。';
  }
  form.addEventListener('submit',(e)=>{
    e.preventDefault();
    const url=input.value.trim();
    if(!DEV.test(url)){
      message('請貼上 Apps Script「測試部署作業」取得的 /dev 網址，不能使用 /exec。');
      return;
    }
    if(!window.crypto?.randomUUID){
      message('瀏覽器缺少安全隨機識別碼功能，請改用較新的 Chrome 或 Safari。');
      return;
    }
    reset();
    nonce=crypto.randomUUID();
    const u=new URL(url);
    u.searchParams.set('bridgeNonce',nonce);
    u.searchParams.set('bridgeMode','popup');
    // Open only from user click, preserving window.opener needed by Bridge.
    try {popup=window.open(u.toString(),'repairDriveDevV33');}
    catch(_){popup=null;}
    if(!popup){message('瀏覽器阻擋彈出視窗。請允許測試站開啟新視窗後再按一次。');return;}
    message('已開啟接收器測試視窗。請保持視窗開啟，正在等待 Google Apps Script 回應…');
    steps.textContent='等待接收器發送 ready 訊息，不會建立 MR 工單或上傳附件。';
  });
  window.addEventListener('message',(ev)=>{
    const data=ev.data;
    if(!nonce||!originAllowed(ev.origin)||!data||data.channel!==CHANNEL||data.nonce!==nonce)return;
    if(data.kind==='ready'){
      remote=ev.source;
      remoteOrigin=ev.origin;
      if(!ready){
        ready=true;
        verify.disabled=false;
        steps.textContent='✅ 跨視窗 ready 訊息已收到，接收器基本通訊成功。';
        message('接收器已回應。請按「確認 Drive 唯讀連線」。');
      }
      return;
    }
    if(data.kind==='result'&&pending&&data.id===pending.id&&ev.source===remote){
      const task=pending;pending=null;
      clearTimeout(task.timer);
      task.resolve(data);
    }
  });
  function health(){
    if(!ready||!remote||!remoteOrigin)
      return Promise.reject(new Error('尚未收到接收器 ready 訊息，請先開啟連線測試。'));
    if(pending)return Promise.reject(new Error('已有檢查正在執行'));
    return new Promise((resolve,reject)=>{
      const uuid=crypto.randomUUID();
      const timer=setTimeout(()=>{
        if(pending?.id===uuid)pending=null;
        reject(new Error('45 秒內沒有收到回覆。請查看 Google 接收器視窗與瀏覽器彈出視窗設定。'));
      },45000);
      pending={id:uuid,resolve,reject,timer};
      // Explicit allowlist: ONLY non-mutating health call is sent.
      remote.postMessage({channel:CHANNEL,nonce,kind:'call',id:uuid,action:'health',args:[]},remoteOrigin);
    });
  }
  verify.addEventListener('click',async()=>{
    verify.disabled=true;
    message('正在核對 V3.3 接收器與 Drive 讀取權限…');
    try{
      const result=await health();
      if(!result.ok)throw new Error(String(result.error||'接收器拒絕呼叫'));
      const info=result.result;
      if(!info||info.ok!==true||info.receiverVersion!==EXPECT_VERSION)
        throw new Error('接收器版本不符，預期 V3.3。');
      if(info.testOnly!==false)
        throw new Error('接收器回傳測試旗標異常');
      message('✅ V3.3 接收器唯讀連線成功。Drive 可讀取；尚未測試照片、影片或 NAS。',true);
      steps.textContent='✅ 已收到 healthcheck 回覆。沒有發送員工授權碼、建立 MR、上傳附件或呼叫 LINE。';
    }catch(error){
      message('⚠️ 唯讀連線未通過：'+String(error?.message||error));
    }finally{verify.disabled=!ready;}
  });
  message('先貼上 Apps Script /dev 測試網址，再按「連接」。');
})();