/* iOS native camera: leave the trusted file-input activation to the browser/OS.
 * No getUserMedia, custom camera overlay or MediaRecorder in embedded browsers.
 * Both report and repair still use the existing attachment/preview/upload handler.
 */
(function installNativeCamera(){
"use strict";
const w=window,d=document,hook=w.repairVideoTestBridge;
const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
if(!ios||!hook)return;
const pending=new Map();
const get=id=>d.getElementById(id);
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
for(const kind of ["report","repair"]){
 const label=get(kind+"VideoRecordStart"),input=get(kind+"VideoCapture");
 if(!label||!input)continue;
 // Use the original label and input default action. No synthetic picker click.
 label.title="直接使用手機相機錄影";
 label.setAttribute("aria-label","手機相機錄影");
 input.addEventListener("click",event=>{
  const ctx=context(kind);
  if(!ctx){event.preventDefault();pending.delete(kind);return;}
  pending.set(kind,{context:ctx,previous:hook.getFile(kind)});
 },true);
 input.addEventListener("cancel",()=>pending.delete(kind));
 input.addEventListener("change",event=>{
  const prior=pending.get(kind);pending.delete(kind);
  if(prior&&(context(kind)!==prior.context||hook.getFile(kind)!==prior.previous)){
   event.stopImmediatePropagation();input.value="";return;
  }
  // The existing change listener validates size/type and preserves old files
  // if the new capture is empty, invalid or cancelled.
 },true);
}
w.__repairCameraMode="native-ios-v1";
})();
