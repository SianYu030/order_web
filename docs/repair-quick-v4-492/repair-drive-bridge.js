/* Original repair center Google Drive attachment bridge.
 * Enabled only by ?drive_upload=1. No extra form or separate employee workflow.
 * Browser -> authorized Apps Script HTML bridge -> Drive -> PhotoAgent on G: -> NAS.
 */
(() => {
  'use strict';
  const qs = new URLSearchParams(location.search);
  if (qs.get('drive_upload') !== '1') return;
  const CHANNEL = 'repair-drive-mr-v1';
  const MB = 1048576;
  const CHUNK_BYTES = 2 * MB;
  const MAX_PHOTO = 100 * MB;
  const MAX_VIDEO = 500 * MB;
  // Configured receiver deployment, access is still enforced by Google account permissions.
  const RECEIVER_EXEC = 'https://script.google.com/macros/s/AKfycbxkVCaNQQ_nOq0vbyAQJndc4UHwgPfN2D6RtsRMF1VwZ3B1zvdJ0fRfNKOphoDZdSqhdg/exec';
  const SUPPORTED_VIDEO = /\.(mp4|mov|m4v|webm)$/i;
  const SUPPORTED_PHOTO = /\.(jpe?g|png|webp|heic|heif)$/i;
  // Retain only the random tab handshake across reload, never Google credentials.
  const nonce = (() => {
    const key='repair_drive_tab_handshake_v1';
    try {
      const stored=sessionStorage.getItem(key);
      if(stored && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(stored)) return stored;
      const created=crypto.randomUUID();
      sessionStorage.setItem(key,created);
      return created;
    } catch (_) {return crypto.randomUUID();}
  })();
  const files = {report:null, repair:null};
  const previews = {report:null, repair:null};
  const pending = new Map();
  const endpoint = RECEIVER_EXEC;
  let remote = null, remoteOrigin = '';
  let inFlight = false;
  let verified=false, verifyPromise=null, autoVerifyAttempted=false;

  const $ = id => document.getElementById(id);
  // Apps Script's HTML service can be blocked inside a cross-site hidden iframe.
  // Open the receiver as a first-party tab only after an explicit user tap.
  let popup = null;
  const indicators = [];
  const connectButtons = [];
  const connectionPanels = [];
  // Restricted Apps Script receivers cannot authorize users within many
  // embedded webviews. Detect them before opening a broken Google login tab.
  function isEmbeddedBrowser_(){
    const ua=(navigator.userAgent||'');
    if(/(?:Line\/|FBAN\/|FBAV\/|Instagram\/|MicroMessenger\/|ChatGPT\/|KAKAOTALK\/|GSA\/)/i.test(ua))return true;
    return /iP(?:hone|ad|od)/i.test(ua) && /AppleWebKit/i.test(ua) &&
      !/(?:Safari\/|CriOS\/|FxiOS\/|EdgiOS\/)/i.test(ua);
  }
  function connectionStatus(message, good=false, allowRetry=true) {
    indicators.forEach(node=>{
      node.textContent=message;
      node.style.color=good?'#08713e':'#805024';
    });
    // Once healthcheck succeeds, keep the normal photo/video UI and hide
    // the redundant connect button for this page session.
    const showError=!!allowRetry&&!good;
    // Keep the connector UI out of normal report/repair forms.
    // Only surface actionable error details and a retry button on failure.
    connectionPanels.forEach(panel=>{panel.hidden=!showError;panel.style.display=showError?'':'none';});
    const canRetry=showError&&!isEmbeddedBrowser_();
    connectButtons.forEach(btn=>{btn.hidden=!canRetry;btn.style.display=canRetry?'':'none';});
  }
  function verifyReceiver() {
    if(verified)return Promise.resolve(true);
    if(verifyPromise)return verifyPromise;
    verifyPromise=rpc('health',[],45000).then(result=>{
      if(!result || !result.ok || result.receiverVersion!=='2.3' || result.testOnly!==false)
        throw new Error('Google 接收器版本或權限不符；照片及影片尚未上傳');
      verified=true;
      connectionStatus('✅ Google Drive 已連線。本頁附件可直接送出；NAS 備份尚待核對。',true);
      return true;
    }).catch(err=>{
      verified=false;
      connectionStatus('連線未完成：'+err.message);
      throw err;
    }).finally(()=>{verifyPromise=null;});
    return verifyPromise;
  }
  function connectReceiver() {
    if(isEmbeddedBrowser_()){
      connectionStatus('目前是 App 內建瀏覽器，無法確認 Google 登入。請在 Safari 開啟原網站並登入廠務室帳號；尚未建立 MR 工單。');
      popup=null;
      return;
    }
    // A mobile browser requires a user gesture to open the Google login page.
    // The URL is preconfigured; no manual copy/paste or account change is needed.
    const u=new URL(endpoint);
    u.searchParams.set('bridgeNonce',nonce);
    u.searchParams.set('bridgeMode','popup');
    remote=null; remoteOrigin='';
    verified=false;autoVerifyAttempted=false;verifyPromise=null;
    try {popup=window.open(u.toString(),'repairGoogleDriveReceiver');} catch (_) {popup=null;}
    if(!popup){
      connectionStatus('手機阻擋開啟 Google 登入分頁，請允許彈出視窗後再按「連接」。');
      return;
    }
    connectionStatus('正在連接 Google 接收器，必要時請完成 Google 登入，再返回原網站。',false,false);
    awaitReceiver(60000).then(()=>verifyReceiver())
      .catch(err=>connectionStatus('連線未完成：'+err.message));
  }
  function addConnectionBar(prefix){
    const box=$(prefix+'VideoPilot');
    if(!box)return;
    const wrap=document.createElement('div');
    wrap.className='repair-drive-connect';
    wrap.style.cssText='display:none;margin:8px 0 12px;padding:12px;border:1px solid #bad0e4;border-radius:10px;background:#f7fafc;font-size:13px;';
    wrap.hidden=true;
    connectionPanels.push(wrap);
    const headline=document.createElement('div');
    headline.textContent='☁️ Google Drive 附件備份連線';
    headline.style.cssText='font-weight:800;margin-bottom:6px;color:#264a67';
    wrap.appendChild(headline);
    const descr=document.createElement('div');
    descr.textContent='已設定廠務室 Google 接收器。使用授權帳號連線後，附件將先存入雲端，NAS 另行核對。';
    descr.style.cssText='font-size:12px;color:#54718a;line-height:1.4;margin-bottom:8px';
    wrap.appendChild(descr);
    const btn=document.createElement('button');
    btn.type='button';
    btn.textContent='連接 Google Drive';
    btn.style.cssText='width:100%;min-height:43px;background:#1d567e;color:white;border:0;border-radius:8px;font-size:14px;font-weight:700;';
    btn.addEventListener('click',connectReceiver);
    wrap.appendChild(btn);
    btn.hidden=true;btn.style.display='none';
    connectButtons.push(btn);
    const note=document.createElement('div');
    note.textContent='Google Drive 已設定。只有接收器授權確認成功後才能送出附件；請使用 Safari 及廠務室 Google 帳號。';
    note.style.cssText='margin-top:7px;color:#805024;line-height:1.5;';
    wrap.appendChild(note);indicators.push(note);
    const help=document.createElement('div');
    help.style.cssText='margin-top:7px;color:#5c6773;line-height:1.5;font-size:12px';
    help.textContent='若在 Safari 仍出現「找不到網頁」，須核對 Google 接收器部署的 /exec 網址及存取權。此錯誤不代表 LINE 或 NAS 出問題，請勿重複送出。';
    wrap.appendChild(help);
    box.parentElement.insertBefore(wrap,box);
  }
  window.addEventListener('message', evt => {
    const data = evt.data;
    if (!data || data.channel !== CHANNEL || data.nonce !== nonce) return;
    const host = (() => {try {return new URL(evt.origin).hostname;} catch (_) {return '';} })();
    if (host !== 'script.google.com' && !host.endsWith('-script.googleusercontent.com') &&
        host !== 'script.googleusercontent.com') return;
    if (data.kind === 'ready') {
      const changed=remote!==evt.source || remoteOrigin!==evt.origin;
      remote = evt.source;
      remoteOrigin = evt.origin;
      if(changed) connectionStatus('已找到 Google 接收器，正在確認登入與授權…',false,false);
      // The receiver tab sends a ready heartbeat every 3 seconds.
      // On same-tab reload, safely recheck authorization without another popup.
      if(!autoVerifyAttempted){
        autoVerifyAttempted=true;
        verifyReceiver().catch(()=>{});
      }
      return;
    }
    if (data.kind !== 'result' || !pending.has(data.id)) return;
    const p = pending.get(data.id);
    pending.delete(data.id);
    clearTimeout(p.timeout);
    if (data.ok) p.resolve(data.result);
    else p.reject(new Error(data.error || 'Google Drive 接收器拒絕要求'));
  });
  function awaitReceiver(timeoutMs=15000) {
    if (!endpoint) return Promise.reject(new Error('接收器設定遺失，附件未上傳，工單尚未送出'));
    if (remote) return Promise.resolve();
    return new Promise((resolve,reject) => {
      const started=Date.now();
      const check=()=>{
        if(remote){resolve();return;}
        if(popup && popup.closed){
          reject(new Error('Google 接收器視窗已關閉，授權未確認。原表單仍保留，請核對廠務室帳號及部署網址。'));return;
        }
        if(Date.now()-started>timeoutMs){
          reject(new Error('Google 接收器未回應，可能是部署 /exec 網址失效、帳號不符或瀏覽器限制。尚未建立 MR 工單。'));return;
        }
        setTimeout(check,250);
      };
      check();
    });
  }
  async function rpc(action,args=[],timeoutMs=110000) {
    await awaitReceiver();
    const id=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{
        pending.delete(id);
        reject(new Error('Google 接收器回應逾時（'+action+'）'));
      },timeoutMs);
      pending.set(id,{resolve,reject,timeout});
      try {remote.postMessage({channel:CHANNEL,nonce,kind:'call',id,action,args},remoteOrigin);}
      catch(e){clearTimeout(timeout);pending.delete(id);reject(e);}
    });
  }
  async function preflight() {
    if(!endpoint)throw new Error('Google 接收器未設定，附件尚未上傳');
    if(!remote && isEmbeddedBrowser_()){
      const detail='請用 Safari 開啟設備維修網站，並以授權的廠務室 Google 帳號登入後再送出。此 App 內建瀏覽器無法確認接收器授權；尚未建立 MR 工單、沒有發送 LINE。';
      connectionStatus(detail);
      throw new Error(detail);
    }
    // Called synchronously from the existing submit/save user interaction.
    // Open a Google-authenticated receiver tab only when an attachment is sent.
    if(!remote){
      connectReceiver();
      if(!popup)throw new Error('瀏覽器未允許 Google 登入分頁開啟。請使用「連接 Google Drive」重試');
      await awaitReceiver(60000);
      await verifyReceiver();
      return {ok:true,receiverVersion:'2.3',testOnly:false};
    }
    try{
      const r=await rpc('health',[],45000);
      if(!r || !r.ok || r.receiverVersion!=='2.3' || r.testOnly!==false)
        throw new Error('Google 接收器版本或權限不符。請更新 v2.3 接收器，附件未上傳');
      return r;
    }catch(err){
      verified=false;remote=null;remoteOrigin='';
      connectionStatus('Google Drive 連線已失效，請重新連接：'+err.message);
      throw err;
    }
  }
  function extVideo(file) {return SUPPORTED_VIDEO.test(file.name || '');}
  function extPhoto(file) {return SUPPORTED_PHOTO.test(file.name || '');}
  function mediaKind(file,originalKind) {
    if(extVideo(file)) return originalKind.replace('照片','影片');
    if(extPhoto(file)) return originalKind;
    throw new Error('不支援的附件類型：'+file.name+'（影片請使用 MP4、MOV、M4V、WEBM）');
  }
  function base64Chunk(buf) {
    const bytes=new Uint8Array(buf);
    let s='';
    for(let i=0;i<bytes.length;i+=8192) s+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(s);
  }
  async function uploadOne(file,orderNo,kind,onPart) {
    if(!file || !file.size) throw new Error('附件檔案為空白');
    const max=kind.endsWith('影片')?MAX_VIDEO:MAX_PHOTO;
    if(file.size>max) throw new Error(kind+'單檔上限 '+(max/MB)+' MB：'+file.name);
    if(!/^MR20\d{8}$/.test(orderNo)) throw new Error('MR 工單編號不合法，未上傳');
    // Recovery works only for the exact same file selected again on the same browser.
    const fingerprint=[orderNo,kind,file.name,file.size,file.lastModified].join(':');
    const key='repairDriveChunk_v1_'+fingerprint;
    let session=null;
    try {
      const old=localStorage.getItem(key);
      if(old) session=await rpc('query',[old],45000);
    } catch (_) {session=null;}
    if(!session) {
      session=await rpc('start',[{orderNo,mediaKind:kind,name:file.name,size:file.size}],60000);
      try {localStorage.setItem(key,session.sessionId);}catch(_){}
    }
    if(session.complete) {try{localStorage.removeItem(key);}catch(_){};return {driveId:session.fileId,category:kind,md5:session.md5};}
    let retries=0;
    while(session.offset<file.size) {
      const offset=session.offset;
      const chunk=file.slice(offset,Math.min(file.size,offset+CHUNK_BYTES));
      const data=base64Chunk(await chunk.arrayBuffer());
      try {
        session=await rpc('chunk',[session.sessionId,offset,data],120000);
        if(!session || !Number.isSafeInteger(session.offset) || session.offset<offset) throw new Error('雲端確認進度異常');
        retries=0;
        if(onPart) onPart(session.offset,file.size);
      } catch(err) {
        if(++retries>2) throw new Error(file.name+' 傳輸中斷：'+err.message+'。保留雲端續傳資訊，重選同檔案可繼續。');
        await new Promise(r=>setTimeout(r,1000*retries));
        session=await rpc('query',[session.sessionId],60000);
      }
    }
    if(!session.complete) session=await rpc('query',[session.sessionId],60000);
    if(!session.complete || !session.fileId) throw new Error('Drive 尚未確認檔案完成，請勿視為已備份');
    try {localStorage.removeItem(key);}catch(_){}
    return {driveId:session.fileId,category:kind,md5:session.md5};
  }
  async function uploadFiles(selected,orderNo,originalKind,onProgress) {
    if(inFlight) throw new Error('附件正在上傳，請勿重複送出');
    inFlight=true;
    try {
      await preflight();
      const all=[...(selected||[])];
      const results=[];
      for(let i=0;i<all.length;i++){
        const f=all[i];
        const kind=mediaKind(f,originalKind);
        if(onProgress) onProgress(i+1,all.length);
        results.push(await uploadOne(f,orderNo,kind,(done,total)=>{
          const percent=Math.floor(done*100/total);
          const label='上傳'+kind+' '+(i+1)+'/'+all.length+'（'+percent+'%）';
          const status=$(originalKind==='報修照片'?'submitBtn':'saveRepairMsg');
          if(status)status.textContent=label;
        }));
      }
      return results;
    }finally{inFlight=false;}
  }

  function clearVideo(prefix) {
    files[prefix]=null;
    if(previews[prefix]) URL.revokeObjectURL(previews[prefix]);
    previews[prefix]=null;
    const input=$(prefix+'VideoFile');
    if(input)input.value='';
    $(prefix+'VideoSelected').hidden=true;
    $(prefix+'VideoDetails').textContent='';
    $(prefix+'VideoPreview').replaceChildren();
  }
  for(const prefix of ['report','repair']) {
    const box=$(prefix+'VideoPilot'),input=$(prefix+'VideoFile');
    if(!box||!input)continue;
    box.hidden=false;
    box.querySelector('.video-picker').firstChild.textContent='🎥 新增影片';
    box.querySelector('.video-hint').textContent='影片上傳至公司 Google Drive 後，仍須由 PhotoAgent 核對 NAS 備份。';
    input.setAttribute('accept','video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm');
    input.addEventListener('change',()=>{
      const f=input.files&&input.files[0];
      clearVideo(prefix);
      if(!f)return;
      if(!extVideo(f)||!f.size||f.size>MAX_VIDEO){alert('影片請使用 MP4、MOV、M4V、WEBM，單支不超過 500 MB。');return;}
      files[prefix]=f;
      const url=URL.createObjectURL(f);previews[prefix]=url;
      $(prefix+'VideoDetails').textContent='已選取：'+f.name+'（'+(f.size/MB).toFixed(1)+' MB）';
      const v=document.createElement('video');
      v.controls=true;v.playsInline=true;v.preload='metadata';v.src=url;
      $(prefix+'VideoPreview').replaceChildren(v);
      $(prefix+'VideoSelected').hidden=false;
    });
    $(prefix+'VideoClear').addEventListener('click',()=>clearVideo(prefix));
  }
  ['resetBtn','successHomeBtn','againBtn'].forEach(id=>{
    const b=$(id);if(b)b.addEventListener('click',()=>clearVideo('report'));
  });
  window.repairDrive={enabled:true,preflight,uploadFiles,clearVideo,videoFiles(prefix){return files[prefix]?[files[prefix]]:[];}};
  addConnectionBar('report');
  addConnectionBar('repair');
  // Warn BEFORE the user fills a long report in an unsupported embedded browser.
  // No external redirects or automatic Google logins on page load.
  if(isEmbeddedBrowser_()){
    const main=document.querySelector('.container');
    if(main){
      const warn=document.createElement('div');
      warn.setAttribute('role','alert');
      warn.style.cssText='background:#fff6e4;border:1px solid #edca88;border-radius:10px;color:#735019;padding:12px;margin:8px 0 12px;font-size:13px;line-height:1.6;';
      warn.textContent='⚠️ 目前是 App 內建瀏覽器。Google Drive 附件接收器可能無法完成帳號驗證；請先由選單「在 Safari 開啟」本網站，再用廠務室 Google 帳號登入後操作。此頁不會偷偷建立 MR 或發送 LINE。';
      main.insertBefore(warn,main.firstChild);
    }
  }
})();