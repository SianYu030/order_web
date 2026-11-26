// Isolated pilot: no work orders, LINE sends or production storage changes.
const ROOT=Deno.env.get("SUPABASE_URL")!, KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TABLE="repair_camera_bridge_pilot", BUCKET="repair-camera-pilot-private";
const ORIGIN="https://sianyu030.github.io", MAX=20*1024*1024;
const cors={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type,X-Camera-Ticket,X-Camera-Receipt","Access-Control-Expose-Headers":"X-Camera-Sha256,Content-Length,Content-Type","Vary":"Origin","Cache-Control":"no-store"};
class Fail extends Error{constructor(public code:string,public status=400){super(code)}}
function need(v:unknown,c:string,s=400){if(!v)throw new Fail(c,s)}
function json(x:unknown,status=200){return new Response(JSON.stringify(x),{status,headers:{...cors,"Content-Type":"application/json"}})}
async function sha(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join("")}
async function api(path:string,opt:RequestInit={}){
 need(ROOT&&KEY,"CONFIG_UNAVAILABLE",503);
 return await fetch(ROOT+path,{...opt,headers:{apikey:KEY,Authorization:"Bearer "+KEY,...(opt.headers as Record<string,string>||{})},signal:AbortSignal.timeout(45000)});
}
async function rows(query:string,patch?:Record<string,unknown>){
 const r=await api("/rest/v1/"+TABLE+"?"+query,patch?{method:"PATCH",headers:{"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify(patch)}:{});
 need(r.ok,"TICKET_STORE_UNAVAILABLE",503);return await r.json();
}
async function ensureBucket(){
 let r=await api("/storage/v1/bucket/"+BUCKET);
 if(r.status===404){await api("/storage/v1/bucket",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:BUCKET,name:BUCKET,public:false,file_size_limit:MAX,allowed_mime_types:["video/mp4","video/quicktime"]})});r=await api("/storage/v1/bucket/"+BUCKET)}
 need(r.ok,"PRIVATE_BUCKET_UNAVAILABLE",503);const b=await r.json();
 need(b.public===false&&Number(b.file_size_limit)===MAX&&Array.isArray(b.allowed_mime_types)&&b.allowed_mime_types.includes("video/mp4")&&b.allowed_mime_types.includes("video/quicktime"),"BUCKET_CONFIG_INVALID",503);
}
async function readLimited(req:Request){
 const declared=req.headers.get("Content-Length");if(declared)need(/^\d+$/.test(declared)&&Number(declared)<=MAX&&Number(declared)>0,"FILE_SIZE_LIMIT",413);
 need(req.body,"EMPTY_FILE");const rd=req.body!.getReader();let total=0;const parts:Uint8Array[]=[];
 try{for(;;){const x=await rd.read();if(x.done)break;total+=x.value.length;if(total>MAX){await rd.cancel();throw new Fail("FILE_SIZE_LIMIT",413)}parts.push(x.value)}}finally{rd.releaseLock()}
 need(total>=16,"EMPTY_FILE");const b=new Uint8Array(total);let at=0;for(const p of parts){b.set(p,at);at+=p.length}return b;
}
function mediaMime(b:Uint8Array){const str=(a:number,z:number)=>String.fromCharCode(...b.slice(a,z));need(str(4,8)==="ftyp","VIDEO_CONTAINER_REQUIRED",415);const brand=str(8,12);need(/^(qt  |isom|iso[2-9]|mp4[12]|avc1|hvc1|hevc|M4V |MSNV|dash)$/.test(brand),"UNSUPPORTED_VIDEO_CONTAINER",415);return brand==="qt  "?"video/quicktime":"video/mp4"}
function objectPath(id:string){need(/^[a-f0-9-]{36}$/.test(id),"TICKET_INVALID",401);return "pilot/"+id+"/capture"}
async function removeObject(id:string){const r=await api("/storage/v1/object/"+BUCKET,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({prefixes:[objectPath(id)]})});need(r.ok||r.status===404,"CLEANUP_UNCONFIRMED",502)}
Deno.serve(async req=>{
 try{
  const origin=req.headers.get("Origin");need(!origin||origin===ORIGIN,"ORIGIN_FORBIDDEN",403);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  const op=new URL(req.url).searchParams.get("op")||"health";
  if(op==="health"&&req.method==="GET")return json({ok:true,pilot:true,maxBytes:MAX,production:false});
  need(["upload","status","read","ack","discard"].includes(op),"UNKNOWN_OPERATION",404);
  need(req.method===(["status","read"].includes(op)?"GET":"POST"),"METHOD_INVALID",405);
  const token=req.headers.get("X-Camera-Ticket")||"";need(/^[a-f0-9]{64}$/.test(token),"TICKET_REQUIRED",401);
  const hash=await sha(new TextEncoder().encode(token)),field=op==="upload"?"upload_hash":"read_hash";
  const got=await rows(field+"=eq."+hash+"&select=id,state,expires_at,size_bytes,sha256,mime&limit=1");need(got.length===1,"TICKET_INVALID",401);const t=got[0],filter="id=eq."+t.id;
  const expired=Date.parse(t.expires_at)<=Date.now();
  if(op==="discard"){
    need(t.state!=="uploading","UPLOAD_IN_PROGRESS",409);
    if(t.state==="ready"||t.state==="failed")await removeObject(t.id);
    const p=await rows(filter+"&state=eq."+t.state,{state:"consumed"});need(p.length===1,"STATE_CHANGED",409);return json({ok:true,consumed:true});
  }
  need(!expired,"TICKET_EXPIRED",410);
  if(op==="status")return json({ok:true,state:t.state,size:t.size_bytes,sha256:t.sha256,mime:t.mime});
  if(op==="upload"){
    need(t.state==="waiting","TICKET_ALREADY_USED",409);
    const claimed=await rows(filter+"&state=eq.waiting&expires_at=gt."+encodeURIComponent(new Date().toISOString()),{state:"uploading"});need(claimed.length===1,"TICKET_ALREADY_USED",409);
    try{
     const b=await readLimited(req),mime=mediaMime(b),digest=await sha(b);
     await ensureBucket();
     const r=await api("/storage/v1/object/"+BUCKET+"/"+objectPath(t.id),{method:"POST",headers:{"Content-Type":mime,"x-upsert":"false"},body:b});need(r.ok,"PRIVATE_UPLOAD_FAILED",502);
     const updated=await rows(filter+"&state=eq.uploading",{state:"ready",size_bytes:b.length,sha256:digest,mime});need(updated.length===1,"RECEIPT_UNCONFIRMED",502);
     return json({ok:true,state:"ready",size:b.length});
    }catch(e){try{await rows(filter+"&state=eq.uploading",{state:"failed"})}catch(_){}throw e}
  }
  need(t.state==="ready","VIDEO_NOT_READY",409);
  if(op==="read"){
    const r=await api("/storage/v1/object/authenticated/"+BUCKET+"/"+objectPath(t.id));need(r.ok,"FILE_UNAVAILABLE",502);
    const b=new Uint8Array(await r.arrayBuffer());need(b.length===t.size_bytes&&await sha(b)===t.sha256,"VIDEO_INTEGRITY_FAILED",502);
    return new Response(b,{headers:{...cors,"Content-Type":t.mime,"Content-Length":String(b.length),"X-Camera-Sha256":t.sha256}});
  }
  need(req.headers.get("X-Camera-Receipt")===t.sha256,"RECEIPT_MISMATCH",409);
  await removeObject(t.id);const ack=await rows(filter+"&state=eq.ready",{state:"consumed"});need(ack.length===1,"STATE_CHANGED",409);return json({ok:true,consumed:true});
 }catch(e){return json({ok:false,error:e instanceof Fail?e.code:"PILOT_OPERATION_FAILED"},e instanceof Fail?e.status:502)}
});