/* Existing button integration: remains native capture until a trusted,
   device-authorized ticket issuer is available. No manual ticket entry. */
(function(){
"use strict";
const lib=window.RightwayCameraBridgeCandidate,video=window.repairVideoTestBridge;
if(!lib||!video)return;
const get=id=>document.getElementById(id);
function context(kind){
 const mode=get(kind==="report"?"reportMode":"repairMode");
 if(!mode||mode.classList.contains("hidden"))return "";
 if(kind==="repair"){
  const order=repairState.order,detail=get("repairDetailCard");
  if(!detail||detail.classList.contains("hidden")||!order||!order.no||!order.photoEpoch)return "";
  return JSON.stringify([cameraContextRevision_,order.no,order.photoEpoch,currentRepairUser]);
 }
 return JSON.stringify([cameraContextRevision_,state.dept,state.person,state.machine,state.requestId]);
}
function notify(event){
 const hint=get(event.kind+"VideoPilot")?.querySelector(".video-hint");
 if(!hint)return;
 const labels={waiting:"已請求開啟原生高畫質錄影，完成後返回本頁。",uploading:"影片正在回傳，請勿離開或送出。",attached:"影片已帶回原本頁面。",attached_and_cleared:"影片已接收，可正常送出。",attached_cleanup_pending:"影片已接收，暫存清除尚未確認。",retryable_error:"影片回傳尚未確認，請保留此頁再檢查。",context_changed:"原頁面已變更，未將影片附到其他工單。",expired:"錄影授權已到期，未附加影片。",unavailable:"影片回傳失敗，請重新錄影。",cancelled:"本次錄影已取消，原影片保留。",cancel_cleanup_pending:"本次錄影取消，暫存清除尚未確認。",launch_failed:"無法啟動捷徑。"};
 if(labels[event.state])hint.textContent=labels[event.state];
}
const bridge=lib.createBridge({getContext:context,getFile:kind=>video.getFile(kind),acceptFile:(kind,file)=>video.acceptCameraFile(kind,file),notify,launch:url=>{location.href=url},request:lib.browserRequest,digest:lib.browserDigest,makeFile:lib.makeFile});
for(const kind of ["report","repair"]){
 const label=get(kind+"VideoRecordStart");if(!label)continue;
 label.addEventListener("click",event=>{
  if(event.target?.id===kind+"VideoCapture")return;
  // The issuer must be supplied by an approved server/device enrollment.
  // The existing application does not yet supply one. No guest/public issuance.
  const issuer=window.RightwayCameraTrustedIssuer;
  if(!issuer||issuer.enrolled!==true||typeof issuer.takePreparedTicket!=="function")return;
  if(bridge.isPending()){event.preventDefault();if(confirm("取消目前等待回傳的錄影？"))void bridge.cancel();return;}
  let ticket;try{ticket=issuer.takePreparedTicket(kind)}catch(_){return;}
  if(!ticket||!context(kind))return;
  try{bridge.begin(kind,ticket);event.preventDefault()}catch(_){/* Native file capture remains available. */}
 });
}
document.addEventListener("click",event=>{
 const target=event.target?.closest?.("#submitBtn,#saveRepairBtn,#completeRepairBtn");
 if(!target||!bridge.isPending())return;
 event.preventDefault();event.stopImmediatePropagation();alert("影片仍在回傳，請完成或取消錄影後再送出。");
},true);
function resume(){if(!document.hidden&&bridge.isPending())void bridge.refresh()}
window.addEventListener("focus",resume);window.addEventListener("pageshow",resume);document.addEventListener("visibilitychange",resume);
setInterval(resume,3000);
})();