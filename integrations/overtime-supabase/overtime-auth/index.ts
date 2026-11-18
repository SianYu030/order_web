
import { createClient } from "npm:@supabase/supabase-js@2";

const API = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(API, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const ORIGIN = "https://sianyu030.github.io";
const ITERATIONS = 210000;

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin === ORIGIN ? ORIGIN : ORIGIN,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
}
function answer(obj: Record<string,unknown>, status=200, origin: string|null=null) {
  return new Response(JSON.stringify(obj), {status,headers:cors(origin)});
}
function bytesToB64(a: Uint8Array):string {
  let s="";for(let i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);
  return btoa(s);
}
function b64ToBytes(str:string):Uint8Array {
  return Uint8Array.from(atob(str),c=>c.charCodeAt(0));
}
async function derive(pwd:string,salt:string,iterations=ITERATIONS) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pwd),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:b64ToBytes(salt),iterations,hash:"SHA-256"},key,256);
  return new Uint8Array(bits);
}
function equalBytes(a:Uint8Array,b:Uint8Array) {
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0;
}
async function hashToken(token:string){
  const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)));
  return Array.from(hash,b=>b.toString(16).padStart(2,"0")).join("");
}
function randomToken(){const a=crypto.getRandomValues(new Uint8Array(32));return bytesToB64(a).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");}
async function log(actor:string|null,action:string,subject:string) {
  await db.from("overtime_auth_log").insert({actor_id:actor,action,subject});
}
async function getSession(token:string) {
  if(!/^[A-Za-z0-9_-]{40,60}$/.test(token))return null;
  const hash=await hashToken(token);
  const {data:session,error}=await db.from("overtime_sessions").select("account_id,expires_at").eq("token_hash",hash).maybeSingle();
  if(error||!session||Date.parse(session.expires_at)<=Date.now())return null;
  const {data:user}=await db.from("overtime_accounts").select("id,username,display_name,role,must_change,enabled").eq("id",session.account_id).maybeSingle();
  if(!user?.enabled)return null;
  return {user,hash};
}
function cleanUser(u:any){return {username:u.username,display_name:u.display_name||null,role:u.role,must_change:u.must_change};}
function validDisplayName(name:string){return name.length>=1&&name.length<=40&&!/[\u0000-\u001f\u007f]/u.test(name);}
function validPass(p:any){return typeof p==="string"&&p.length>=4&&p.length<=72&&p!=="1234";}
function validTemporaryPass(p:any){return typeof p==="string"&&p.length>=4&&p.length<=72;}
async function safeJson(req:Request) {try{return await req.json()}catch{return null}}
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=="POST")return answer({ok:false,error:"僅支援 POST"},405,origin);
  if(origin && origin!==ORIGIN)return answer({ok:false,error:"來源不允許"},403,origin);
  const body=await safeJson(req);
  if(!body||typeof body!=="object")return answer({ok:false,error:"請求格式不正確"},400,origin);
  const action=String(body.action||"");
  try {
    if(action==="login"){
      const username=String(body.username||"").trim(),password=String(body.password||"");
      if(!/^[A-Za-z0-9_-]{2,32}$/.test(username)||password.length>200)
        return answer({ok:false,error:"帳號或密碼錯誤"},401,origin);
      const lower=username.toLowerCase();
      const {data:attempt}=await db.from("overtime_attempts").select("*").eq("username",lower).maybeSingle();
      if(attempt?.locked_until&&Date.parse(attempt.locked_until)>Date.now())
        return answer({ok:false,error:"錯誤次數過多，請15分鐘後再登入"},429,origin);
      const {data:user,error}=await db.from("overtime_accounts").select("*").ilike("username",username).maybeSingle();
      let correct=false;
      if(!error&&user?.enabled){
        correct=equalBytes(await derive(password,user.salt_b64,user.iterations),b64ToBytes(user.hash_b64));
      }else{
        await derive(password,"AAAAAAAAAAAAAAAAAAAAAA==");
      }
      if(!correct){
        const recent=attempt?.last_failure&&Date.now()-Date.parse(attempt.last_failure)<900000;
        const failures=recent?Number(attempt.failures)+1:1;
        const blocked=failures>=5?new Date(Date.now()+900000).toISOString():null;
        await db.from("overtime_attempts").upsert({username:lower,failures,locked_until:blocked,last_failure:new Date().toISOString()});
        return answer({ok:false,error:blocked?"錯誤次數過多，請15分鐘後再登入":"帳號或密碼錯誤"},401,origin);
      }
      await db.from("overtime_attempts").delete().eq("username",lower);
      const token=randomToken(),token_hash=await hashToken(token);
      const expires_at=new Date(Date.now()+8*3600*1000).toISOString();
      const {error:insertErr}=await db.from("overtime_sessions").insert({token_hash,account_id:user.id,expires_at});
      if(insertErr)throw insertErr;
      await log(user.id,"login",user.username);
      return answer({ok:true,token,user:cleanUser(user),expires_at},200,origin);
    }
    const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
    const auth=await getSession(token);
    if(!auth)return answer({ok:false,error:"登入已過期，請重新登入",code:"AUTH"},401,origin);
    const user=auth.user;
    if(action==="me")return answer({ok:true,user:cleanUser(user)},200,origin);
    if(action==="logout"){
      await db.from("overtime_sessions").delete().eq("token_hash",auth.hash);
      await log(user.id,"logout",user.username);
      return answer({ok:true},200,origin);
    }
    if(action==="change-password"){
      const old=String(body.old_password||""),next=String(body.new_password||"");
      if(!validPass(next))return answer({ok:false,error:"新密碼至少4碼，且不可使用預設密碼1234"},400,origin);
      const {data:stored}=await db.from("overtime_accounts").select("salt_b64,hash_b64,iterations").eq("id",user.id).single();
      if(!stored||!equalBytes(await derive(old,stored.salt_b64,stored.iterations),b64ToBytes(stored.hash_b64)))
        return answer({ok:false,error:"原密碼錯誤"},403,origin);
      if(old===next)return answer({ok:false,error:"新密碼不可與原密碼相同"},400,origin);
      const salt=bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
      const password_hash=bytesToB64(await derive(next,salt));
      const {error}=await db.from("overtime_accounts").update({salt_b64:salt,hash_b64:password_hash,iterations:ITERATIONS,must_change:false,updated_at:new Date().toISOString()}).eq("id",user.id);
      if(error)throw error;
      await db.from("overtime_sessions").delete().eq("account_id",user.id).neq("token_hash",auth.hash);
      await log(user.id,"change-password",user.username);
      return answer({ok:true},200,origin);
    }
    if(user.must_change)return answer({ok:false,error:"請先修改預設密碼",code:"CHANGE_REQUIRED"},403,origin);
    if(action==="review-access")return answer({ok:true,user:cleanUser(user),access:"supervisor"},200,origin);
    if(user.role!=="admin")return answer({ok:false,error:"只有系統管理員能管理帳號",code:"FORBIDDEN"},403,origin);
    if(action==="users"){
      const {data,error}=await db.from("overtime_accounts").select("username,display_name,role,enabled,must_change").order("username");
      if(error)throw error;
      return answer({ok:true,users:data},200,origin);
    }
    if(action==="add"){
      const username=String(body.username||"").trim(),password=String(body.password||"");
      const display_name=typeof body.display_name==="string"?body.display_name.trim():"";
      if(display_name&&!validDisplayName(display_name))return answer({ok:false,error:"主管姓名需在1至40字內，且不得包含換行或控制字元"},400,origin);
      if(!/^[A-Za-z0-9_-]{2,32}$/.test(username))
        return answer({ok:false,error:"帳號需為2至32碼英文字母、數字、底線或連字號"},400,origin);
      if(!validTemporaryPass(password))
        return answer({ok:false,error:"初始密碼需為4至72碼；可先使用1234，之後自行修改"},400,origin);
      // Deletion releases the username; never keep a denylist of previously deleted accounts.
      const {data:existing,error:lookupError}=await db.from("overtime_accounts")
        .select("id").ilike("username",username).maybeSingle();
      if(lookupError)throw lookupError;
      if(existing)return answer({ok:false,error:"此帳號目前已存在；請使用重設密碼，或刪除後重新新增"},409,origin);
      const salt=bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
      const hash=bytesToB64(await derive(password,salt));
      const {error}=await db.from("overtime_accounts").insert({username,display_name:display_name||null,role:"supervisor",salt_b64:salt,hash_b64:hash,iterations:ITERATIONS,must_change:false});
      if(error){
        if(error.code==="23505")return answer({ok:false,error:"此帳號目前已存在；請使用重設密碼，或刪除後重新新增"},409,origin);
        throw error;
      }
      // Supervisors may sign in with an administrator-created initial password immediately. They can change it manually later.
      await log(user.id,"add-user",username);
      return answer({ok:true,message:"主管帳號建立成功，可直接使用初始密碼登入，日後可在「修改我的密碼」變更。"},200,origin);
    }
    if(action==="rename"){
      const username=String(body.username||"").trim();
      const display_name=typeof body.display_name==="string"?body.display_name.trim():"";
      if(!/^[A-Za-z0-9_-]{2,32}$/.test(username)||!validDisplayName(display_name))
        return answer({ok:false,error:"主管帳號或姓名不正確；姓名需為1至40字且不能包含換行"},400,origin);
      // Only an authenticated admin may edit the display name, and never the administrator account.
      const {data:target,error:lookupError}=await db.from("overtime_accounts")
        .select("id,role,display_name").ilike("username",username).maybeSingle();
      if(lookupError)throw lookupError;
      if(!target||target.role!=="supervisor")
        return answer({ok:false,error:"只能修改主管帳號的姓名"},403,origin);
      if(target.display_name===display_name)
        return answer({ok:true,message:"姓名沒有變更",display_name},200,origin);
      const {data:saved,error:saveError}=await db.from("overtime_accounts")
        .update({display_name,updated_at:new Date().toISOString()})
        .eq("id",target.id).eq("role","supervisor")
        .select("id").maybeSingle();
      if(saveError)throw saveError;
      if(!saved)return answer({ok:false,error:"主管帳號狀態已改變，請重新整理"},409,origin);
      await log(user.id,"rename-supervisor",username);
      return answer({ok:true,display_name,message:"已更新主管 "+username+" 的姓名"},200,origin);
    }
    if(action==="delete"){
      // A verified admin session is already required above; only supervisor accounts may be removed.
      const username=String(body.username||"").trim();
      if(!/^[A-Za-z0-9_-]{2,32}$/.test(username)||username.toLowerCase()===String(user.username).toLowerCase())
        return answer({ok:false,error:"刪除帳號格式錯誤，或不允許刪除自己的帳號"},400,origin);
      const confirmName=String(body.confirm_username||"").trim();
      if(confirmName!==username)
        return answer({ok:false,error:"請再次輸入完全相同的帳號，才可執行刪除"},400,origin);
      const {data:removed,error}=await db.rpc("overtime_delete_supervisor",{
        p_username:username,p_admin_id:user.id
      });
      if(error){
        console.error("overtime supervisor deletion blocked",error.code);
        return answer({ok:false,error:"刪除未完成，請確認帳號狀態或聯絡系統管理員"},409,origin);
      }
      if(removed!==true)
        return answer({ok:false,error:"查無可刪除的主管帳號；管理員帳號不可刪除"},404,origin);
      return answer({ok:true,deleted:username,message:"主管登入帳號已刪除；原有核准、工時及稽核紀錄保留。"},200,origin);
    }
    if(action==="toggle"||action==="reset"){
      const username=String(body.username||"").trim();
      const {data:target}=await db.from("overtime_accounts").select("id,role,enabled").eq("username",username).maybeSingle();
      if(!target||target.role!=="supervisor")return answer({ok:false,error:"只能管理主管帳號"},400,origin);
      if(action==="toggle"){
        const enabled=Boolean(body.enabled);
        const {error}=await db.from("overtime_accounts").update({enabled}).eq("id",target.id);
        if(error)throw error;
        if(!enabled)await db.from("overtime_sessions").delete().eq("account_id",target.id);
        await log(user.id,enabled?"enable-user":"disable-user",username);
        return answer({ok:true},200,origin);
      }
      const password=String(body.password||"");
      if(!validTemporaryPass(password))return answer({ok:false,error:"密碼需為4至72碼；可先使用1234，之後自行修改"},400,origin);
      const salt=bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
      const hash=bytesToB64(await derive(password,salt));
      const {error}=await db.from("overtime_accounts").update({
        salt_b64:salt,hash_b64:hash,iterations:ITERATIONS,must_change:false,updated_at:new Date().toISOString()
      }).eq("id",target.id);
      if(error)throw error;
      await db.from("overtime_sessions").delete().eq("account_id",target.id);
      await log(user.id,"reset-password",username);
      return answer({ok:true},200,origin);
    }
    return answer({ok:false,error:"不支援的操作"},400,origin);
  }catch(e){
    console.error("overtime-auth handler error",String(e));
    return answer({ok:false,error:"伺服器處理失敗，請稍後重試"},500,origin);
  }
});
