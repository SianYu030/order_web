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
  const URL_KEY = 'repair_drive_receiver_exec_v1';
  const SUPPORTED_VIDEO = /\.(mp4|mov|m4v|webm)$/i;
  const SUPPORTED_PHOTO = /\.(jpe?g|png|webp|heic|heif)$/i;
  const nonce = crypto.randomUUID();
  const files = {report:null, repair:null};
  const previews = {report:null, repair:null};
  const pending = new Map();
  let endpoint = '';
  let remote = null, remoteOrigin = '';
  let inFlight = false;

  const $ = id => document.getElementById(id);
  const validateUrl = value => {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.hostname !== 'script.google.com' ||
          !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(u.pathname) ||
          u.username || u.password) return '';
      return u.origin + u.pathname.replace(/\/$/, '');
    } catch (_) {return '';}
  };
  const fromQuery = qs.get('drive_endpoint');
  if (fromQuery) {
    endpoint = validateUrl(fromQuery);
    if (endpoint) try {localStorage.setItem(URL_KEY, endpoint);} catch (_) {}
  }
  if (!endpoint) {
    try {endpoint = validateUrl(localStorage.getItem(URL_KEY) || '');} catch (_) {}
  }
  const bootFrame = () => {
    if (!endpoint) return;
    const frame = document.createElement('iframe');
    const url = new URL(endpoint);
    url.searchParams.set('bridgeNonce',nonce);
    frame.src = url.toString();
    frame.title = 'Google Drive 附件上傳接收器';
    frame.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0;z-index:-1;';
    frame.setAttribute('aria-hidden','true');
    document.body.appendChild(frame);
  };
  window.addEventListener('message', evt => {
    const data = evt.data;
    if (!data || data.channel !== CHANNEL || data.nonce !== nonce) return;
    const host = (() => {try {return new URL(evt.origin).hostname;} catch (_) {return '';} })();
    if (host !== 'script.google.com' && !host.endsWith('-script.googleusercontent.com') &&
        host !== 'script.googleusercontent.com') return;
    if (data.kind === 'ready') {
      remote = evt.source;
      remoteOrigin = evt.origin;
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
    if (!endpoint) return Promise.reject(new Error('尚未設定 Google Drive 接收器 /exec；附件未上傳，工單尚未送出'));
    if (remote) return Promise.resolve();
    return new Promise((resolve,reject) => {
      const started=Date.now();
      const check=()=>{
        if(remote){resolve();return;}
        if(Date.now()-started>timeoutMs){reject(new Error('Google 接收器未回應，可能尚未部署、需要登入，或公司瀏覽器阻擋內嵌連線'));return;}
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
    const r=await rpc('health',[],35000);
    if(!r || !r.ok || !r.testOnly || r.testMr !== 'MR2026110999')
      throw new Error('Google 接收器版本或權限與測試設定不符，未上傳任何附件');
    return r;
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
      clearVideo(prefix);
      const f=input.files&&input.files[0];
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
  window.repairDrive={enabled:true,preflight,uploadFiles,videoFiles(prefix){return files[prefix]?[files[prefix]]:[];}};
  bootFrame();
})();