/* Direct binary intake: activated only when both existing MR authority and cloud are ready. */
(function(root){
'use strict';
const CHUNK=6*1024*1024,MAX=50*1024*1024,HOST='https://ppjbjenlzbpatzoabzxr.storage.supabase.co',ALIAS='https://ppjbjenlzbpatzoabzxr.supabase.co',ENDPOINT=HOST+'/storage/v1/upload/resumable/sign',BUCKET='repair-intake-private-v1';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v),need=(v,e)=>{if(!v)throw Error(e)},b64=v=>btoa(String.fromCharCode(...new TextEncoder().encode(v)));
function loc(v){const u=new URL(v,ENDPOINT);need([HOST,ALIAS].includes(u.origin)&&u.pathname.startsWith('/storage/v1/upload/resumable/')&&!u.username&&!u.password&&!u.hash,'UNEXPECTED_STORAGE_LOCATION');return u.href}
function same(r,c){return r&&r.sessionId===c.sessionId&&r.orderNo===c.orderNo&&r.epoch===c.epoch&&r.size===c.size}
async function upload(file,context,api,opt={}){
 const c={sessionId:context.sessionId,orderNo:context.orderNo,epoch:context.epoch,size:file.size};
 need(uuid(c.sessionId)&&uuid(c.epoch)&&/^MR20[0-9]{8}$/.test(c.orderNo)&&Number.isInteger(c.size)&&c.size>0&&c.size<=MAX,'INTAKE_CONTEXT_INVALID');
 const fetcher=opt.fetch||fetch,signal=opt.signal,mem=opt.resume||new Map(),key=c.sessionId+':'+c.epoch;
 const hash=opt.hash||await hashFile(file);
 const assertReceipt=r=>{need(same(r,c)&&r.uploadState==='verified'&&r.sha256===hash&&/^[a-f0-9]{32}$/.test(r.md5||''),'CLOUD_RECEIPT_UNVERIFIED');mem.delete(key);return r};
 if(!opt.grant){const current=await api('status',{...c,sha256:hash});if(current?.uploadState==='verified')return assertReceipt(current);}
 const grant=opt.grant||await api('reserve',{...c,sha256:hash});
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
 if(opt.deferCommit)return {pendingVerification:true,sessionId:c.sessionId};
 return assertReceipt(await api('commit',{...c,sha256:hash}));
}
async function hashFile(file){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('')}
async function uploadBatch(entries,orderNo,epoch,api,opt={}){
 need(Array.isArray(entries)&&entries.length>=2&&entries.length<=13&&uuid(epoch)&&/^MR20[0-9]{8}$/.test(orderNo),'BATCH_CONTEXT_INVALID');
 const ids=entries.map(x=>x.sessionId);need(new Set(ids).size===ids.length&&ids.every(uuid)&&entries.every(x=>x.file?.size>0&&x.file.size<=MAX),'BATCH_FILE_INVALID');
 const items=[]; // Hash sequentially: avoid holding multiple full-size videos in memory.
 for(const e of entries)items.push({sessionId:e.sessionId,size:e.file.size,sha256:await hashFile(e.file)});
 const envelope=items=>({orderNo,epoch,items});
 function matches(r,x){return same(r,{...x,orderNo,epoch})&&r.sha256===x.sha256}
 function receipt(r,x){need(matches(r,x)&&r.ok===true&&r.uploadState==='verified'&&/^[a-f0-9]{32}$/.test(r.md5||''),'BATCH_RECEIPT_UNVERIFIED');opt.resume?.delete(x.sessionId+':'+epoch);return r}
 function results(r,wanted){need(r?.ok===true&&Array.isArray(r.items)&&r.items.length===wanted.length&&r.items.every((v,i)=>v?.sessionId===wanted[i].sessionId),'BATCH_RESPONSE_MISMATCH');return r.items}
 const grants=results(await api('reserveBatchV2',envelope(items)),items),out=new Array(entries.length),pending=[];
 let cursor=0;const order=entries.map((_,i)=>i).sort((a,b)=>items[b].size-items[a].size||a-b);
 async function lane(){while(cursor<order.length){const i=order[cursor++],e=entries[i],x=items[i],g=grants[i];try{
   if(g.ok!==true){const err=Error(g.error||'BATCH_RESERVE_UNCONFIRMED');err.code=g.error;throw err}
   need(matches(g,x),'BATCH_GRANT_IDENTITY');
   if(g.uploadState==='verified'){out[i]={ok:true,result:receipt(g,x)};continue}
   const r=await upload(e.file,{sessionId:x.sessionId,orderNo,epoch},api,{...opt,hash:x.sha256,grant:g,deferCommit:true,progress:(n,t)=>opt.progress?.(i,n,t)});
   if(r.pendingVerification===true)pending.push(i);else out[i]={ok:true,result:receipt(r,x)};
 }catch(error){out[i]={ok:false,error}}}}
 await Promise.all(Array.from({length:Math.min(3,entries.length)},lane));
 pending.sort((a,b)=>a-b);
 if(pending.length){
  const selected=pending.map(i=>items[i]);
  try{const verified=results(await api('commitBatchV2',envelope(selected)),selected);
   pending.forEach((i,k)=>{try{out[i]={ok:true,result:receipt(verified[k],items[i])}}catch(error){out[i]={ok:false,error}}});
  }catch(error){pending.forEach(i=>{out[i]={ok:false,error}})}
 }
 return out;
}
root.repairFastIntakeV1=Object.freeze({upload,uploadBatch,version:'batch-v2-20261127'});
})(globalThis);