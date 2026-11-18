
import { createClient } from "npm:@supabase/supabase-js@2";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
 {auth:{persistSession:false,autoRefreshToken:false}});
const ORIGIN="https://sianyu030.github.io";
const SOURCE="業務假日或臨時加班登記";
const MAX=20;
const VALID_PENDING=["待同步","同步失敗","同步中"];
function res(x:any,status=200){
 return new Response(JSON.stringify(x),{status,headers:{
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "Access-Control-Allow-Origin":ORIGIN,
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type, Authorization, X-Bridge-Token"}});
}
async function sha256(x:string){
 const h=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(x)));
 return Array.from(h,b=>b.toString(16).padStart(2,"0")).join("");
}
async function authorize(req:Request){
 const raw=req.headers.get("X-Bridge-Token")||"";
 if(!/^[A-Za-z0-9_-]{40,100}$/.test(raw))return false;
 const {data,error}=await db.from("overtime_sheet_bridge_keys")
  .select("id,token_hash,webhook_url").eq("token_hash",await sha256(raw)).eq("enabled",true).maybeSingle();
 if(error)throw error;
 if(!data)return false;
 // Last-seen is diagnostic only: never allow this write to interrupt the request.
 const {error:heartbeatError}=await db.from("overtime_sheet_bridge_keys").update({last_seen_at:new Date().toISOString()}).eq("id",data.id);
 if(heartbeatError)console.error("bridge heartbeat",heartbeatError.code);
 return data;
}
function clean(x:any){
 return {id:x.id,request_no:x.request_no,date:x.work_date,department:x.department,
  employee_id:x.employee_id,employee_name:x.employee_name,hours:Number(x.hours),
  reason:x.reason,status:x.status,updated_at:x.updated_at,
  source_sheet:x.source_sheet||null,source_range:x.source_range||null,
  manager_name:x.manager_name||null,manager_time:x.manager_time||null};
}
function uuid(x:any){return typeof x==="string"&&/^[0-9a-f-]{36}$/i.test(x);}
function rowRange(x:any){
 return Number.isInteger(x)&&x>=2&&x<=1500?"A"+x+":R"+x:"";
}
async function audit(x:any,actor:string,action:string,details:any={}){
 const {error}=await db.from("overtime_web_audit").insert({
  request_id:x.id,actor,action,details});
 if(error)console.error("audit",error.code);
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:res({}).headers});
 if(req.method!=="POST")return res({ok:false,error:"POST only"},405);
 // Direct Apps Script server calls do not send Origin.
 if(req.headers.get("Origin")&&req.headers.get("Origin")!==ORIGIN)
  return res({ok:false,error:"Origin rejected"},403);
 try{
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object")return res({ok:false,error:"Invalid JSON"},400);
  if(["pair","status"].includes(String(body.action||""))){
   const bearer=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
   if(!/^[A-Za-z0-9_-]{40,60}$/.test(bearer))return res({ok:false,error:"Admin login required"},401);
   const digest=await sha256(bearer);
   const {data:session,error:se}=await db.from("overtime_sessions")
    .select("account_id,expires_at").eq("token_hash",digest).maybeSingle();
   if(se)throw se;
   if(!session||Date.parse(session.expires_at)<Date.now())
    return res({ok:false,error:"Admin login expired"},401);
   const {data:account,error:ae}=await db.from("overtime_accounts")
    .select("id,username,role,enabled,must_change").eq("id",session.account_id).maybeSingle();
   if(ae)throw ae;
   if(!account?.enabled||account.must_change||account.role!=="admin")
    return res({ok:false,error:"Admin permission required"},403);
   if(String(body.action||"")==="status"){
    const {data:keys,error:ke}=await db.from("overtime_sheet_bridge_keys")
     .select("id,created_at,last_seen_at,enabled,webhook_url,last_notify_at,last_notify_result").eq("enabled",true)
     .order("created_at",{ascending:false}).limit(10);
    if(ke)throw ke;
    const latest=(keys||[]).reduce((a,x)=>!a||Date.parse(x.last_seen_at||"")>Date.parse(a)?x.last_seen_at:a,null);
    const online=latest!=null&&Number.isFinite(Date.parse(latest))&&
     Date.now()-Date.parse(latest)<15*60*1000;
    return res({ok:true,paired:(keys||[]).length>0,connected:Boolean(online),
     active_keys:(keys||[]).length,last_seen_at:latest||null,
     instant_configured:(keys||[]).some(k=>Boolean(k.webhook_url)),
     instant_last_notify_at:(keys||[]).map(k=>k.last_notify_at).filter(Boolean).sort().reverse()[0]||null,
     instant_last_result:(keys||[]).filter(k=>k.last_notify_at).sort((a,b)=>String(b.last_notify_at).localeCompare(String(a.last_notify_at)))[0]?.last_notify_result||null});
   }

   const {count,error:ke}=await db.from("overtime_sheet_bridge_keys")
    .select("id",{count:"exact",head:true}).eq("enabled",true);
   if(ke)throw ke;
   if(Number(count)>=2)return res({ok:false,error:"同步授權已達2組上限，避免產生無法追蹤的多組憑證；請管理員先核對已安裝設備。"},409);
   const secret=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
   const {data:key,error:kerr}=await db.from("overtime_sheet_bridge_keys")
    .insert({token_hash:await sha256(secret),created_by:account.username}).select("id").single();
   if(kerr)throw kerr;
   await db.from("overtime_auth_log").insert({actor_id:account.id,
    action:"overtime_bridge_paired",subject:String(key.id)});
   return res({ok:true,token:secret,message:"同步授權碼僅顯示本次，請貼入公司 Google 試算表的 Apps Script 安裝畫面；不要放進 GitHub 或群組。"});
  }
  const key=await authorize(req);
  if(!key)return res({ok:false,error:"Invalid bridge token"},401);
  const action=String(body.action||"");
  if(action==="register_webhook"){
   const url=String(body.url||"").trim();
   if(!/^https:\/\/script[.]google[.]com\/macros\/s\/[A-Za-z0-9_-]{30,256}\/exec$/.test(url))
    return res({ok:false,error:"Only a deployed Google Apps Script /exec URL is accepted"},400);
   const {data,error}=await db.from("overtime_sheet_bridge_keys")
    .update({webhook_url:url,last_notify_at:null,last_notify_result:null})
    .eq("id",key.id).eq("enabled",true).select("id,webhook_url").maybeSingle();
   if(error)throw error;
   if(!data)return res({ok:false,error:"The bridge key is no longer enabled"},409);
   return res({ok:true,registered:true,message:"Instant webhook registered; Google will be called after new submissions and supervisor approvals"});
  }
  if(action==="unregister_webhook"){
   const {error}=await db.from("overtime_sheet_bridge_keys")
    .update({webhook_url:null,last_notify_result:null}).eq("id",key.id).eq("enabled",true);
   if(error)throw error;
   return res({ok:true,registered:false});
  }
  if(action==="pull"){
   const {data:pending,error:a}=await db.from("overtime_web_requests").select("*")
    .in("status",["待同步","同步失敗","同步中","核准待同步","駁回待同步"])
    .order("created_at",{ascending:true}).limit(MAX);
   if(a)throw a;
   const records=(pending||[]).slice(0,MAX).map(clean);
   return res({ok:true,records,count:records.length});
  }
  if(action==="claim"){
   const id=String(body.id||""),status=String(body.status||""),
    stamp=String(body.updated_at||"");
   if(!uuid(id)||!VALID_PENDING.includes(status)||!stamp)
    return res({ok:false,error:"Invalid claim"},400);
   const {data:current,error:ce}=await db.from("overtime_web_requests")
    .select("*").eq("id",id).maybeSingle();
   if(ce)throw ce;
   if(!current||current.status!==status||current.updated_at!==stamp)
    return res({ok:false,error:"State changed; refresh"},409);
   if(status==="同步中"&&Date.now()-Date.parse(stamp)<10*60*1000)
    return res({ok:false,error:"Currently processing"},409);
   const {data:claimed,error}=await db.from("overtime_web_requests")
    .update({status:"同步中",updated_at:new Date().toISOString()})
    .eq("id",id).eq("status",status).eq("updated_at",stamp)
    .select("*").maybeSingle();
   if(error)throw error;
   if(!claimed)return res({ok:false,error:"Claim lost"},409);
   await audit(claimed,"google-bridge","claimed",{previous_status:status});
   return res({ok:true,record:clean(claimed)});
  }
  if(action==="ack"){
   const id=String(body.id||""),stage=String(body.stage||""),
    source_row=Number(body.source_row),suppliedRange=rowRange(source_row),
    source=String(body.source_sheet||"");
   if(!uuid(id)||!["registered","approved","rejected"].includes(stage))
    return res({ok:false,error:"Invalid acknowledgement"},400);
   const {data:current,error:ce}=await db.from("overtime_web_requests")
    .select("*").eq("id",id).maybeSingle();
   if(ce)throw ce;
   if(!current)return res({ok:false,error:"Missing request"},404);
   if(stage==="rejected"){
    if(!["駁回待同步","已駁回"].includes(current.status))
     return res({ok:false,error:"Not rejected"},409);
    if(!suppliedRange||current.source_range!==suppliedRange||source!==SOURCE)
     return res({ok:false,error:"Source does not match"},409);
    if(current.status==="已駁回")return res({ok:true,status:"已駁回",already:true});
    const {data:updated,error}=await db.from("overtime_web_requests")
     .update({status:"已駁回",last_error:null,updated_at:new Date().toISOString()})
     .eq("id",id).eq("status","駁回待同步").eq("source_range",suppliedRange)
     .select("*").maybeSingle();
    if(error)throw error;
    if(!updated)return res({ok:false,error:"Rejection sync race"},409);
    await audit(updated,"google-bridge","rejected_and_verified",
     {source_range:suppliedRange,manager_name:current.manager_name});
    return res({ok:true,status:"已駁回"});
   }
   if(source!==SOURCE||!suppliedRange)return res({ok:false,error:"Source invalid"},400);
   if(stage==="registered"){
    if(current.status==="待核准"&&current.source_sheet===source&&current.source_range===suppliedRange)
     return res({ok:true,status:"待核准",already:true});
    if(current.status!=="同步中")return res({ok:false,error:"Not claimed"},409);
    const {data:updated,error}=await db.from("overtime_web_requests")
     .update({status:"待核准",source_sheet:source,source_range:suppliedRange,
      last_error:null,updated_at:new Date().toISOString()})
     .eq("id",id).eq("status","同步中").select("*").maybeSingle();
    if(error)throw error;
    if(!updated)return res({ok:false,error:"Source registration race"},409);
    await audit(updated,"google-bridge","registered",{source_range:suppliedRange});
    return res({ok:true,status:updated.status});
   }
   if(current.status==="已核准"&&current.source_sheet===source&&current.source_range===suppliedRange)
    return res({ok:true,status:"已核准",already:true});
   if(current.status!=="核准待同步"||!current.manager_name||
      current.source_sheet!==source||current.source_range!==suppliedRange)
     return res({ok:false,error:"Approval state inconsistent"},409);
   const {data:updated,error}=await db.from("overtime_web_requests")
    .update({status:"已核准",last_error:null,updated_at:new Date().toISOString()})
    .eq("id",id).eq("status","核准待同步").select("*").maybeSingle();
   if(error)throw error;
   if(!updated)return res({ok:false,error:"Approval acknowledgement race"},409);
   await audit(updated,"google-bridge","approved_and_verified",{source_range:suppliedRange,
    manager_name:current.manager_name});
   return res({ok:true,status:updated.status});
  }
  if(action==="problem"){
   const id=String(body.id||""),safe=body.safe===true,
    description=String(body.error||"Unknown sync conflict").slice(0,400);
   if(!uuid(id))return res({ok:false,error:"Invalid id"},400);
   const {data:record,error:e}=await db.from("overtime_web_requests")
    .select("*").eq("id",id).maybeSingle();
   if(e)throw e;
   if(!record)return res({ok:false,error:"Request missing"},404);
   if(["已核准","已駁回","待核准"].includes(record.status))
    return res({ok:false,error:"Status no longer eligible"},409);
   const to=safe&&record.status==="同步中"?"同步失敗":"需人工核對";
   const {data:changed,error}=await db.from("overtime_web_requests")
    .update({status:to,last_error:description,updated_at:new Date().toISOString()})
    .eq("id",id).eq("status",record.status).select("*").maybeSingle();
   if(error)throw error;
   if(!changed)return res({ok:false,error:"Problem write race"},409);
   await audit(changed,"google-bridge",to==="同步失敗"?"sync_failed":"manual_review_required",
    {reason:description});
   return res({ok:true,status:to});
  }
  return res({ok:false,error:"Unknown action"},400);
 }catch(e){
  console.error("overtime-sheet-bridge",String(e));
  return res({ok:false,error:"Bridge server error"},500);
 }
});
