/* iOS fullscreen HD web camera. Existing report/repair attachment hook only. */
(function installHDRecorder(){
"use strict";
const w=window,d=document,hook=w.repairVideoTestBridge;
const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
if(!ios||!hook)return;
const MAX=100*1024*1024, LIMIT=92*1024*1024;
let active=null;
const stamp=()=>w.performance?.now?.()??Date.now();
function timing(s,key){s.timings[key]=Math.round(stamp()-s.openedAt);w.__repairCameraTiming={...s.timings};}
function get(id){return d.getElementById(id)}
function context(kind){
 const mode=get(kind==="report"?"reportMode":"repairMode");
 if(!mode||mode.classList.contains("hidden"))return "";
 if(kind==="repair"){
  const order=repairState.order,detail=get("repairDetailCard");
  if(!detail||detail.classList.contains("hidden")||!order||!order.no)return "";
  return JSON.stringify([cameraContextRevision_,order.no,order.photoEpoch,currentRepairUser]);
 }
 return JSON.stringify([cameraContextRevision_,state.dept,state.person,state.machine,state.requestId]);
}
function same(s){return active===s&&context(s.kind)===s.context&&hook.getFile(s.kind)===s.previous}
function release(s){clearTimeout(s.timer);clearInterval(s.clockTimer);if(s.stream){s.stream.getTracks().forEach(t=>t.stop());s.stream=null} s.preview.srcObject=null}
function close(s,message){
 if(active!==s)return;
 s.cancelled=true;active=null;release(s);
 if(s.recorder&&s.recorder.state!=="inactive"){try{s.recorder.stop()}catch(_){}}
 s.overlay.remove();
 d.documentElement.style.overflow=s.oldHtmlOverflow;d.body.style.overflow=s.oldBodyOverflow;
 if(message)alert(message);
}
function elem(tag,txt,style){const e=d.createElement(tag);if(txt)e.textContent=txt;Object.assign(e.style,style||{});return e}
function readMetadata(file,poster){
 return new Promise((resolve,reject)=>{
  const v=d.createElement("video"),url=URL.createObjectURL(file);
  let done=false,disposed=false;
  function dispose(){if(disposed)return;disposed=true;v.removeAttribute("src");v.load();URL.revokeObjectURL(url)}
  function finish(error){if(done)return;done=true;clearTimeout(timer);v.onloadedmetadata=null;v.onerror=null;if(error){dispose();reject(error)}else resolve({file,video:v,url,width:v.videoWidth,height:v.videoHeight,duration:v.duration,dispose})}
  const timer=setTimeout(()=>finish(Error("無法確認錄影解析度")),10000);
  v.preload="metadata";v.playsInline=true;v.controls=true;
  if(typeof poster==="string"&&poster.startsWith("data:image/jpeg;base64,")&&poster.length<300000)v.poster=poster;
  v.onloadedmetadata=()=>finish();
  v.onerror=()=>finish(Error("無法讀取錄影檔案"));
  v.src=url;
 });
}
function fullHD(width,height){return Math.min(width,height)>=1080&&Math.max(width,height)>=1920}
function setStatus(s,message){if(active===s)s.status.textContent=message}
function requestStop(s){
 if(active!==s||!s.recorder||s.recorder.state!=="recording")return;
 timing(s,"stopRequestedMs");s.record.disabled=true;clearInterval(s.clockTimer);setStatus(s,"正在確認影片畫質…");clearTimeout(s.timer);
 try{s.recorder.stop()}catch(_){close(s,"停止錄影失敗，原影片保留。")}
}
async function finish(s){
 if(!same(s)){close(s);return}
 let verified=null,handedOff=false;
 try{
  timing(s,"recorderStoppedMs");
  const type=(s.recorder.mimeType||s.mime).split(";")[0];
  if(type!=="video/mp4")throw Error("錄影格式不是 MP4");
  if(!s.bytes||s.bytes>MAX)throw Error("影片空白或超過 100 MB");
  const file=new File(s.chunks,"camera_"+Date.now()+".mp4",{type});
  if(!file.size||file.size>MAX)throw Error("影片空白或超過 100 MB");
  s.chunks=[];
  release(s);
  verified=await readMetadata(file,s.poster);
  timing(s,"metadataReadyMs");
  if(!same(s)){close(s);return}
  if(!fullHD(verified.width,verified.height))throw Error("實際影片未達 1080p，未替換原影片");
  if(!hook.acceptCameraFile(s.kind,file,s.poster,verified))throw Error("原頁面未接收影片");
  handedOff=true;timing(s,"attachedMs");close(s);
 }catch(e){close(s,String(e.message||e)+"。原影片保留。")}
 finally{if(verified&&!handedOff)verified.dispose()}
}
function capturePoster(s){try{const v=s.preview,w=v.videoWidth,h=v.videoHeight;if(!w||!h)return '';const c=d.createElement('canvas'),scale=Math.min(1,480/Math.max(w,h));c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));const ctx=c.getContext('2d');if(!ctx)return '';ctx.drawImage(v,0,0,c.width,c.height);return c.toDataURL('image/jpeg',0.82)}catch(_){return ''}}
function start(s){
 if(!same(s)){close(s);return}
 if(!s.stream||s.recorder)return;
 try{
  const options={mimeType:s.mime,videoBitsPerSecond:8000000,audioBitsPerSecond:128000};
  const r=new MediaRecorder(s.stream,options);
  s.recorder=r;s.chunks=[];s.bytes=0;
  r.ondataavailable=e=>{if(active!==s||s.cancelled||!e.data?.size)return;s.chunks.push(e.data);s.bytes+=e.data.size;if(s.bytes>=LIMIT)requestStop(s)};
  r.onerror=()=>close(s,"錄影發生錯誤，原影片保留。");
  r.onstop=()=>{if(active===s&&!s.cancelled)void finish(s)};
  r.start(1000);timing(s,"recordStartedMs");
  s.poster=capturePoster(s);
  s.record.setAttribute('aria-label','停止錄影');s.record.title='停止錄影';s.recordMark.style.borderRadius='6px';s.recordMark.style.transform='scale(.62)';s.record.onclick=()=>requestStop(s);
  const started=Date.now();const tick=()=>{const sec=Math.floor((Date.now()-started)/1000);s.clock.textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')};tick();s.clock.style.background='#c5222b';s.clockTimer=setInterval(tick,1000);
  setStatus(s,"錄影中｜1080p");
  s.timer=setTimeout(()=>requestStop(s),90000);
 }catch(e){close(s,"無法啟動高畫質錄影："+String(e.message||e))}
}
async function open(kind){
 if(active)return;
 const openedAt=stamp();const ctx=context(kind);if(!ctx){alert("請先確認目前報修或維修頁面。");return}
 if(!w.isSecureContext||!navigator.mediaDevices?.getUserMedia||!w.MediaRecorder){alert("此瀏覽器無法使用網頁高畫質錄影，未啟動低畫質錄影。");return}
 const mime=["video/mp4;codecs=avc1.640028,mp4a.40.2","video/mp4;codecs=avc1.4d0028,mp4a.40.2","video/mp4;codecs=avc1.420028,mp4a.40.2","video/mp4"].find(t=>MediaRecorder.isTypeSupported(t));
 if(!mime){alert("此瀏覽器未提供 MP4 錄影功能。");return}
 const overlay=elem("div",null,{position:"fixed",inset:"0",zIndex:"2147483646",background:"#000",color:"#fff",overflow:"hidden",overscrollBehavior:"contain",touchAction:"manipulation",isolation:"isolate"});
 overlay.style.height="100vh";if(w.CSS?.supports("height","100dvh"))overlay.style.height="100dvh";
 overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label","全螢幕相機錄影");
 const preview=elem("video",null,{position:"absolute",inset:"0",display:"block",width:"100%",height:"100%",maxWidth:"none",maxHeight:"none",objectFit:"cover",objectPosition:"center",background:"#000",borderRadius:"0",margin:"0",pointerEvents:"none"});preview.muted=true;preview.autoplay=true;preview.playsInline=true;preview.setAttribute("playsinline","");
 const top=elem("div",null,{position:"absolute",top:"0",left:"0",right:"0",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"8px",padding:"12px 16px 24px",background:"linear-gradient(to bottom,rgba(0,0,0,.65),transparent)",zIndex:"1",pointerEvents:"none"});
 top.style.paddingTop="calc(env(safe-area-inset-top, 0px) + 12px)";top.style.paddingLeft="calc(env(safe-area-inset-left, 0px) + 16px)";top.style.paddingRight="calc(env(safe-area-inset-right, 0px) + 16px)";
 const status=elem("div","正在開啟後置相機…",{fontSize:"13px",fontWeight:"600",textShadow:"0 1px 4px #000",flex:"1",color:"#fff"});status.setAttribute("role","status");
 const clock=elem("div","00:00",{background:"rgba(0,0,0,.55)",borderRadius:"6px",padding:"5px 10px",fontVariantNumeric:"tabular-nums",fontSize:"16px",fontWeight:"600",color:"#fff"});top.append(status,clock);
 const controls=elem("div",null,{position:"absolute",bottom:"0",left:"0",right:"0",display:"grid",gridTemplateColumns:"1fr 84px 1fr",alignItems:"center",gap:"8px",padding:"22px 16px 16px",background:"linear-gradient(to top,rgba(0,0,0,.8),transparent)",zIndex:"2"});
 controls.style.paddingBottom="calc(env(safe-area-inset-bottom, 0px) + 16px)";controls.style.paddingLeft="calc(env(safe-area-inset-left, 0px) + 16px)";controls.style.paddingRight="calc(env(safe-area-inset-right, 0px) + 16px)";
 const cancel=elem("button","取消",{justifySelf:"start",padding:"12px 8px",background:"transparent",color:"#fff",border:"0",fontSize:"16px",minWidth:"48px",minHeight:"48px",margin:"0",textShadow:"0 1px 4px #000"});cancel.type="button";
 const record=elem("button",null,{boxSizing:"border-box",display:"grid",placeItems:"center",justifySelf:"center",width:"76px",height:"76px",minWidth:"76px",minHeight:"76px",padding:"5px",background:"transparent",color:"#fff",border:"4px solid #fff",borderRadius:"50%",margin:"0",boxShadow:"0 2px 10px rgba(0,0,0,.4)",opacity:".45",touchAction:"manipulation"});record.type="button";record.disabled=true;record.title="開始錄影";record.setAttribute("aria-label","開始錄影");
 const recordMark=elem("span",null,{display:"block",width:"100%",height:"100%",background:"#ff343b",borderRadius:"50%",transition:"transform .15s,border-radius .15s",pointerEvents:"none"});record.append(recordMark);
 const quality=elem("div","HD · 30",{justifySelf:"end",color:"#fff",fontWeight:"650",fontSize:"13px",textShadow:"0 1px 4px #000"});
 controls.append(cancel,record,quality);overlay.append(preview,top,controls);
 const oldHtmlOverflow=d.documentElement.style.overflow,oldBodyOverflow=d.body.style.overflow;
 d.documentElement.style.overflow="hidden";d.body.style.overflow="hidden";d.body.append(overlay);
 const s={kind,context:ctx,previous:hook.getFile(kind),overlay,preview,status,clock,record,recordMark,mime,cancelled:false,stream:null,recorder:null,timer:null,clockTimer:null,oldHtmlOverflow,oldBodyOverflow,openedAt,timings:{}};
 active=s;record.onclick=()=>start(s);cancel.onclick=()=>close(s);
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:30}}});
  if(!same(s)){stream.getTracks().forEach(t=>t.stop());close(s);return}
  s.stream=stream;timing(s,"streamReadyMs");
  const track=stream.getVideoTracks()[0];if(!track)throw Error("找不到相機影像");
  const settings=track.getSettings();
  if(settings.facingMode==="user")throw Error("無法取得後置相機");
  if(settings.width&&settings.height&&!fullHD(settings.width,settings.height))throw Error("相機未提供 1080p");
  stream.getTracks().forEach(t=>t.addEventListener("ended",()=>{if(active===s&&s.recorder?.state==="recording")close(s,"相機或麥克風已中斷，原影片保留。")}));
  preview.srcObject=stream;await preview.play();
  if(!same(s)){close(s);return}
  if(!fullHD(preview.videoWidth,preview.videoHeight))throw Error("實際相機畫面未達 1080p");
  setStatus(s,"高畫質相機就緒｜"+preview.videoWidth+" × "+preview.videoHeight);
  record.disabled=false;record.style.opacity='1';timing(s,"previewReadyMs");
 }catch(e){close(s,"無法開啟 1080p 錄影："+String(e.message||e)+"。原影片保留。")}
}
for(const kind of ["report","repair"]){
 const label=get(kind+"VideoRecordStart");if(!label)continue;
 label.addEventListener("click",event=>{event.preventDefault();event.stopImmediatePropagation();void open(kind)},true);
}
d.addEventListener("visibilitychange",()=>{if(d.hidden&&active)close(active)});
w.addEventListener("pagehide",()=>{if(active)close(active)});
d.addEventListener("click",event=>{if(active&&event.target?.closest?.("#submitBtn,#saveRepairBtn,#completeRepairBtn")){event.preventDefault();event.stopImmediatePropagation()}},true);
})();
