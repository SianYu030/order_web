/* Staged integration candidate. Not loaded by production index until end-to-end iPhone acceptance.
   Tickets must be supplied by a trusted issuer. Never embed or persist ticket values.
   This module never submits a work order, sends LINE or modifies the existing uploader. */
(function(root){
"use strict";
const API="https://ppjbjenlzbpatzoabzxr.supabase.co/functions/v1/repair-camera-bridge-pilot";
const NAME="正道報修相機", MAX=20*1024*1024;
const validToken=s=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
const validKind=k=>k==="report"||k==="repair";
function makeShortcutURL(upload){
 if(!validToken(upload))throw Error("上傳授權無效");
 return "shortcuts://run-shortcut?name="+encodeURIComponent(NAME)+"&input=text&text="+encodeURIComponent(JSON.stringify({endpoint:API+"?op=upload",ticket:upload}));
}
function createBridge(options){
 const {getContext,getFile,acceptFile,notify,launch,request,digest,makeFile,now=Date.now}=options;
 let pending=null,busy=false,serial=0;
 function signal(s){notify(s)}
 function validateTicket(t){
  return t&&validToken(t.upload)&&validToken(t.read)&&t.upload!==t.read&&Number.isFinite(t.expiresAt)&&t.expiresAt>now()&&t.expiresAt<=now()+7200000;
 }
 function same(p){
  return pending===p&&getContext(p.kind)===p.context&&getFile(p.kind)===p.previous;
 }
 function begin(kind,ticket){
  if(!validKind(kind)||!validateTicket(ticket))throw Error("未取得有效相機橋接授權");
  if(pending||busy)throw Error("請先完成或取消目前錄影");
  const context=getContext(kind);if(typeof context!=="string"||!context)throw Error("原報修／維修頁面未確認");
  const p={id:++serial,kind,context,previous:getFile(kind),upload:ticket.upload,read:ticket.read,expiresAt:ticket.expiresAt};
  pending=p;signal({state:"waiting",kind});
  try{launch(makeShortcutURL(p.upload));return true}catch(e){pending=null;signal({state:"launch_failed",kind});throw e}
 }
 async function refresh(){
  const p=pending;if(!p||busy)return false;
  if(!same(p)){pending=null;signal({state:"context_changed",kind:p.kind});return false}
  if(now()>=p.expiresAt){pending=null;signal({state:"expired",kind:p.kind});return false}
  busy=true;
  try{
   const status=await request("status",p.read);
   if(!same(p)){if(pending===p)pending=null;signal({state:"context_changed",kind:p.kind});return false}
   if(!status||status.ok!==true)throw Error("回傳狀態未確認");
   if(status.state==="waiting"||status.state==="uploading"){signal({state:status.state,kind:p.kind});return false}
   if(status.state!=="ready"){pending=null;signal({state:"unavailable",kind:p.kind});return false}
   if(!Number.isInteger(status.size)||status.size<16||status.size>MAX||!validToken(status.sha256)||!["video/mp4","video/quicktime"].includes(status.mime))throw Error("影片資料不完整");
   const packet=await request("read",p.read);
   if(!packet||packet.sha256!==status.sha256||packet.mime!==status.mime||!(packet.bytes instanceof ArrayBuffer)||packet.bytes.byteLength!==status.size)throw Error("影片回傳資料不一致");
   if(await digest(packet.bytes)!==status.sha256)throw Error("影片完整性驗證失敗");
   if(!same(p)){if(pending===p)pending=null;signal({state:"context_changed",kind:p.kind});return false}
   const file=makeFile(packet.bytes,status.mime==="video/quicktime"?"camera.mov":"camera.mp4",status.mime);
   const accepted=acceptFile(p.kind,file);
   if(accepted!==true||getFile(p.kind)!==file)throw Error("原報修頁面未確認接收");
   pending=null;
   signal({state:"attached",kind:p.kind,file});
   try{const ack=await request("ack",p.read,status.sha256);if(!ack?.consumed)throw Error("清除未確認");signal({state:"attached_and_cleared",kind:p.kind})}
   catch(_){signal({state:"attached_cleanup_pending",kind:p.kind})}
   return true;
  }catch(e){signal({state:"retryable_error",kind:p.kind,message:String(e?.message||e)});return false}
  finally{busy=false}
 }
 async function cancel(){
  const p=pending;if(!p||busy)return false;
  pending=null;signal({state:"cancelled",kind:p.kind});
  try{await request("discard",p.read)}catch(_){signal({state:"cancel_cleanup_pending",kind:p.kind})}
  return true;
 }
 return Object.freeze({begin,refresh,cancel,isPending:()=>!!pending||busy});
}
function browserRequest(op,ticket,receipt){
 if(!validToken(ticket))return Promise.reject(Error("授權無效"));
 const headers={"X-Camera-Ticket":ticket};if(receipt)headers["X-Camera-Receipt"]=receipt;
 return fetch(API+"?op="+op,{method:["ack","discard"].includes(op)?"POST":"GET",headers,cache:"no-store",credentials:"omit",redirect:"error"}).then(async r=>{
  if(!r.ok)throw Error("橋接服務 HTTP "+r.status);
  if(op!=="read")return r.json();
  return {sha256:r.headers.get("X-Camera-Sha256"),mime:r.headers.get("Content-Type")?.split(";")[0],bytes:await r.arrayBuffer()};
 });
}
async function browserDigest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join("")}
root.RightwayCameraBridgeCandidate=Object.freeze({createBridge,makeShortcutURL,browserRequest,browserDigest,makeFile:(bytes,name,mime)=>new File([bytes],name,{type:mime})});
})(typeof window!=="undefined"?window:globalThis);
