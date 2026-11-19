/* V6 public attachment-only upload for the ORIGINAL repair center.
 * Normal repair page accepts any phone without QR or Google login.
 * No OAuth dialog, no Google iframe embedded for HtmlService; POST via native
 * cross-site form, confirmations via readonly JSONP receipts.
 * The Apps Script project MUST BE ISOLATED from all deletion/management code.
 */
(() => {
  'use strict';
  const qs=new URLSearchParams(location.search);
  const qaMode=qs.get('drive_direct_test')==='1';
  const AUTH_KEY='mrUploadDeviceV5';
  // Consume a one-time, owner-issued pairing link from the URL fragment.
  // The secret never appears in an HTTP query parameter or public source.
  const hash=location.hash||'';
  const invite=/^#mr-invite=([a-f0-9]{32})\.([a-f0-9]{64})$/i.exec(hash);
  const pair=/^#mr-v5=([a-f0-9]{32})\.([a-f0-9]{64})$/i.exec(hash);
  if(pair){
    try{
      localStorage.setItem(AUTH_KEY,JSON.stringify({
        deviceId:pair[1].toLowerCase(),deviceSecret:pair[2].toLowerCase()
      }));
      history.replaceState(null,'',location.pathname+location.search);
    }catch(_){}
  }
  let credentials=null;
  try{
    const raw=localStorage.getItem(AUTH_KEY);
    const parsed=raw?JSON.parse(raw):null;
    if(parsed && /^[a-f0-9]{32}$/.test(parsed.deviceId)
      && /^[a-f0-9]{64}$/.test(parsed.deviceSecret))credentials=parsed;
  }catch(_){}
  // On the official site every mobile browser uses an anonymous, session-bound
  // attachment channel. Old one-time device pairing is preserved in QA mode.
  const publicGuest=!qaMode;
  let guestSecret=null;
  if(publicGuest){
    try{guestSecret=localStorage.getItem('mrGuestUploadV6')}catch(_){}
    if(!/^[a-f0-9]{64}$/.test(guestSecret||'')){
      const bytes=new Uint8Array(32);
      crypto.getRandomValues(bytes);
      guestSecret=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
      try{localStorage.setItem('mrGuestUploadV6',guestSecret)}catch(_){}
    }
  }
  // Only accept the audited company's deployment ID. Do NOT trust an URL
  // parameter from a forwarded link, or files could be sent to another script.
  // The fixed /exec is filled in only after deployment and IT approval.
  const endpoint='https://script.google.com/macros/s/AKfycbz7dLiNn52mm3akXsaxmuFdyiv7owchQ8UBivHWayHccbObZphZFwGJwPkwwBeX03Sz/exec';
  const VALID=/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint);
  if(!VALID) {
    window.repairDirectV4={configured:false,reason:'V4 獨立附件接收器尚未部署；正式報修流程仍維持原狀'};
    // The explicit V4 test link must NEVER accidentally create a real MR or
    // send LINE when its receiver has not been provisioned yet.
    document.addEventListener('click',(event)=>{
      const button=event.target && typeof event.target.closest==='function'
        ? event.target.closest('#submitBtn,#saveRepairBtn,#completeRepairBtn')
        : null;
      if(!button)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      alert('V4 免登入附件接收器尚未完成部署。本測試入口已阻止正式建立／修改工單。請使用一般報修網址處理真正報修。');
    },true);
    return;
  }
  const MB=1048576, CHUNK=2*MB, MAX_PHOTO=(publicGuest?15:100)*MB, MAX_VIDEO=(publicGuest?100:500)*MB;
  const VIDEO=/\.(mp4|mov|m4v|3gp|webm|mkv)$/i, PHOTO=/\.(jpg|jpeg|png|webp|heic|heif)$/i;
  const files={report:null,repair:null},preview={report:null,repair:null};
  const $=id=>document.getElementById(id);
  let uploading=false,preflightPromise=null;

  function uuid() {
    if(!crypto?.randomUUID)throw new Error('瀏覽器缺少安全識別碼功能');
    return crypto.randomUUID();
  }
  function suffix(file,original) {
    if(VIDEO.test(file.name||''))return original.replace('照片','影片');
    if(PHOTO.test(file.name||''))return original;
    throw new Error('附件類型不支援：'+String(file.name||'未命名'));
  }
  function base64Chunk(arrayBuffer) {
    const arr=new Uint8Array(arrayBuffer);
    let out='';
    for(let i=0;i<arr.length;i+=8192)
      out+=String.fromCharCode(...arr.subarray(i,Math.min(i+8192,arr.length)));
    return btoa(out);
  }
  // JSONP is used ONLY for the health and random, non-sensitive request receipt.
  function jsonp(op,params={},timeout=18000) {
    if(!VALID)return Promise.reject(new Error('V4 接收器尚未部署，未設定有效 /exec 網址'));
    return new Promise((resolve,reject)=>{
      const prefix='repairDirect_'+uuid().replace(/-/g,'');
      const tag=document.createElement('script');
      const url=new URL(endpoint);
      url.searchParams.set('op',op);
      url.searchParams.set('prefix',prefix);
      url.searchParams.set('ts',String(Date.now()));
      for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));
      let settled=false;
      const cleanup=()=>{
        clearTimeout(timer);
        try{delete window[prefix]}catch(_){window[prefix]=undefined}
        tag.remove();
      };
      const finish=(error,value)=>{
        if(settled)return;settled=true;cleanup();if(error)reject(error);else resolve(value);
      };
      window[prefix]=value=>finish(null,value);
      tag.onerror=()=>finish(new Error('無法讀取 Google Drive 接收回執，可能是公司網路阻擋或部署權限不符'));
      const timer=setTimeout(()=>finish(new Error('Google Drive 回執逾時（'+op+'）')),timeout);
      tag.async=true;tag.src=url.toString();
      document.head.appendChild(tag);
    });
  }
  async function preflight() {
    if(!VALID)throw new Error('V4 免登入附件接收器尚未設定，不能宣稱附件已備份');
    if(preflightPromise)return preflightPromise;
    preflightPromise=jsonp('health').then(r=>{
      if(!r||r.ok!==true||r.version!=='6.0'||r.testOnly!==false||r.chunkBytes!==CHUNK)
        throw new Error('MR 接收器版本不符或 Google Drive 尚無存取權');
      if(publicGuest){
        if(r.guestAllowed!==true)throw new Error('公開附件上傳目前暫停');
        return command('auth',{},60000).then(authState=>{
          if(!authState?.guest||!authState.productionAllowed||authState.receiverVersion!=='6.0')
            throw new Error('公開附件上傳通道沒有取得成功回執');
          return {...r,...authState};
        });
      }
      if(!credentials)throw new Error('此裝置尚未取得測試授權');
      return command('auth',{},60000).then(authState=>{
        if(!authState||!authState.authorized||authState.receiverVersion!=='5.0')
          throw new Error('無法確認裝置上傳授權');
        if(!qaMode&&!authState.productionAllowed)
          throw new Error('此裝置尚未核准正式工單的附件上傳');
        if(qaMode&&!authState.qaAllowed)
          throw new Error('此裝置沒有隔離測試權限');
        return {...r,...authState};
      });
    }).finally(()=>{preflightPromise=null});
    return preflightPromise;
  }
  async function claimOneTimeInvitation(){
    if(!invite)return null;
    const bytes=new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const secret=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
    const idBytes=new Uint8Array(16);
    crypto.getRandomValues(idBytes);
    const deviceId=Array.from(idBytes,x=>x.toString(16).padStart(2,'0')).join('');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));
    const deviceHash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
    const result=await command('claim',{
      inviteId:invite[1].toLowerCase(),
      inviteCode:invite[2].toLowerCase(),
      newDeviceId:deviceId,
      newDeviceHash:deviceHash
    },65000);
    if(!result?.paired||result.deviceId!==deviceId)
      throw new Error('一次性手機配對沒有取得成功回執');
    credentials={deviceId,deviceSecret:secret};
    localStorage.setItem(AUTH_KEY,JSON.stringify(credentials));
    history.replaceState(null,'',location.pathname+location.search);
    return result;
  }
  function pairingToast(message,success){
    if(!invite)return;
    const el=document.createElement('div');
    el.setAttribute('role','status');
    el.style.cssText='position:fixed;z-index:9999;top:16px;left:16px;right:16px;max-width:520px;margin:auto;'+
      'padding:14px 18px;background:#f8fafc;color:#123b57;border:1px solid #a5c9df;'+
      'border-radius:12px;box-shadow:0 8px 24px #0002;font-size:16px;line-height:1.5';
    el.textContent=(success?'✅ ':'⚠️ ')+message;
    document.body.appendChild(el);
    if(success)setTimeout(()=>el.remove(),8000);
  }
  // A receiver connection is checked in the background. Pairing displays a
  // brief result once; normal repair pages never show test controls.
  const receiverStatus={
    state:'checking',checkedAt:null,version:null
  };
  window.repairDirectV4=receiverStatus;
  void (async()=>{
    if(invite)await claimOneTimeInvitation();
    return await preflight();
  })().then(result=>{
    receiverStatus.state='healthy';
    if(invite)pairingToast('這台裝置已授權，現在可以在原網站上傳報修照片與影片。',true);
    receiverStatus.version=result.version;
    // Only the server can enable real uploads. QA authorization never enables
    // uploads in the formal, unflagged repair website.
    if(qaMode?result.qaAllowed:result.productionAllowed){
      window.repairDrive={enabled:true,preflight,uploadFiles,videoFiles,clearVideo};
      if(!qaMode && window.repairVideoTestBridge?.showAuthorized)
        window.repairVideoTestBridge.showAuthorized();
    }
  }).catch(err=>{
    receiverStatus.state='unavailable';
    if(invite)pairingToast('手機配對未完成：'+String(err?.message||err)+
      '。請重新掃描有效的配對 QR Code。',false);
  }).finally(()=>{
    receiverStatus.checkedAt=Date.now();
  });
  // This diagnostic link must NEVER post a live report or save/complete
  // a real repair order. It is intentionally read-only, even if healthy.
  if(qaMode)document.addEventListener('click',event=>{
    const button=event.target&&typeof event.target.closest==='function'
      ?event.target.closest('#submitBtn,#saveRepairBtn,#completeRepairBtn'):null;
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    alert('目前是 MR 接收器連線測試，不會建立或修改正式工單。真正報修請使用未帶測試參數的正式網址。');
  },true);
  // Every phone can use the same official URL. Preserve submit/cancel flow
  // while the public media-only receiver performs its silent health check.
  if(!qaMode){
    let replayingAuthorizedClick=false;
    document.addEventListener('click',event=>{
      if(replayingAuthorizedClick)return;
      const button=event.target&&typeof event.target.closest==='function'
        ?event.target.closest('#submitBtn,#saveRepairBtn,#completeRepairBtn'):null;
      if(!button)return;
      const target=button.id==='submitBtn'?'report':'repair';
      const photoCount=target==='report'
        ?(typeof reportPhotoFiles!=='undefined'?reportPhotoFiles.length:0)
        :(typeof repairPhotoFiles!=='undefined'?repairPhotoFiles.length:0);
      const hasVideo=!!window.repairVideoTestBridge?.getFile(target);
      if((photoCount===0&&!hasVideo)||window.repairDrive?.enabled)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const previousLabel=button.textContent;
      button.disabled=true;
      button.textContent='確認附件上傳授權中…';
      void preflight().then(result=>{
        if(!result.productionAllowed)throw new Error('公開附件接收器尚未就緒');
        // This is set again here to eliminate a race with the initial
        // preflight's asynchronous UI initialization.
        window.repairDrive={enabled:true,preflight,uploadFiles,videoFiles,clearVideo};
        if(window.repairVideoTestBridge?.showAuthorized)
          window.repairVideoTestBridge.showAuthorized();
        button.disabled=false;
        button.textContent=previousLabel;
        replayingAuthorizedClick=true;
        try{button.click()}finally{replayingAuthorizedClick=false}
      }).catch(err=>{
        button.disabled=false;
        button.textContent=previousLabel;
        alert('附件接收器目前無法連線，尚未送出工單：'+String(err?.message||err)+
          '。請確認網路，或移除附件後只送出文字報修。');
      });
    },true);
  }
  // Native form navigation is CORS-free. iframe.onload is NOT treated as success.
  // Poll a read-only receipt generated by the Apps Script doPost handler instead.
  async function command(action,fields,timeoutMs=115000) {
    if(!VALID)throw new Error('V4 接收器尚未設定 /exec');
    const rid=uuid();
    const sink=document.createElement('iframe');
    sink.name='repairDirectPost_'+rid.replace(/-/g,'');
    sink.setAttribute('aria-hidden','true');
    sink.tabIndex=-1;sink.style.cssText='position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;border:0';
    const form=document.createElement('form');
    form.action=endpoint;form.method='POST';form.target=sink.name;form.enctype='application/x-www-form-urlencoded';
    form.style.display='none';
    const guestActions={auth:'guestAuth',start:'guestStart',chunk:'guestChunk',query:'guestQuery'};
    const actionToSend=publicGuest?(guestActions[action]||action):action;
    const fieldsToSend=Object.assign({rid,action:actionToSend},publicGuest?{guestSecret}:credentials||{},fields||{});
    for(const [key,value] of Object.entries(fieldsToSend)){
      const input=document.createElement('input');
      input.type='hidden';input.name=key;input.value=String(value);
      form.appendChild(input);
    }
    document.body.append(sink,form);
    const started=Date.now();
    try{
      form.submit();
      // Google may block iframe rendering after POST, yet doPost may already
      // have processed the request. Only a positive receipt proves success.
      while(Date.now()-started<timeoutMs){
        await new Promise(resolve=>setTimeout(resolve,950));
        let reply;
        try{reply=await jsonp('receipt',{rid},16000)}
        catch(err){
          if(Date.now()-started>timeoutMs-17000)throw err;
          continue;
        }
        if(reply && reply.pending)continue;
        if(reply && reply.ok===true)return reply.result;
        throw new Error(String(reply?.error||'Google Drive 接收器沒有回傳成功紀錄'));
      }
      throw new Error('附件接收逾時；工單可能已建立，但 Drive 尚未確認。請勿再次送出工單');
    }finally{
      form.remove();
      // Remove sink only after receipt is verified or timed out.
      setTimeout(()=>sink.remove(),2000);
    }
  }
  function storageGet(key) {try{return localStorage.getItem(key)}catch(_){return null}}
  function storageSet(key,value) {try{localStorage.setItem(key,value)}catch(_){}}
  function storageDel(key) {try{localStorage.removeItem(key)}catch(_){}}
  async function uploadOne(file,mr,kind,onPart) {
    if(!file||!file.size)throw new Error('附件空白');
    if(!/^MR20\d{8}$/.test(mr))throw new Error('正式 MR 工單號不合法，不能上傳');
    const max=kind.endsWith('影片')?MAX_VIDEO:MAX_PHOTO;
    if(file.size>max)throw new Error(file.name+' 超過 '+Math.floor(max/MB)+' MB');
    const key='repairDirectV4_'+[mr,kind,file.name,file.size,file.lastModified].join(':');
    let session=null;
    const old=storageGet(key);
    if(old){
      try{session=await command('query',{sessionId:old},65000)}
      catch(err){storageDel(key);}
    }
    if(!session){
      session=await command(qaMode?'qaStart':'start',{meta:JSON.stringify({
        orderNo:mr,mediaKind:kind,name:file.name,size:file.size
      })});
      if(!session||!session.sessionId)throw new Error('Google 未建立上傳工作階段');
      storageSet(key,session.sessionId);
    }
    if(session.complete){
      storageDel(key);
      if(!session.fileId||!session.md5)throw new Error('雲端檔案確認資料不完整');
      return {driveId:session.fileId,category:kind,md5:session.md5};
    }
    let tries=0;
    while(session.offset<file.size){
      const offset=session.offset;
      const bytes=file.slice(offset,Math.min(file.size,offset+CHUNK));
      const base64=base64Chunk(await bytes.arrayBuffer());
      try {
        session=await command('chunk',{sessionId:session.sessionId,offset,base64},145000);
        if(!Number.isSafeInteger(session.offset)||session.offset<=offset)
          throw new Error('Drive 上傳進度未前進，拒絕重複傳送');
        if(onPart)onPart(session.offset,file.size);
        tries=0;
      }catch(err){
        tries++;
        // A lost receipt is not proof of upload failure. Query Drive's confirmed
        // offset before resuming; never replay a possibly accepted chunk blindly.
        try{session=await command('query',{sessionId:session.sessionId},75000)}
        catch(queryErr){
          if(tries>=2)throw new Error('傳輸中斷，尚未確認雲端進度：'+queryErr.message);
          continue;
        }
        if(tries>=2 && !session.complete && session.offset<=offset)
          throw new Error('雲端未確認新進度：'+err.message);
      }
    }
    if(!session.complete)session=await command('query',{sessionId:session.sessionId},75000);
    if(!session.complete||!session.fileId||!session.md5)
      throw new Error('Google Drive 尚未回傳完整檔案 ID／MD5，不可視為已備份');
    storageDel(key);
    return {driveId:session.fileId,category:kind,md5:session.md5};
  }
  async function uploadFiles(selected,orderNo,originalKind,onProgress) {
    if(uploading)throw new Error('附件正在上傳，請勿重複操作');
    uploading=true;
    try{
      const access=await preflight();
      if(!qaMode&&!access.productionAllowed)
        throw new Error('公開附件接收器沒有確認上傳權限');
      const list=[...(selected||[])],results=[];
      for(let i=0;i<list.length;i++){
        const f=list[i],kind=suffix(f,originalKind);
        if(onProgress)onProgress(i+1,list.length);
        const result=await uploadOne(f,orderNo,kind,(done,total)=>{
          const el=$(originalKind==='報修照片'?'submitBtn':'saveRepairMsg');
          if(el)el.textContent='正在上傳 '+f.name+'（'+Math.floor(100*done/total)+'%）';
        });
        results.push(result);
      }
      return results;
    }finally{uploading=false}
  }
  function clearVideo(prefix) {
    if(window.repairVideoTestBridge){window.repairVideoTestBridge.clear(prefix);return;}
    files[prefix]=null;
    if(preview[prefix])URL.revokeObjectURL(preview[prefix]);
    preview[prefix]=null;
    const input=$(prefix+'VideoFile');
    if(input)input.value='';
    const selected=$(prefix+'VideoSelected');
    if(selected)selected.hidden=true;
    const det=$(prefix+'VideoDetails');
    if(det)det.textContent='';
    const box=$(prefix+'VideoPreview');
    if(box)box.replaceChildren();
  }
  function videoFiles(prefix){const bridge=window.repairVideoTestBridge;return bridge&&bridge.getFile(prefix)?[bridge.getFile(prefix)]:(files[prefix]?[files[prefix]]:[])}
  for(const prefix of ['report','repair']){
    if(window.repairVideoTestBridge)continue;
    const pilot=$(prefix+'VideoPilot'),input=$(prefix+'VideoFile');
    if(!pilot||!input)continue;
    pilot.hidden=false;
    pilot.querySelector('.video-picker').firstChild.textContent='🎥 新增影片';
    pilot.querySelector('.video-hint').textContent='影片會上傳到公司 Google Drive，由 F 槽自動歸檔。';
    input.setAttribute('accept','video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm');
    input.addEventListener('change',()=>{
      const file=input.files&&input.files[0];
      clearVideo(prefix);
      if(!file)return;
      if(!VIDEO.test(file.name)||!file.size||file.size>MAX_VIDEO){
        alert('僅接受 MP4／MOV／M4V／WEBM，單支影片不超過 500 MB');
        return;
      }
      files[prefix]=file;
      const url=URL.createObjectURL(file);preview[prefix]=url;
      $(prefix+'VideoDetails').textContent='已選取：'+file.name+'（'+(file.size/MB).toFixed(1)+' MB）';
      const v=document.createElement('video');
      v.controls=true;v.playsInline=true;v.preload='metadata';v.src=url;
      $(prefix+'VideoPreview').replaceChildren(v);
      $(prefix+'VideoSelected').hidden=false;
    });
    $(prefix+'VideoClear').addEventListener('click',()=>clearVideo(prefix));
  }
  ['resetBtn','successHomeBtn','againBtn'].forEach(id=>{
    const el=$(id);if(el)el.addEventListener('click',()=>clearVideo('report'));
  });
  // No visible connectivity panel or company Google password prompt.
  // On the normal website, this runs automatically for any phone; no QR or login.
})();