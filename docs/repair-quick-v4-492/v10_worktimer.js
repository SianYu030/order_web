/*
V10 工時同步候選前端；僅供 GitHub 審查分支使用。
正式 GS 部署並驗證前，請勿合併至 main。
所有計時以 GS 回讀操作 ID 為準，切勿將伺服器金鑰放入 GitHub。
*/
(function(){
  const byId=id=>document.getElementById(id);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  let busy=false;
  // Last verified GS state is safe for a brief period. GS still checks the
  // expected operation ID, so an intervening update cannot be overwritten.
  let latestState=null, latestStateAt=0;
  async function read(orderNo,timeoutMs=20000){
    const r=await jsonp_("timerState",{orderNo},timeoutMs);
    if(!r||!r.ok||r.orderNo!==orderNo||
       !String(r.timerVersion||"").startsWith("V10-timer-")){
      throw new Error("GS V10 尚未部署／版本不符，已禁止修改工單");
    }
    latestState=r;latestStateAt=Date.now();
    return r;
  }
  function syncStopButton_(){
    const btn=byId("repairEndBtn"),s=repairState.store;
    if(!btn||!s)return;
    btn.textContent=s.status==="已完成"?"✓ 已結案":
      s.activeStart?"⏸ 結束本次計時":
      s.firstStart?"⏸ 已暫停":"⏸ 尚未開始";
  }
  function syncCompleteButton_(){
    const s=repairState.store,btn=byId("completeRepairBtn");
    if(!btn||!s)return;
    // A close operation is available only after a verified V10 read,
    // never while another timer write is in flight.
    btn.disabled=busy||savingRepair_||!s.v10Ready||s.status==="已完成";
  }
  function validateRepairFields_(){
    const type=byId("repairTypeSelect").value;
    const classification=byId("repairClassSelect").value;
    if(!type){
      alert("請先選擇維修類型，再儲存或結案。");
      byId("repairTypeSelect").focus();
      return false;
    }
    if(type==="故障維修"&&!classification){
      alert("維修類型是「故障維修」，請先選擇故障分類。");
      byId("repairClassSelect").focus();
      return false;
    }
    if(!byId("repairContent").value.trim()){
      alert("結案前請填寫維修內容，說明本次實際完成的工作。");
      byId("repairContent").focus();
      return false;
    }
    return true;
  }
  function appendLocalOperation_(event,r){
    const s=repairState.store;
    if(!s||!Array.isArray(s.timeline))return;
    const label={
      start:"開始／恢復維修",pause:"結束本次計時",
      waitParts:"待料",outsource:"外修",observe:"待觀察",close:"維修完成・結案"
    }[event];
    if(!label||s.timeline.some(x=>x.operationId===r.lastOperationId))return;
    const raw=(event==="start"?r.activeStartIso:r.lastStopIso)||"";
    const at=raw?new Date(raw):new Date();
    s.timeline.push({
      operationId:r.lastOperationId,
      at:Number.isNaN(at.getTime())?formatStamp(new Date()):formatStamp(at),
      title:"已確認："+label,
      detail:"本次網頁操作已由後端操作 ID 驗證"
    });
    renderTimeline();
  }
  function present(r){
    const o=repairState.order,s=repairState.store;
    if(!o||!s||o.no!==r.orderNo)return;
    s.v10Ready=true;s.status=r.status;
    repairState.status=r.status;o.status=r.status;
    o.start=r.startDisplay||"";o.end=r.completedDisplay||"";o.work=r.workDisplay||"";
    o.photoEpoch=r.photoEpoch||o.photoEpoch||"";
    s.activeStart=r.activeStartIso?new Date(r.activeStartIso):null;
    s.firstStart=r.firstStartIso?new Date(r.firstStartIso):
      (r.startDisplay?parseOrderTime_(o.time,r.startDisplay):null);
    s.end=r.lastStopIso?new Date(r.lastStopIso):null;
    s.workMs=r.timerEnabled?Math.max(0,Number(r.accumulatedMs)||0):0;
    if(!r.timerEnabled){
      const m=String(r.workDisplay||"").match(/^(\d+)時\s*(\d+)分$/);
      if(m)s.workMs=(Number(m[1])*60+Number(m[2]))*60000;
    }
    s.workMinutes=Math.floor(s.workMs/60000);
    byId("repairStart").textContent=r.startDisplay||"--:--";
    // A running segment has no stop time yet. Do not show a previous pause
    // timestamp beside the active timer, which looks like a delayed update.
    byId("repairEnd").textContent=r.activeStartIso?"--:--":
      (r.completedDisplay||(s.end?formatHM(s.end):"--:--"));
    saveLiveOrdersCache_();buildRepairStatus();updateRepairControls_();
    // updateRepairControls_ only updates the pause button disabled state,
    // not its text. An earlier "stopping..." label must never get stuck.
    if(!busy){
      syncStopButton_();
      syncCompleteButton_();
    }
    renderWork();renderTrackingOverview();
  }
  async function refresh(id){const r=await read(id);present(r);return r;}
  // Individual GS login is required; no shared timer key in browser.
  async function op(event,detail="",nextDate="",extra={}){
    if(busy)throw Error("上一個操作尚未完成");
    const order=repairState.order;
    if(!order||!order._live||!currentRepairUser)throw Error("請先登入並選擇正式工單");
    busy=true;
    const clickedAt=Date.now();
    let confirmed=false,refreshFailed=false;
    const id=order.no;
    const ctrls=["repairStartBtn","repairEndBtn","completeRepairBtn"];
    ctrls.forEach(x=>byId(x).disabled=true);
    // The button itself reacts immediately, without pretending the GS write
    // succeeded. A verified reply remains required before status changes.
    const actionButtonId=event==="start"?"repairStartBtn":
      event==="pause"?"repairEndBtn":null;
    if(actionButtonId){
      byId(actionButtonId).textContent=event==="start"?
        "⏳ 正在開始維修…":"⏳ 正在停止計時…";
    }
    byId("repairStatusHint").textContent="⏳ 已收到點擊，正在同步維修時間…";
    try{
      // Reuse the last confirmed state even after eight seconds. The GS
      // expectedLastOperationId guard rejects concurrent edits, so this
      // avoids a redundant network read on most clicks without bypassing
      // server concurrency validation.
      const before=latestState && latestState.orderNo===id ?
        latestState : await refresh(id);
      if(before.status==="已完成")throw Error("工單已結案");
      const sessionToken=v10AuthToken_();
      const pendingKey="repairV10Pending:"+id+":"+event;
      let pending=null;
      try{pending=JSON.parse(sessionStorage.getItem(pendingKey)||"null");}catch(e){}
      if(!pending||!pending.operationId){
        pending={operationId:(typeof crypto!=="undefined"&&crypto.randomUUID)?crypto.randomUUID():
          "op_"+Date.now()+"_"+Math.floor(Math.random()*1000000),
          expectedLastOperationId:before.lastOperationId||""};
        sessionStorage.setItem(pendingKey,JSON.stringify(pending));
      }
      // Dispatch the write first, then start checking in parallel instead of
      // blocking UI confirmation behind the opaque no-cors POST response.
      // The write is NEVER deemed successful until the GS operation ID matches.
      const writeRequest=fetch(SYNC_API_URL,{method:"POST",mode:"no-cors",
        headers:{"Content-Type":"text/plain;charset=utf-8"},
        body:JSON.stringify({action:"timerAction",orderNo:id,timerEvent:event,
          operationId:pending.operationId,expectedLastOperationId:pending.expectedLastOperationId,
          technician:currentRepairUser,sessionToken,detail,nextDate,...extra})}).catch(()=>null);
      await Promise.race([writeRequest,wait(900)]);
      // Bound a failed synchronization to ~30s, not 15 * 20s per read.
      // Late/uncertain responses keep their pending operation ID for safe retry.
      const deadline=Date.now()+30000;
      for(let i=0;i<12&&Date.now()<deadline;i++){
        if(i>0)await wait(Math.min(600+i*180,1300));
        let state;
        try{state=await read(id,Math.max(1500,Math.min(9000,deadline-Date.now())));}
        catch(e){continue;}
        if(state.lastOperationId===pending.operationId){
          present(state);sessionStorage.removeItem(pendingKey);
          appendLocalOperation_(event,state);
          if(event==="close"){
            // The V10 timerState response does not contain I/J/P/U columns.
            // Preserve the verified close form in the current order cache
            // so reopening this order immediately shows the saved values.
            const current=repairState.store;
            if(current&&repairState.order&&repairState.order.no===id){
              current.type=byId("repairTypeSelect").value;
              current.classification=byId("repairClassSelect").value;
              current.content=byId("repairContent").value.trim();
              current.note=byId("repairNote").value.trim();
              current.technician=currentRepairUser;
              Object.assign(repairState.order,{
                type:current.type,classification:current.classification,
                content:current.content,note:current.note,technician:current.technician
              });
              saveLiveOrdersCache_();
            }
          }
          confirmed=true;
          console.info("[V10 timer]",event,"回讀已確認",Date.now()-clickedAt,"ms");
          return state;
        }
        if(state.lastOperationId&&state.lastOperationId!==pending.expectedLastOperationId){
          throw Error("工單已被其他人更新，請重新整理");
        }
      }
      throw Error("後端尚未回讀確認；請勿重複點擊，先確認工單狀態");
    }finally{
      busy=false;
      // Success is already confirmed by operation ID and fully rendered.
      // Re-reading the same order here caused a needless extra GS round-trip.
      if(!confirmed){
        try{
          if(repairState.order&&repairState.order.no===id){
            const state=await read(id,8000);
            present(state);
          }
        }catch(e){
          refreshFailed=true;
          ctrls.forEach(x=>byId(x).disabled=true);
          byId("repairStatusHint").textContent="⚠️ V10 連線未確認："+e.message;
        }
      }
      // Restore button labels after both verified success and recoverable
      // failure. Keep controls disabled when backend status cannot be read.
      if(!refreshFailed&&repairState.order&&repairState.order.no===id){
        updateRepairControls_();
        syncStopButton_();
        // Unconfirmed timer operations must not enable final closure.
        syncCompleteButton_();
        if(!confirmed)byId("completeRepairBtn").disabled=true;
      }
    }
  }
  const oldOpen=openRepairOrder;
  openRepairOrder=function(o){
    oldOpen(o);
    if(!repairState.store)return;
    repairState.store.v10Ready=false;
    ["repairStartBtn","repairEndBtn","completeRepairBtn"].forEach(x=>byId(x).disabled=true);
    refresh(o.no).catch(e=>{
      if(repairState.order&&repairState.order.no===o.no){
        byId("repairStatusHint").textContent="⚠️ "+e.message;
        ["repairStartBtn","repairEndBtn","completeRepairBtn"].forEach(x=>byId(x).disabled=true);
      }
    });
  };
  function v10ScheduledWorkMs_(start,end){
    const a=new Date(start).getTime(),b=new Date(end).getTime();
    if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return 0;
    const DAY=86400000,HOUR=3600000,TPE=8*HOUR;
    let sum=0,midnight=Math.floor((a+TPE)/DAY)*DAY-TPE;
    for(;midnight<b;midnight+=DAY){
      for(const [from,to] of [[8,12],[13,17]]){
        sum+=Math.max(0,Math.min(b,midnight+to*HOUR)-Math.max(a,midnight+from*HOUR));
      }
    }
    return sum;
  }
  renderWork=function(){
    const s=repairState.store;if(!s)return;
    const running=s.activeStart?v10ScheduledWorkMs_(s.activeStart,new Date()):0;
    // Show accurate elapsed seconds while preserving the backend's
    // accumulated milliseconds and its whole-minute report column.
    const seconds=Math.floor((Math.max(0,s.workMs||0)+running)/1000);
    const hours=Math.floor(seconds/3600);
    const minutes=Math.floor(seconds%3600/60);
    const secs=String(seconds%60).padStart(2,"0");
    byId("repairWork").textContent=hours+"時"+String(minutes).padStart(2,"0")+"分"+secs+"秒";
    const note=byId("v10TimerNotice");
    if(note){
      note.textContent=s.activeStart
        ?"⏱ 計時中：本段從 "+formatHM(s.activeStart)+" 開始，暫停期間不計入工時。"
        :s.firstStart
          ?"⏸ 已暫停：上一次停止到下次恢復之間的時間不計入工時。"
          :"尚未開始計時，按「開始維修」後才會累積工時。";
      note.classList.remove("hidden");
    }
  };
  applyRepairStatus=async function(status,detail){
    const event={"待料":"waitParts","外修":"outsource","待觀察":"observe"}[status];
    if(!event)return alert("請使用開始／暫停按鈕");
    try{await op(event,detail||"",repairState.store?.followup?.c||"");}
    catch(e){alert("狀態未同步："+e.message);}
  };
  const oldBuild=buildRepairStatus;
  buildRepairStatus=function(){
    oldBuild();
    const s=repairState.store;if(!s||s.status!=="外修")return;
    const grid=byId("repairStatusGrid"),title=byId("repairPauseTitle");
    title.classList.remove("hidden");
    title.textContent="外修廠商已修復，可直接轉待觀察（廠商時間不計工時）";
    grid.innerHTML="";grid.classList.remove("hidden");
    grid.appendChild(button("🔎 外修完成 → 待觀察","repair-status-btn",async()=>{
      try{await op("observe","外修廠商修復完成，進入待觀察");}
      catch(e){alert(e.message);}
    }));
  };
  byId("repairStartBtn").onclick=async()=>{try{await op("start");}catch(e){alert(e.message);}};
  byId("repairEndBtn").onclick=async()=>{try{await op("pause");}catch(e){alert(e.message);}};
  byId("completeRepairBtn").onclick=async()=>{
    const s=repairState.store;if(!s||s.status==="已完成"||busy||savingRepair_||!s.v10Ready)return;
    if(!validateRepairFields_())return;
    if(!confirm("確定設備已修復並結案？將提交目前的維修類型、分類、內容與備註，並停止計時。"))return;
    try{
      await op("close","","",{repairType:byId("repairTypeSelect").value,
        classification:byId("repairClassSelect").value,
        content:byId("repairContent").value.trim(),note:byId("repairNote").value.trim()});
      byId("saveRepairMsg").classList.remove("hidden");
      byId("saveRepairMsg").textContent="✅ 結案與工時已回讀驗證";
      // Keep the original V4.4.52 NAS photo pipeline, but only AFTER verified close.
      // If photo upload fails, the completed order is not silently marked as unclosed.
      const photos=[...repairPhotoFiles];
      if(photos.length){
        byId("saveRepairMsg").textContent="⏳ 結案成功，維修照片上傳 0/"+photos.length+"…";
        try{
          await uploadPhotoFiles_(photos,repairState.order.no,"維修照片",(i,total)=>{
            byId("saveRepairMsg").textContent="⏳ 結案成功，維修照片上傳 "+i+"/"+total+"…";
          },repairState.order.photoEpoch||"");
          clearRepairPhotoSelection_();
          byId("saveRepairMsg").textContent="✅ 結案與工時已驗證｜📷 維修照片已排入 NAS 歸檔";
        }catch(photoError){
          byId("saveRepairMsg").textContent="⚠️ 工單已結案，照片未成功上傳："+photoError.message;
          alert("工單已成功結案，但維修照片需要重新上傳："+photoError.message);
        }
      }
    }catch(e){alert("結案未完成："+e.message);}
  };
  // Guard the existing V4 save handler without replacing its verified
  // V10 RBAC synchronization or NAS photo-upload pipeline.
  const originalSaveRepair_=byId("saveRepairBtn").onclick;
  let savingRepair_=false;
  byId("saveRepairBtn").onclick=async function(){
    if(savingRepair_||busy)return;
    if(!repairState.store||!repairState.store.v10Ready){
      alert("請先確認工單同步完成後再儲存。");
      return;
    }
    // Saving progress is allowed with incomplete classifications;
    // full validation is enforced only when the order is closed.
    const btn=byId("saveRepairBtn"),previous=btn.textContent;
    savingRepair_=true;btn.disabled=true;btn.textContent="⏳ 正在儲存維修資料…";
    syncCompleteButton_();
    try{await originalSaveRepair_.call(btn);}
    finally{
      savingRepair_=false;
      syncCompleteButton_();
      btn.disabled=false;
      btn.textContent=previous;
    }
  };
  /* 原 V9 刪除端點沒有正式身分驗證，審查分支先關閉刪除 UI。 */
  deleteLiveOrder_=async function(){alert("V10 安全審查期間暫停刪除工單");};
  window.__v10RepairTimerReady=true;
})();