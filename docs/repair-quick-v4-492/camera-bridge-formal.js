/* Isolated iOS web recording candidate. No Shortcut or external bridge. Existing upload hook only. */
(function installHDRecorder(){
"use strict";
const w=window,d=document,hook=w.repairVideoTestBridge;
const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
if(!ios||!hook)return;
const MAX=100*1024*1024, LIMIT=92*1024*1024;
let active=null;
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
function release(s){clearTimeout(s.timer);if(s.stream)s.stream.getTracks().forEach(t=>t.stop());s.preview.srcObject=null}
function close(s,message){
 if(active!==s)return;
 s.cancelled=true;active=null;release(s);
 if(s.recorder&&s.recorder.state!=="inactive"){try{s.recorder.stop()}catch(_){}}
 s.overlay.remove();
 if(message)alert(message);
}
function elem(tag,txt,style){const e=d.createElement(tag);if(txt)e.textContent=txt;Object.assign(e.style,style||{});return e}
function readMetadata(file){
 return new Promise((resolve,reject)=>{
  const v=d.createElement("video"),url=URL.createObjectURL(file);
  let done=false;
  function finish(error,data){if(done)return;done=true;clearTimeout(timer);v.removeAttribute("src");v.load();URL.revokeObjectURL(url);error?reject(error):resolve(data)}
  const timer=setTimeout(()=>finish(Error("無法確認錄影解析度")),10000);
  v.preload="metadata";v.playsInline=true;
  v.onloadedmetadata=()=>finish(null,{width:v.videoWidth,height:v.videoHeight});
  v.onerror=()=>finish(Error("無法讀取錄影檔案"));
  v.src=url;
 });
}
function fullHD(width,height){return Math.min(width,height)>=1080&&Math.max(width,height)>=1920}
function setStatus(s,message){if(active===s)s.status.textContent=message}
function requestStop(s){
 if(active!==s||!s.recorder||s.recorder.state!=="recording")return;
 s.record.disabled=true;setStatus(s,"正在確認影片畫質，請稍候…");clearTimeout(s.timer);
 try{s.recorder.stop()}catch(_){close(s,"停止錄影失敗，原影片保留。")}
}
async function finish(s){
 if(!same(s)){close(s);return}
 try{
  const type=(s.recorder.mimeType||s.mime).split(";")[0];
  if(type!=="video/mp4")throw Error("錄影格式不是 MP4");
  const blob=new Blob(s.chunks,{type});
  if(!blob.size||blob.size>MAX)throw Error("影片空白或超過 100 MB");
  const file=new File([blob],"camera_"+Date.now()+".mp4",{type});
  release(s);
  const dimensions=await readMetadata(file);
  if(!same(s)){close(s);return}
  if(!fullHD(dimensions.width,dimensions.height))throw Error("實際影片未達 1080p，未替換原影片");
  if(!hook.acceptCameraFile(s.kind,file))throw Error("原頁面未接收影片");
  close(s);
 }catch(e){close(s,String(e.message||e)+"。原影片保留。")}
}
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
  r.start(1000);
  s.record.textContent="停止錄影";s.record.onclick=()=>requestStop(s);
  setStatus(s,"錄影中｜目標 1080p / 30 fps");
  s.timer=setTimeout(()=>requestStop(s),90000);
 }catch(e){close(s,"無法啟動高畫質錄影："+String(e.message||e))}
}
async function open(kind){
 if(active)return;
 const ctx=context(kind);if(!ctx){alert("請先確認目前報修或維修頁面。");return}
 if(!w.isSecureContext||!navigator.mediaDevices?.getUserMedia||!w.MediaRecorder){alert("此瀏覽器無法使用網頁高畫質錄影，未啟動低畫質錄影。");return}
 const mime=["video/mp4;codecs=avc1.42001f,mp4a.40.2","video/mp4"].find(t=>MediaRecorder.isTypeSupported(t));
 if(!mime){alert("此瀏覽器未提供 MP4 錄影功能。");return}
 const overlay=elem("div",null,{position:"fixed",inset:"0",zIndex:"2147483646",background:"#111",color:"#fff",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",padding:"12px",gap:"12px"});
 overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label","相機錄影");
 const preview=elem("video",null,{width:"100%",maxHeight:"70vh",objectFit:"contain",background:"#000"});preview.muted=true;preview.autoplay=true;preview.playsInline=true;
 const status=elem("div","正在開啟後置相機…",{textAlign:"center",fontSize:"16px"});
 status.setAttribute("role","status");
 const controls=elem("div",null,{display:"flex",gap:"12px"});
 const record=elem("button","開始錄影",{padding:"12px 20px",background:"#b92323",color:"white",border:"0",borderRadius:"8px",fontSize:"16px"});record.type="button";record.disabled=true;
 const cancel=elem("button","取消",{padding:"12px 20px",background:"#444",color:"white",border:"0",borderRadius:"8px",fontSize:"16px"});cancel.type="button";
 controls.append(record,cancel);overlay.append(preview,status,controls);d.body.append(overlay);
 const s={kind,context:ctx,previous:hook.getFile(kind),overlay,preview,status,record,mime,cancelled:false,stream:null,recorder:null,timer:null};
 active=s;record.onclick=()=>start(s);cancel.onclick=()=>close(s);
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:30}}});
  if(!same(s)){stream.getTracks().forEach(t=>t.stop());close(s);return}
  s.stream=stream;
  const track=stream.getVideoTracks()[0];if(!track)throw Error("找不到相機影像");
  const settings=track.getSettings();
  if(settings.facingMode==="user")throw Error("無法取得後置相機");
  if(settings.width&&settings.height&&!fullHD(settings.width,settings.height))throw Error("相機未提供 1080p");
  stream.getTracks().forEach(t=>t.addEventListener("ended",()=>{if(active===s&&s.recorder?.state==="recording")close(s,"相機或麥克風已中斷，原影片保留。")}));
  preview.srcObject=stream;await preview.play();
  if(!same(s)){close(s);return}
  if(!fullHD(preview.videoWidth,preview.videoHeight))throw Error("實際相機畫面未達 1080p");
  setStatus(s,"高畫質相機就緒｜"+preview.videoWidth+" × "+preview.videoHeight);
  record.disabled=false;
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
