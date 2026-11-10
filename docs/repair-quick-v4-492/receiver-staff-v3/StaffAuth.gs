/**
 * StaffAuth.gs — company employee access gate for repair media receiver v3.0
 * STAGING ONLY. Apps Script deployment executes as fac68193807@gmail.com.
 * Code is separate from main repair webhook. No external relay or API service.
 * Private helper functions (ending "_") cannot be called from google.script.run.
 */
const REPAIR_STAFF_AUTH = Object.freeze({
  STAFF_PREFIX:'repair_staff_v3_',
  SESSION_PREFIX:'repair_session_v3_',
  FAIL_PREFIX:'repair_login_fail_v3_',
  TTL_SECONDS:4*60*60,
  MAX_ATTEMPTS:6,
  LOCK_SECONDS:15*60
});

function drivePilotDigest_(value){
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    String(value),Utilities.Charset.UTF_8)
    .map(b=>(b&255).toString(16).padStart(2,'0')).join('');
}
function drivePilotStaffId_(raw){
  const id=String(raw||'').trim();
  if(id.length<2||id.length>40||/[\\/\x00-\x1f\x7f]/.test(id))
    throw new Error('員工識別碼格式不正確');
  return id;
}
function drivePilotEffectiveOwner_(){
  const email=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
  if(email!==REPAIR_DRIVE_PILOT.OWNER_EMAIL)
    throw new Error('執行身分不是廠務室帳號，停止作業');
}
function drivePilotStaffKey_(id){
  return REPAIR_STAFF_AUTH.STAFF_PREFIX+drivePilotDigest_(id);
}
function drivePilotCredential_(id){
  const raw=PropertiesService.getScriptProperties().getProperty(drivePilotStaffKey_(id));
  if(!raw)return null;
  try{return JSON.parse(raw);}catch(_){return null;}
}
function drivePilotAuthorize_(sessionToken){
  drivePilotEffectiveOwner_();
  const token=String(sessionToken||'');
  if(!/^[0-9a-f-]{72}$/i.test(token))throw new Error('員工尚未完成上傳授權');
  const key=REPAIR_STAFF_AUTH.SESSION_PREFIX+drivePilotDigest_(token);
  const cached=CacheService.getScriptCache().get(key);
  if(!cached)throw new Error('員工上傳授權過期，請重新登入');
  const session=JSON.parse(cached);
  const saved=drivePilotCredential_(session.staffId);
  if(!saved||saved.disabled===true||saved.version!==session.version)
    throw new Error('員工上傳授權已停用');
  return session.staffId;
}

/** Public entry point: requires employee's individual 20-char random access code. */
function drivePilotLogin(staffId,accessCode){
  drivePilotEffectiveOwner_();
  const id=drivePilotStaffId_(staffId);
  const code=String(accessCode||'').trim();
  const cache=CacheService.getScriptCache();
  const failKey=REPAIR_STAFF_AUTH.FAIL_PREFIX+drivePilotDigest_(id);
  const failed=Number(cache.get(failKey)||0);
  if(failed>=REPAIR_STAFF_AUTH.MAX_ATTEMPTS)
    throw new Error('登入嘗試過多，15 分鐘後再試或聯絡廠務室');
  const record=drivePilotCredential_(id);
  const candidate=record?drivePilotDigest_(record.salt+':'+code):'';
  if(!record||record.disabled===true||!code||candidate!==record.digest){
    cache.put(failKey,String(failed+1),REPAIR_STAFF_AUTH.LOCK_SECONDS);
    throw new Error('員工識別碼或上傳授權碼不正確');
  }
  cache.remove(failKey);
  const token=Utilities.getUuid()+Utilities.getUuid();
  cache.put(REPAIR_STAFF_AUTH.SESSION_PREFIX+drivePilotDigest_(token),
    JSON.stringify({staffId:id,version:record.version}),
    REPAIR_STAFF_AUTH.TTL_SECONDS);
  return {ok:true,staffId:id,sessionToken:token,
    expiresInSeconds:REPAIR_STAFF_AUTH.TTL_SECONDS};
}

/**
 * Administrator-only provisioning:
 * 1. Script Properties -> REPAIR_STAFF_IDS_JSON = ["H001","T008",...]
 * 2. Run drivePilotAdminProvision_ manually in Apps Script editor as owner.
 * 3. Copy the one-time result from execution log, distribute privately, delete log.
 * This method ends "_" so it is NOT callable by the public browser.
 */
function drivePilotAdminProvision_(){
  drivePilotEffectiveOwner_();
  const props=PropertiesService.getScriptProperties();
  const ids=JSON.parse(props.getProperty('REPAIR_STAFF_IDS_JSON')||'[]');
  if(!Array.isArray(ids)||ids.length===0||ids.length>500)
    throw new Error('請先填寫 REPAIR_STAFF_IDS_JSON（最多 500 個員工識別碼）');
  const created=[];
  ids.forEach(raw=>{
    const id=drivePilotStaffId_(raw);
    if(drivePilotCredential_(id))return;
    const plain=Utilities.getUuid().replace(/-/g,'').slice(0,20);
    const salt=Utilities.getUuid();
    props.setProperty(drivePilotStaffKey_(id),JSON.stringify({
      salt,digest:drivePilotDigest_(salt+':'+plain),
      version:Utilities.getUuid(),disabled:false
    }));
    created.push({staffId:id,accessCode:plain});
  });
  Logger.log(JSON.stringify(created));
  return created.length;
}
/** Owner-only reset/revoke code. Set REPAIR_STAFF_RESET_ID then manually run. */
function drivePilotAdminResetOne_(){
  drivePilotEffectiveOwner_();
  const props=PropertiesService.getScriptProperties();
  const id=drivePilotStaffId_(props.getProperty('REPAIR_STAFF_RESET_ID'));
  const plain=Utilities.getUuid().replace(/-/g,'').slice(0,20);
  const salt=Utilities.getUuid();
  props.setProperty(drivePilotStaffKey_(id),JSON.stringify({
    salt,digest:drivePilotDigest_(salt+':'+plain),
    version:Utilities.getUuid(),disabled:false
  }));
  props.deleteProperty('REPAIR_STAFF_RESET_ID');
  Logger.log(JSON.stringify({staffId:id,accessCode:plain}));
  return true;
}
