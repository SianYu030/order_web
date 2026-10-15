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
  async function read(orderNo){
    const r=await jsonp_("timerState",{orderNo},20000);
    if(!r||!r.ok||r.orderNo!==orderNo||
       !String(r.timerVersion||"").startsWith("V10-timer-")){
      throw new Error("GS V10 尚未部署／版本不符，已禁止修改工單");
    }
    latestState=r;latestStateAt=Date.now();
    return r;
  }
  function present(r){
    const o=repairState.order,s=repairState.store;
    if(!o||!s||o.no!==r.orderNo)return;
    s.v10Ready=true;s.status=r.status;
    repairState.status=r.status;o.status=r.status;
    o.start=r.startDisplay||"";o.end=r.completedDisplay||"";o.work=r.workDisplay||"";
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
    byId("repairEnd").textContent=r.completedDisplay||
      (s.end?formatHM(s.end):"--:--");
    saveLiveOrdersCache_();buildRepairStatus();updateRepairControls_();
    if(r.status==="已完成")byId("completeRepairBtn").disabled=true;
    renderWork();renderTrackingOverview();
  }
  async function refresh(id){const r=await read(id);present(r);return r;}
  // Individual GS login is required; no shared timer key in browser.
  async function op(event,detail="",nextDate="",extra={}){
    if(busy)throw Error("上一個操作尚未完成");
    const order=repairState.order;
    if(!order||!order._live||!currentRepairUser)throw Error("請先登入並選擇正式工單");
    busy=true;
    let confirmed=false;
    const id=order.no;
    const ctrls=["repairStartBtn","repairEndBtn","completeRepairBtn"];
    ctrls.forEach(x=>byId(x).disabled=true);
    byId("repairStatusHint").textContent="⏳ 正在確認本次維修操作，請勿重複點擊…";
    try{
      const before=latestState && latestState.orderNo===id &&
        Date.now()-latestStateAt<8000 ? latestState : await refresh(id);
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
      try{
        await fetch(SYNC_API_URL,{method:"POST",mode:"no-cors",
          headers:{"Content-Type":"text/plain;charset=utf-8"},
          body:JSON.stringify({action:"timerAction",orderNo:id,timerEvent:event,
            operationId:pending.operationId,expectedLastOperationId:pending.expectedLastOperationId,
            technician:currentRepairUser,sessionToken,detail,nextDate,...extra})});
      }catch(e){/* 可能已送達，必須回讀後才能決定成敗 */}
      for(let i=0;i<15;i++){
        await wait(400+Math.min(i*200,1000));
        let state;
        try{state=await read(id);}catch(e){continue;}
        if(state.lastOperationId===pending.operationId){
          present(state);sessionStorage.removeItem(pendingKey);
          confirmed=true;
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
        try{if(repairState.order&&repairState.order.no===id)await refresh(id);}
        catch(e){
          ctrls.forEach(x=>byId(x).disabled=true);
          byId("repairStatusHint").textContent="⚠️ V10 連線未確認："+e.message;
        }
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
    const minutes=Math.floor((Math.max(0,s.workMs||0)+running)/60000);
    byId("repairWork").textContent=Math.floor(minutes/60)+"時"+String(minutes%60).padStart(2,"0")+"分";
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
    const s=repairState.store;if(!s||s.status==="已完成")return;
    if(!confirm("確定設備已修復並結案？只計算實際維修時間。"))return;
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
          });
          clearRepairPhotoSelection_();
          byId("saveRepairMsg").textContent="✅ 結案與工時已驗證｜📷 維修照片已排入 NAS 歸檔";
        }catch(photoError){
          byId("saveRepairMsg").textContent="⚠️ 工單已結案，照片未成功上傳："+photoError.message;
          alert("工單已成功結案，但維修照片需要重新上傳："+photoError.message);
        }
      }
    }catch(e){alert("結案未完成："+e.message);}
  };
  /* 原 V9 刪除端點沒有正式身分驗證，審查分支先關閉刪除 UI。 */
  deleteLiveOrder_=async function(){alert("V10 安全審查期間暫停刪除工單");};
  window.__v10RepairTimerReady=true;
})();