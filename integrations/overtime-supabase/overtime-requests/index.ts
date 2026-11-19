
import { createClient } from "npm:@supabase/supabase-js@2";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const ALLOWED_ORIGIN="https://sianyu030.github.io";
const OK_STATUSES=["待同步","同步中","同步失敗","待核准","核准待同步","駁回待同步","需人工核對"];
function headers(origin:string|null){return {"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Headers":"Content-Type, Authorization, apikey","Access-Control-Allow-Methods":"POST, OPTIONS","Cache-Control":"no-store"};}
function response(data:Record<string,unknown>,status=200,origin:string|null=null){return new Response(JSON.stringify(data),{status,headers:headers(origin)});}
function parseDate(date:unknown){
  if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const d=new Date(date+"T00:00:00Z");if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==date)return false;
  const year=d.getUTCFullYear();return year>=2026&&year<=2030;
}
function b64(a:Uint8Array){return btoa(String.fromCharCode(...a)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");}
async function sha256(x:string){const h=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(x)));return Array.from(h,b=>b.toString(16).padStart(2,"0")).join("");}
function makeToken(){return b64(crypto.getRandomValues(new Uint8Array(32)));}
// Post a signed wake-up signal only. Google Apps Script ALWAYS pulls the authoritative request
// again with its own server-side bridge token. No hour/employee fields go to the webhook.
async function wakeGoogle(id:string,event:"submit"|"approve"|"update"|"reject"){
 try{
  const {data:keys,error}=await db.from("overtime_sheet_bridge_keys")
   .select("id,token_hash,webhook_url").eq("enabled",true).not("webhook_url","is",null).limit(2);
  if(error)throw error;
  for(const k of keys||[]){
   if(typeof k.webhook_url!=="string"||
      !/^https:\/\/script[.]google[.]com\/macros\/s\/[A-Za-z0-9_-]{30,256}\/exec$/.test(k.webhook_url))
      continue;
   let outcome="failed";
   try{
    const ts=Date.now(),canonical=ts+"."+id+"."+event;
    const raw=new TextEncoder().encode(k.token_hash);
    const key=await crypto.subtle.importKey("raw",raw,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
    const signature=Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",key,
      new TextEncoder().encode(canonical))),x=>x.toString(16).padStart(2,"0")).join("");
    const response=await fetch(k.webhook_url,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ts,id,event,signature}),
      redirect:"follow",signal:AbortSignal.timeout(7000)
    });
    const rawBody=await response.text();
    let body:any={};
    try{body=JSON.parse(rawBody)}catch{}
    outcome=response.ok&&body?.ok===true?"accepted":"http_"+response.status;
   }catch(e){console.warn("Google instant wake-up unsuccessful:",String(e));}
   const {error:trackError}=await db.from("overtime_sheet_bridge_keys")
    .update({last_notify_at:new Date().toISOString(),last_notify_result:outcome})
    .eq("id",k.id).eq("enabled",true);
   if(trackError)console.warn("Instant sync telemetry failed:",trackError.code);
  }
 }catch(e){console.warn("Google instant wake-up skipped:",String(e));}
}
async function notifyGoogle(id:string,event:"submit"|"approve"|"update"|"reject"){
 const job=wakeGoogle(id,event);
 const edge=(globalThis as any).EdgeRuntime;
 if(edge?.waitUntil)edge.waitUntil(job);
 else await job;
}

