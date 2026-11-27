/* Direct binary intake: activated only when both existing MR authority and cloud are ready. */
(function(root){
'use strict';
const CHUNK=6*1024*1024,MAX=50*1024*1024,HOST='https://ppjbjenlzbpatzoabzxr.storage.supabase.co',ALIAS='https://ppjbjenlzbpatzoabzxr.supabase.co',ENDPOINT=HOST+'/storage/v1/upload/resumable/sign',BUCKET='repair-intake-private-v1';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v),need=(v,e)=>{if(!v)throw Error(e)},b64=v=>btoa(String.fromCharCode(...new TextEncoder().encode(v)));
function loc(v){const u=new URL(v,ENDPOINT);need([HOST,ALIAS].includes(u.origin)&&u.pathname.startsWith('/storage/v1/upload/resumable/')&&!u.username&&!u.password&&!u.hash,'UNEXPECTED_STORAGE_LOCATION');return u.href}
function same(r,c){return r&&r.sessionId===c.sessionId&&r.orderNo===c.orderNo&&r.epoch===c.epoch&&r.size===c.size}
const digestFile=async file=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
function checkReceipt(r,c,hash){need(r?.ok!==false&&same(r,c)&&r.uploadState==='verified'&&r.sha256===hash&&/^[a-f0-9]{32}$/.test(r.md5||''),'CLOUD_RECEIPT_UNVERIFIED');return r}
async function upload(file,context,api,opt={}){
 const c={sessionId:context.sessionId,orderNo:context.orderNo,epoch:context.epoch,size:file.size};
 need(uuid(c.sessionId)&&uuid(c.epoch)&&/^MR20[0-9]{8}$/.test(c.orderNo)&&Number.isInteger(c.size)&&c.size>0&&c.size<=MAX,'INTAKE_CONTEXT_INVALID');
 const fetcher=opt.fetch||fetch,signal=opt.signal,mem=opt.resume||new Map(),key=c.sessionId+':'+c.epoch;
 const hash=opt.hash||await digestFile(file);need(/^[a-f0-9]{64}$/.test(hash),'INVALID_HASH');
 const assertReceipt=r=>{checkReceipt(r,c,hash);mem.delete(key);return r};
 const current=opt.preGrant?null:await api('status',{...c,sha256:hash});
 if(current?.uploadState==='verified')return assertReceipt(current);
 const grant=opt.preGrant||await api('reserve',{...c,sha256:hash});
 if(grant?.uploadState==='verified')return assertReceipt(grant);
 need(same(grant,c)&&grant.bucket===BUCKET&&grant.object==='intake-v1/'+c.sessionId+'/original'&&typeof grant.token==='string'&&grant.token.length>20&&grant.token.length<4096&&typeof grant.mime==='string'&&/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(grant.mime),'INVALID_SCOPED_GRANT');
 const headers={'Tus-Resumable':'1.0.0','x-signature':grant.token};
 const request=(url,init)=>fetcher(url,{...init,credentials:'omit',redirect:'error',cache:'no-store',signal,headers:{...headers,...init.headers}});
 let url=mem.get(key),offset=0;
 const head=async()=>{const r=await request(url,{method:'HEAD'});need(r.ok,'TUS_HEAD_UNCONFIRMED');const n=r.headers.get('Upload-Offset');need(n!==null&&/^\d+$/.test(n)&&Number(n)<=c.size,'INVALID_TUS_OFFSET');return Number(n)};
 if(url){url=loc(url);offset=await head()}else{
 const meta={bucketName:grant.bucket,objectName:grant.object,contentType:grant.mime,cacheControl:'0'};
 const r=await request(ENDPOINT,{method:'POST',headers:{'Upload-Length':String(c.size),'Upload-Metadata':Object.entries(meta).map(([k,v])=>k+' '+b64(v)).join(',')}});
 need(r.status===201&&r.headers.get('Location'),'TUS_CREATE_FAILED');url=loc(r.headers.get('Location'));mem.set(key,url)}
 let failures=0;
 while(offset<c.size){const start=offset,end=Math.min(start+CHUNK,c.size);
 try{const r=await request(url,{method:'PATCH',headers:{'Content-Type':'application/offset+octet-stream','Upload-Offset':String(start)},body:file.slice(start,end)});need(r.status===204,'TUS_PATCH_UNCONFIRMED');const n=r.headers.get('Upload-Offset');need(n!==null&&/^\d+$/.test(n)&&Number(n)===end,'INVALID_TUS_ACK');offset=end;failures=0}
 catch(e){if(signal?.aborted)throw e;const state=await api('status',{...c,sha256:hash});if(state?.uploadState==='verified')return assertReceipt(state);offset=await head();need(offset>=start&&offset<=end,'TUS_OFFSET_CONFLICT');if(offset===start){if(++failures>=3)throw Error('TUS_RETRY_LIMIT')}else failures=0}
 opt.progress?.(offset,c.size)}
 if(opt.deferCommit)return {pendingVerification:true,...c,sha256:hash};
 return assertReceipt(await api('commit',{...c,sha256:hash}));
}
// Separate authorization, bounded binary transfers and one authoritative batch verification.
// Individual failed items retain their exact session; no false success or replay of a verified file.
async function pool(items,work,width=3){
 const out=new Array(items.length);let cursor=0;
 async function lane(){while(cursor<items.length){const i=cursor++;try{out[i]={ok:true,value:await work(items[i],i)}}catch(error){out[i]={ok:false,error}}}}
 await Promise.all(Array.from({length:Math.min(width,items.length)},lane));return out;
}
async function uploadBatch(entries,api,opt={}){
 need(Array.isArray(entries)&&entries.length>=2&&entries.length<=13,'INVALID_BATCH');
 const orderNo=entries[0].context.orderNo,epoch=entries[0].context.epoch;
 need(/^MR20[0-9]{8}$/.test(orderNo)&&uuid(epoch)&&entries.every(e=>e.context.orderNo===orderNo&&e.context.epoch===epoch&&uuid(e.context.sessionId)&&e.file.size>0&&e.file.size<=MAX)&&new Set(entries.map(e=>e.context.sessionId)).size===entries.length,'INVALID_BATCH');
 const h=await pool(entries,async e=>({sessionId:e.context.sessionId,size:e.file.size,sha256:await digestFile(e.file)}));
 for(const x of h)if(!x.ok)throw x.error;
 const items=h.map(x=>x.value),reserved=await api('reserveBatchV2',{orderNo,epoch,items});
 need(reserved?.ok===true&&Array.isArray(reserved.items)&&reserved.items.length===items.length,'BATCH_RESERVATION_UNCONFIRMED');
 const out=await pool(entries,async(e,i)=>{
   const g=reserved.items[i],c={...e.context,size:e.file.size};
   need(g&&g.sessionId===c.sessionId,'BATCH_GRANT_IDENTITY_MISMATCH');
   if(g.ok===false){const err=Error(g.error||'BATCH_RESERVE_UNCONFIRMED');err.code=g.error;throw err}
   return upload(e.file,e.context,api,{...opt,preGrant:g,hash:items[i].sha256,deferCommit:true,progress:(done,total)=>opt.progress?.(i,done,total)});
 });
 const pending=out.map((v,i)=>v.ok&&v.value.pendingVerification?i:-1).filter(i=>i>=0);
 if(pending.length){
   try{
     const verified=await api('commitBatchV2',{orderNo,epoch,items:pending.map(i=>items[i])});
     need(verified?.ok===true&&Array.isArray(verified.items)&&verified.items.length===pending.length,'BATCH_VERIFY_UNCONFIRMED');
     for(let k=0;k<pending.length;k++){
       const i=pending[k],r=verified.items[k],c={...entries[i].context,size:entries[i].file.size};
       try{checkReceipt(r,c,items[i].sha256);opt.resume?.delete(c.sessionId+':'+epoch);out[i]={ok:true,value:r}}
       catch(error){out[i]={ok:false,error}}
     }
   }catch(error){for(const i of pending)out[i]={ok:false,error}}
 }
 return out;
}
root.repairFastIntakeV1=Object.freeze({upload,uploadBatch,version:'batch-v2'});
})(globalThis);