async function readAuth(req:Request){
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(!/^[A-Za-z0-9_-]{40,60}$/.test(token))return null;
 const digest=await sha256(token);
 const {data:session}=await db.from("overtime_sessions").select("account_id,expires_at").eq("token_hash",digest).maybeSingle();
 if(!session||Date.parse(session.expires_at)<Date.now())return null;
 const {data:account}=await db.from("overtime_accounts").select("id,username,display_name,role,enabled,must_change").eq("id",session.account_id).maybeSingle();
 if(!account?.enabled||account.must_change||!["admin","supervisor"].includes(account.role))return null;
 return account;
}
async function rate(req:Request){
 const ip=(req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||req.headers.get("x-forwarded-for")||"anonymous").split(",")[0].slice(0,70);
 const digest=await sha256("overtime:"+ip);
 const {data,error}=await db.rpc("overtime_web_allow_submit",{p_hash:digest});
 if(error)throw error;
 return Boolean(data);
}
function clean(r:any,includeInternal=false){return {
 id:r.id,request_no:r.request_no,date:r.work_date,department:r.department,...(includeInternal?{employee_id:r.employee_id}:{}),
 employee_name:r.employee_name,hours:Number(r.hours),reason:r.reason,status:r.status,
 created_at:r.created_at,updated_at:r.updated_at,source_sheet:r.source_sheet||null,
 source_range:r.source_range||null,manager:r.manager_name||null,manager_time:r.manager_time||null
};}
async function jsonBody(req:Request){try{return await req.json()}catch{return null;}}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=="POST")return response({ok:false,error:"不支援的要求"},405,origin);
 if(origin&&origin!==ALLOWED_ORIGIN)return response({ok:false,error:"網頁來源不允許"},403,origin);
 const body=await jsonBody(req);
 if(!body||typeof body!=="object")return response({ok:false,error:"要求格式錯誤"},400,origin);
 const action=String(body.action||"");
 try{
  if(action==="roster"){
   const {data,error}=await db.from("overtime_web_roster").select("department,public_key,employee_name,team,employee_id").eq("enabled",true).order("employee_name");
   if(error)throw error;
   return response({ok:true,people:(data||[]).map(p=>({
     department:p.department,public_key:p.public_key,employee_name:p.employee_name,
     team:p.team,display_code:String(p.employee_id||"")
    }))},200,origin);
  }
  if(action==="submit"){
   const department=String(body.department||""),roster_key=String(body.roster_key||""),
         employee_name=String(body.employee_name||"").trim(),date=String(body.date||""),
         hours=Number(body.hours),reason=String(body.reason||"").trim();
   if(!["E4","E5"].includes(department)||!/^[0-9a-f-]{36}$/.test(roster_key)||!parseDate(date)||
      !Number.isFinite(hours)||hours<0.5||hours>24||Math.round(hours*2)!==hours*2||
      reason.length<1||reason.length>1600||employee_name.length>80)
       return response({ok:false,error:"日期、時數或加班原因不符合規則"},400,origin);
   const {data:person}=await db.from("overtime_web_roster").select("employee_id,employee_name,enabled").eq("department",department).eq("public_key",roster_key).maybeSingle();
   if(!person?.enabled||person.employee_name!==employee_name)return response({ok:false,error:"員工資料與正式名冊不一致"},400,origin);
   const employee_id=person.employee_id;
   if(!await rate(req))return response({ok:false,error:"送出次數過多，請稍後再試"},429,origin);
   const {data:existing,error:checkError}=await db.from("overtime_web_requests").select("id,status").eq("department",department).eq("employee_id",employee_id).eq("work_date",date).not("status","in",'("已駁回","已取消")').maybeSingle();
   if(checkError)throw checkError;
   if(existing)return response({ok:false,error:"這位員工在該日期已經有申請，請先於查詢頁核對，不會建立重複資料",code:"DUPLICATE"},409,origin);
   const token=makeToken(),request_no="BUS-"+date.replace(/-/g,"")+"-"+department+"-"+employee_id+"-"+crypto.randomUUID().slice(0,8).toUpperCase();
   const {data,error}=await db.from("overtime_web_requests").insert({
    request_no,department,employee_id,employee_name,work_date:date,hours,reason,
    status:"待同步",receipt_hash:await sha256(token)
   }).select("*").single();
   if(error){
     if(error.code==="23505")return response({ok:false,error:"同日已存在申請，禁止重複送出",code:"DUPLICATE"},409,origin);
     throw error;
   }
   await db.from("overtime_web_audit").insert({request_id:data.id,actor:"employee-portal",action:"submitted",details:{department,employee_id}});
   await notifyGoogle(data.id,"submit");
   return response({ok:true,record:clean(data),receipt_token:token,message:"申請已送入安全後端，Google 試算表尚待同步，尚未正式核准。"},200,origin);
  }
  if(action==="receipt"){
   const id=String(body.id||""),token=String(body.receipt_token||"");
   if(!/^[0-9a-f-]{36}$/.test(id)||token.length<30)return response({ok:false,error:"查詢憑證錯誤"},400,origin);
   const hash=await sha256(token);
   const {data}=await db.from("overtime_web_requests").select("*").eq("id",id).eq("receipt_hash",hash).maybeSingle();
   if(!data)return response({ok:false,error:"查無此申請或查詢憑證已失效"},404,origin);
   return response({ok:true,record:clean(data)},200,origin);
  }
  // Employee self-cancel: valid original receipt token, before supervisor approval only.
  // Keep the existing rejection synchronization contract; the employee actor is separately audited.
  if(action==="cancel"){
   const id=String(body.id||""),token=String(body.receipt_token||"");
   if(!/^[0-9a-f-]{36}$/.test(id)||token.length<30||token.length>128)
    return response({ok:false,error:"取消憑證不符合規則"},400,origin);
   const hash=await sha256(token);
   const {data:before,error:lookupError}=await db.from("overtime_web_requests").select("*")
    .eq("id",id).eq("receipt_hash",hash).maybeSingle();
   if(lookupError)throw lookupError;
   if(!before)return response({ok:false,error:"找不到這筆申請或沒有取消權限"},403,origin);
   if(["已駁回","駁回待同步"].includes(before.status)&&before.manager_name==="員工自行取消")
    return response({ok:true,record:clean(before),message:"這筆申請已提出取消，不需要重複操作。"},200,origin);
   if(!["待同步","待核准"].includes(before.status))
    return response({ok:false,error:"申請已進入同步、核准或人工核對流程，不能自行取消。請聯絡主管處理；已核准工時不可直接刪除。"},409,origin);
   const registered=before.status==="待核准";
   if((registered&&(before.source_sheet!=="業務假日或臨時加班登記"||
     !/^A([2-9]|[1-9][0-9]{1,3}):R\1$/.test(String(before.source_range||""))))||
      (!registered&&(before.source_sheet||before.source_range)))
    return response({ok:false,error:"Google 原始申請資料待核對，禁止直接取消，請聯絡主管。"},409,origin);
   if(!await rate(req))return response({ok:false,error:"操作過於頻繁，請稍後再試"},429,origin);
   const now=new Date().toISOString();
   const next=registered?"駁回待同步":"已駁回";
   const {data:updated,error}=await db.from("overtime_web_requests")
    .update({status:next,manager_name:"員工自行取消",manager_time:now,
      last_error:null,updated_at:now})
    .eq("id",id).eq("receipt_hash",hash)
    .eq("status",before.status).eq("updated_at",before.updated_at)
    .select("*").maybeSingle();
   if(error)throw error;
   if(!updated)return response({ok:false,error:"申請狀態剛剛已變更，請重新查詢；沒有執行取消。"},409,origin);
   const {error:auditError}=await db.from("overtime_web_audit").insert({
    request_id:id,actor:"employee-portal",action:"cancelled_by_employee",
    details:{previous_status:before.status,google_source_registered:registered,
      source_sheet:before.source_sheet||null,source_range:before.source_range||null}
   });
   if(auditError)console.error("Self cancellation audit failed:",auditError.code);
   if(registered)await notifyGoogle(id,"reject");
   return response({ok:true,record:clean(updated),
    message:registered?"已提出取消，待 Google 核對來源後完成；不會寫入正式工時。":"已取消申請，正式工時未寫入。"},200,origin);
  }
  if(action==="update"){
   const id=String(body.id||""),token=String(body.receipt_token||""),
         hours=Number(body.hours),reason=String(body.reason||"").trim();
   if(!/^[0-9a-f-]{36}$/.test(id)||token.length<30||!Number.isFinite(hours)||
      hours<0.5||hours>24||Math.round(hours*2)!==hours*2||reason.length<1||reason.length>1600)
       return response({ok:false,error:"資料或修改憑證不符合規則"},400,origin);
   const hash=await sha256(token);
   const {data:existing}=await db.from("overtime_web_requests").select("*").eq("id",id).eq("receipt_hash",hash).maybeSingle();
   if(!existing)return response({ok:false,error:"沒有此申請的修改權限"},403,origin);
   if(existing.status!=="待同步")return response({ok:false,error:"申請已進入同步或主管審核，不可自行修改"},409,origin);
   if(!await rate(req))return response({ok:false,error:"操作頻率過高，請稍後再試"},429,origin);
   const {data:record,error}=await db.from("overtime_web_requests").update({hours,reason,updated_at:new Date().toISOString()})
    .eq("id",id).eq("receipt_hash",hash).eq("status","待同步").select("*").maybeSingle();
   if(error)throw error;
   if(!record)return response({ok:false,error:"申請狀態已變更，請重新整理"},409,origin);
   await db.from("overtime_web_audit").insert({request_id:id,actor:"employee-portal",action:"modified",details:{}});
   await notifyGoogle(id,"update");
   return response({ok:true,record:clean(record),message:"後端申請已更新，仍等待 Google 試算表同步。"},200,origin);
  }
  const actor=await readAuth(req);
  if(!actor)return response({ok:false,error:"主管登入已失效或尚未修改初始密碼",code:"AUTH"},401,origin);
  if(action==="queue"){
   const {data,error}=await db.from("overtime_web_requests").select("*").in("status",OK_STATUSES).order("created_at",{ascending:false}).limit(200);
   if(error)throw error;
   return response({ok:true,actor:actor.username,records:(data||[]).map(x=>clean(x,true))},200,origin);
  }
  if(action==="approve"){
   const id=String(body.id||"");
   if(!/^[0-9a-f-]{36}$/.test(id))return response({ok:false,error:"申請編號錯誤"},400,origin);
   const {data:before,error:findError}=await db.from("overtime_web_requests")
    .select("id,status,source_sheet,source_range,request_no").eq("id",id).maybeSingle();
   if(findError)throw findError;
   if(!before || before.status!=="待核准" ||
      before.source_sheet!=="業務假日或臨時加班登記" ||
      !/^A([2-9]|[1-9][0-9]{1,3}):R\1$/.test(String(before.source_range||"")))
     return response({ok:false,error:"必須先確認 Google 待核准來源已同步，才允許主管核准。請勿重複操作。"},409,origin);
   const now=new Date().toISOString();
   const {data:approved,error}=await db.from("overtime_web_requests")
    .update({status:"核准待同步",manager_name:(typeof actor.display_name==="string"&&actor.display_name.trim()?actor.display_name.trim():actor.username),manager_time:now,updated_at:now})
    .eq("id",id).eq("status","待核准").select("*").maybeSingle();
   if(error)throw error;
   if(!approved)return response({ok:false,error:"申請已由其他主管處理，請重新整理"},409,origin);
   await db.from("overtime_web_audit").insert({request_id:id,actor:actor.username,
    action:"approved_pending_sheet_write",details:{source_sheet:before.source_sheet,source_range:before.source_range}});
   await notifyGoogle(id,"approve");
   return response({ok:true,record:clean(approved,true),
    message:"主管核准已留存後端，Google 正式月表尚未寫入。待同步驗證成功後才顯示已核准。"},200,origin);
  }
  if(action==="reject"){
   const id=String(body.id||"");
   if(!/^[0-9a-f-]{36}$/.test(id))return response({ok:false,error:"申請編號錯誤"},400,origin);
   const {data:before}=await db.from("overtime_web_requests").select("*").eq("id",id).maybeSingle();
   if(!before||!["待同步","同步失敗","待核准"].includes(before.status))
    return response({ok:false,error:"這筆申請已進入核准、駁回或人工核對流程，請更新收件清單，不可重複處理。"},409,origin);
   const registered=before.status==="待核准";
   if(registered&&(before.source_sheet!=="業務假日或臨時加班登記"||
      !/^A([2-9]|[1-9][0-9]{1,3}):R\1$/.test(String(before.source_range||""))))
    return response({ok:false,error:"Google 來源儲存格沒有通過驗證，禁止駁回，請管理員核對。"},409,origin);
   const nextStatus=registered?"駁回待同步":"已駁回",now=new Date().toISOString();
   const {data:updated,error}=await db.from("overtime_web_requests")
    .update({status:nextStatus,manager_name:(typeof actor.display_name==="string"&&actor.display_name.trim()?actor.display_name.trim():actor.username),manager_time:now,updated_at:now})
    .eq("id",id).eq("status",before.status).select("*").maybeSingle();
   if(error)throw error;
   if(!updated)return response({ok:false,error:"申請已由其他主管處理，請重新整理"},409,origin);
   await db.from("overtime_web_audit").insert({request_id:id,actor:actor.username,
    action:registered?"rejected_pending_sheet_sync":"rejected",
    details:{previous_status:before.status,source_sheet:before.source_sheet||null,source_range:before.source_range||null}});
   if(registered)await notifyGoogle(id,"reject");
   return response({ok:true,record:clean(updated),message:registered?
    "主管駁回已記錄，正在同步 Google 來源表；Google 讀回成功後才會從月檢視移除，正式工時未修改。":
    "尚未進入 Google 登記表的申請已駁回，歷史紀錄保留。"},200,origin);
  }
  return response({ok:false,error:"不支援的操作"},400,origin);
 }catch(e){
  console.error("overtime-requests",String(e));
  return response({ok:false,error:"後端處理失敗，請稍後再試；請勿重複送出"},500,origin);
 }
});
