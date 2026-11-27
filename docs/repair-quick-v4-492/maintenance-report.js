/* 維修月報 1.0：使用既有 V9 正式工單讀取結果；不另開寫入 API、不新增假資料 */
(function(){
"use strict";
const SPECIAL="現場人員臨時需求以及特殊作業";
const DONE=new Set(["已完成","結案","已結案"]);
const CLOSED=new Set(["已刪除","已取消","作廢"]);
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today=()=>new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Taipei"});
const monthNow=()=>today().slice(0,7);
const monthRx=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const colors=["#146bd2","#20a5df","#39a574","#f5a623","#9e72dd","#8d9aa9"];
const mrSvgIcon=(kind)=>{
 // Solid ascending bars, not a thin-stroke or text-glyph lookalike.
 if(kind==="bars")return '<svg class="mr-svg-icon mr-bars-solid" viewBox="0 0 24 24" fill="currentColor" stroke="none" focusable="false" aria-hidden="true"><rect x="1" y="13" width="6" height="9" rx="1.2"/><rect x="9" y="8" width="6" height="14" rx="1.2"/><rect x="17" y="2" width="6" height="20" rx="1.2"/></svg>';
 const shapes={
  wrench:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.9 7.9l-7.4 7.4a2.1 2.1 0 0 1-3-3l7.4-7.4a6 6 0 0 1 7.9-7.9l-3.1 3.1z"/>',
  bars:'<path d="M4 20V13M10 20V8M16 20V4M22 20H2"/>',
  pie:'<path d="M12 3v9h9"/><path d="M20.5 15a9 9 0 1 1-11.5-11.5"/>',
  trophy:'<path d="M8 3h8v7a4 4 0 0 1-8 0V3Z"/><path d="M8 5H5v3a3 3 0 0 0 3 3m8-6h3v3a3 3 0 0 1-3 3M12 14v4m-4 3h8m-8-3h8"/>',
  trend:'<path d="m3 17 6-6 4 4 8-9M15 6h6v6"/>'
 };
 return '<svg class="mr-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">'+(shapes[kind]||shapes.bars)+'</svg>';
};
const state={month:monthNow(),dept:"全部",machine:"",machinePeriod:"all",machinePage:0,orders:[],syncedAt:0,error:"",loaded:false,expanded:{done:false,open:false,special:false},page:{done:0,open:0,special:0},busy:false};
let root=null,initialised=false,loader=null;
function recordDate(order){
 const time=String(order.time||"");
 const m=time.match(/(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})/);
 if(m){const iso=m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");const d=new Date(iso+"T12:00:00Z");return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:"";}
 const no=String(order.no||"");
 if(/^MR20\d{8}$/.test(no)){
  const iso=no.slice(2,6)+"-"+no.slice(6,8)+"-"+no.slice(8,10);
  const d=new Date(iso+"T12:00:00Z");return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:"";
 }
 return "";
}
function orderMonth(o){return o._history&&monthRx.test(o.historyMonth||"")?o.historyMonth:recordDate(o).slice(0,7)}
function isDone(o){return DONE.has(String(o.status||"").trim())}
function isSpecial(o){return String(o.machine||"").trim()===SPECIAL}
function sameDept(o){return state.dept==="全部"||String(o.dept||"").trim()===state.dept}
function machineName(raw,dept){
 let n=String(raw||"").normalize("NFKC").trim().replace(/\s+/g,"");const d=String(dept||"").trim();
 if(d&&n.toUpperCase().startsWith(d.toUpperCase()))n=n.slice(d.length).replace(/^廠/,"");
 if(!n)return "";let m;
 if((m=n.match(/^(?:裁板機(330|380)|(330|380)裁板機)$/)))return (m[1]||m[2])+"裁板機";
 if((m=n.match(/^Nesting(10|20)號(?:機|X1&X2)?$/i)))return "Nesting"+m[1]+"號機";
 if((m=n.match(/^(?:直線封邊機\(?([1-4])號(?:機)?\)?|封邊機([1-4])號機|([1-4])號(?:直邊|直線)?封邊機|南興直邊封邊機\(([1-4])號機\))$/))&&["E4","W8"].includes(d))return "直線封邊機"+(m[1]||m[2]||m[3]||m[4])+"號";
 if(d==="E3"&&/^(?:南興)?(?:直邊|直線)封邊機$/.test(n))return "直線封邊機";
 if((m=n.match(/^(?:六面鑽工作站|工作站|工作站單機|六面工作站)\(?([1-4])號(?:機)?\)?$/))){if(d==="E4")return "工作站單機"+m[1]+"號";if(d==="W8")return "六面工作站"+m[1]+"號";}
 if(/^(?:ABD側孔機|ABD鑽孔機)$/.test(n)&&["E4","W8"].includes(d))return "ABD鑽孔機";
 return n;
}
function deviceMasterMatch(dept,name){
 const d=String(dept||"").trim(),n=machineName(name,d);
 if(typeof MAINTENANCE_DEVICE_MASTER==="undefined"||!n)return null;
 const matches=MAINTENANCE_DEVICE_MASTER.filter(x=>x.dept===d&&[x.name,...(x.aliases||[])].some(v=>machineName(v,d)===n));
 const verified=matches.filter(x=>x.id);
 return verified.length===1?verified[0]:null;
}
function machineKey(dept,name){const d=String(dept||"").trim(),record=deviceMasterMatch(d,name);return record?"device:"+record.id:JSON.stringify([d,machineName(name,d)])}
function sameMachine(o){return !state.machine||machineKey(o.dept,o.machine)===state.machine}
function machineOptions(){
 const map=new Map();
 function add(dept,name,count,current=false){const d=String(dept||"").trim(),n=machineName(name,d);if(!n||n===SPECIAL||!sameDept({dept:d}))return;
 const key=machineKey(d,name),item=map.get(key)||{key,dept:d,name:n,count:0,current:false};item.count+=count;
 if(current){item.current=true;item.name=String(name||"").trim();item.deviceId=deviceMasterMatch(d,name)?.id||"";}
 map.set(key,item);}
 if(typeof DATA!=="undefined")for(const [dept,entry] of Object.entries(DATA))for(const group of Object.values(entry.areas||{}))for(const name of group)add(dept,name,0,true);
 for(const o of state.orders)if(o&&!isSpecial(o)&&!CLOSED.has(String(o.status||"").trim()))add(o.dept,o.machine,1);
 return [...map.values()].sort((a,b)=>a.dept.localeCompare(b.dept,"zh-Hant")||a.name.localeCompare(b.name,"zh-Hant",{numeric:true}));
}
function repairParts(o){const result=[],seen=new Set();
 for(const [label,raw] of [["維修內容",o.content],["備註",o.note]])for(const line of String(raw||"").split(/[\n\r；;。]+/).map(s=>s.trim()).filter(Boolean)){
 if(/更換|換新|換上|換掉|換下|換裝|替換|拆換|換料|備品|零件|料號|請購|待料|耗材/.test(line)&&!seen.has(line)){seen.add(line);result.push(label+"："+line);}}
 return result;
}
function machineHistory(){return state.machine?state.orders.filter(o=>!isSpecial(o)&&!CLOSED.has(String(o.status||"").trim())&&sameDept(o)&&sameMachine(o)&&(state.machinePeriod==="all"||orderMonth(o)===state.month)).sort((a,b)=>orderMonth(b).localeCompare(orderMonth(a))||recordDate(b).localeCompare(recordDate(a))||String(b.no).localeCompare(String(a.no))):[]}
function workHours(o){
 if(o._history)return typeof o.historyHours==="number"&&Number.isFinite(o.historyHours)&&o.historyHours>=0?o.historyHours:0;
 const s=String(o.work||"").trim();
 if(!s)return 0;
 let m=s.match(/(\d+)\s*時\s*(\d+)?\s*分?/);
 if(m)return Number(m[1])+Number(m[2]||0)/60;
 m=s.match(/^(\d+)\s*[:：]\s*(\d+)$/);
 if(m)return Number(m[1])+Number(m[2])/60;
 m=s.match(/(\d+(?:\.\d+)?)\s*(?:小時|hr|h)\b/i);
 if(m)return Number(m[1]);
 return 0;
}
function overdue(o){
 const d=recordDate(o);if(!d)return "—";
 const t=new Date(today()+"T12:00:00Z").getTime()-new Date(d+"T12:00:00Z").getTime();
 return Math.max(0,Math.floor(t/86400000))+" 天";
}
function dateShort(s){return s?s.slice(5).replace("-","/"):"—"}
function getScoped(){
 const active=state.orders.filter(o=>!CLOSED.has(String(o.status||"").trim())&&sameDept(o)&&sameMachine(o));
 const regular=active.filter(o=>!isSpecial(o));
 const monthly=regular.filter(o=>orderMonth(o)===state.month);
 const special=active.filter(o=>isSpecial(o)&&orderMonth(o)===state.month);
 // Open orders are not limited by selected month, including prior years.
 const open=regular.filter(o=>!o._history&&!isDone(o)).sort((a,b)=>recordDate(a).localeCompare(recordDate(b))||String(a.no).localeCompare(String(b.no)));
 // Without a full dated completion timestamp, the completion group is by
 // report/ticket month, not an invented actual completion month.
 const done=monthly.filter(isDone).sort((a,b)=>recordDate(b).localeCompare(recordDate(a))||String(b.no).localeCompare(String(a.no)));
 return {regular,monthly,special,open,done};
}
function kpi(label,value,unit,cls,foot){
 return '<div class="mr-kpi '+cls+'"><span>'+esc(label)+'</span><strong>'+esc(value)+(unit?'<small> '+esc(unit)+'</small>':'')+'</strong>'+(foot?'<small>'+esc(foot)+'</small>':'')+'</div>';
}
function status(o){
 const s=String(o.status||"待處理").trim();
 const c=isDone(o)?"completed":/維修中|處理中|外修中/.test(s)?"active":/暫排|外包|待料|暫停/.test(s)?"paused":"pending";
 return '<span class="mr-flag '+c+'">'+esc(s)+'</span>';
}
function baseRows(items,type){
 return items.map((o,i)=>{
  const title=esc((type==="done"?o.content||o.issue:o.issue||o.content)||"未填寫");
  const date=dateShort(recordDate(o));
  if(type==="special"){
   return '<tr><td class="mr-cell">'+esc(o.no)+'</td><td>'+date+'</td><td>'+title+'</td><td>'+esc(o.person||"—")+'</td><td>'+esc(o.dept||"—")+'</td><td>'+status(o)+'</td></tr>';
  }
  if(type==="open"){
   return '<tr><td class="mr-cell">'+esc(o.no)+'</td><td>'+date+'</td><td>'+esc(o.dept||"—")+'</td><td>'+esc(o.machine||"—")+'</td><td>'+status(o)+'</td><td>'+esc(overdue(o))+'</td></tr>';
  }
  return '<tr><td class="mr-cell">'+esc(o.no)+'</td><td>'+date+'</td><td>'+esc(o.dept||"—")+'</td><td>'+esc(o.machine||"—")+'</td><td>'+title+'</td><td>'+esc(o.technician||"—")+'</td><td>'+(o._history&&o.historyHours==null?'未登錄':workHours(o).toFixed(1))+'</td></tr>';
 }).join("");
}
function renderList(type,items,title){
 const cols=type==="special"?["MR 編號","報修日期","工作內容","申請人","廠區","處理狀態"]:
  type==="open"?["MR 編號","報修日期","廠區","機台設備","狀態","累計天數"]:
  ["MR 編號","報修日期","廠區","機台設備","維修內容","處理人","登錄工時"];
 const exp=state.expanded[type],total=items.length,perPage=20;
 const pages=Math.max(1,Math.ceil(total/perPage));state.page[type]=Math.min(state.page[type],pages-1);
 const start=exp?state.page[type]*perPage:0;
 const showing=items.slice(start,start+(exp?perPage:5));
 const note=type==="open"?"<div class='mr-data-note'>跨月份、跨年度未結案件全數納入；上方月份不影響此清單。</div>":
   type==="done"?"<div class='mr-data-note'>依工單報修月份歸類；原始資料沒有完整結案日期時，不推定完成日期。</div>":"";
 const controls=total>5?'<button type="button" data-action="toggle" data-kind="'+type+'">'+(exp?"收合清單":"查看完整清單（共 "+total+" 筆）")+'</button>':"";
 const pager=exp&&pages>1?'<div class="mr-pager"><button type="button" data-action="prev" data-kind="'+type+'" '+(state.page[type]===0?"disabled":"")+'>上一頁</button><span>第 '+(state.page[type]+1)+'／'+pages+' 頁，共 '+total+' 筆</span><button type="button" data-action="next" data-kind="'+type+'" '+(state.page[type]+1===pages?"disabled":"")+'>下一頁</button></div>':"";
 return '<article class="mr-list '+type+'"><div class="mr-listhead"><h3>'+title+'</h3>'+controls+'</div>'+
   (items.length?'<div class="mr-tablescroll"><table><thead><tr>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+baseRows(showing,type)+'</tbody></table></div>':'<div class="mr-empty">目前沒有符合條件的紀錄。</div>')+pager+note+'</article>';
}
function renderHistoryPending(items){
 return '<article class="mr-list open"><div class="mr-listhead"><h3>歷史狀態待核對（'+items.length+' 件）</h3></div><div class="mr-tablescroll"><table><thead><tr>'+["工單編號","報修日期","廠區","設備","原始狀態"].map(x=>'<th>'+esc(x)+'</th>').join("")+'</tr></thead><tbody>'+items.map(o=>'<tr><td>'+esc(o.no)+'</td><td>'+esc(dateShort(recordDate(o)))+'</td><td>'+esc(o.dept||"未明示")+'</td><td>'+esc(o.machine||"未明示")+'</td><td>'+esc(o.status||"未登錄")+'</td></tr>').join("")+'</tbody></table></div><div class="mr-data-note">歷史封存狀態僅供查詢，不計入目前待修清單。</div></article>';
}
function countsBy(items,key){const x=new Map();items.forEach(o=>{const k=String(o[key]||"未分類").trim()||"未分類";x.set(k,(x.get(k)||0)+1)});return [...x].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"zh-Hant"))}
function panelBars(items){
 const map=new Map();["E3","E4","E5","W8","W8整修&組立","空壓機室"].forEach(d=>map.set(d,0));
 items.forEach(o=>{const d=String(o.dept||"").trim()||"未明示";map.set(d,(map.get(d)||0)+1)});
 const values=[...map].filter(([dept,n])=>n>0||["E3","E4","E5","W8"].includes(dept));
 const max=Math.max(1,...values.map(([,n])=>n));
 return values.map(([k,n])=>'<div class="mr-pair"><b>'+esc(k)+'</b><strong>'+n+' 件</strong></div><div class="mr-meter"><i style="width:'+(100*n/max).toFixed(1)+'%"></i></div>').join("")||'<div class="mr-empty">本月沒有設備報修。</div>';
}
function panelDonut(items){
 const all=countsBy(items,"type");
 const data=all.length>5?[...all.slice(0,5),["其他",all.slice(5).reduce((n,x)=>n+x[1],0)]]:all;
 const sum=items.length;
 if(!sum)return '<div class="mr-empty">本月沒有維修類型資料。</div>';
 let angle=0;
 const stops=data.map(([,n],i)=>{const start=angle;angle+=n/sum*100;return colors[i]+' '+start.toFixed(2)+'% '+angle.toFixed(2)+'%'}).join(",");
 const legend=data.map(([n,c],i)=>'<div><i style="background:'+colors[i]+'"></i>'+esc(n)+'　'+(c/sum*100).toFixed(1)+'%</div>').join("");
 return '<div class="mr-donut-row"><div class="mr-donut" style="background:conic-gradient('+stops+')"><div class="mr-donut-inner">'+sum+' 件</div></div><div class="mr-legend">'+legend+'</div></div>';
}
function panelTop(items){
 const data=countsBy(items,"machine").slice(0,5);
 return data.length?data.map(([name,count],i)=>'<div class="mr-pair"><span><b>'+String(i+1)+'.</b> '+esc(name)+'</span><strong>'+count+' 件</strong></div>').join(""):'<div class="mr-empty">本月沒有機台排名資料。</div>';
}
function monthAdd(key,delta){const [y,m]=key.split("-").map(Number);const d=new Date(Date.UTC(y,m-1+delta,1));return d.toISOString().slice(0,7)}
function panelTrend(items){
 const months=Array.from({length:6},(_,i)=>monthAdd(state.month,i-5));
 const value=months.map(k=>items.filter(o=>orderMonth(o)===k).length);
 const max=Math.max(1,...value),w=320,h=118,left=15,right=305,top=14,bot=100;
 const pts=value.map((n,i)=>[left+(right-left)*i/5,bot-(bot-top)*n/max]);
 const grid=[0,.5,1].map(fr=>'<line x1="'+left+'" y1="'+(bot-(bot-top)*fr)+'" x2="'+right+'" y2="'+(bot-(bot-top)*fr)+'" stroke="#e3edf8"/>').join("");
 return '<svg class="mr-chart" viewBox="0 0 320 118" role="img" aria-label="最近六個月報修件數趨勢">'+grid+
  '<polyline fill="none" stroke="#1b77d3" stroke-width="3" stroke-linejoin="round" points="'+pts.map(p=>p.join(",")).join(" ")+'"/>'+
  pts.map((p,i)=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="4" fill="#1475d8"/><text x="'+p[0]+'" y="'+(p[1]-9)+'" text-anchor="middle" font-size="12" fill="#1b4e89">'+value[i]+'</text>').join("")+'</svg>'+
  '<div class="mr-chart-labels">'+months.map(m=>'<span>'+Number(m.slice(5))+'月</span>').join("")+'</div>';
}
function renderMachineHistory(){
 const select=$("mrMachine"),period=$("mrMachinePeriod"),panel=$("mrMachineHistory"),choices=machineOptions();
 if(state.machine&&!choices.some(x=>x.key===state.machine)){state.machine="";state.machinePage=0;}
 const option=x=>'<option value="'+esc(x.key)+'">'+esc((state.dept==="全部"?(x.dept||"未明示")+"｜":"")+(x.deviceId?x.deviceId+"｜":"")+x.name+"（"+x.count+"筆）")+'</option>';
 const current=choices.filter(x=>x.current),archived=choices.filter(x=>!x.current);
 const options='<option value="">全部機台</option>'+(current.length?'<optgroup label="目前報修機台名單">'+current.map(option).join("")+'</optgroup>':'')+(archived.length?'<optgroup label="其他歷史設備／舊名稱">'+archived.map(option).join("")+'</optgroup>':'');
 if(select.innerHTML!==options)select.innerHTML=options;select.value=state.machine;period.value=state.machinePeriod;period.disabled=!state.machine;
 if(!state.machine){panel.hidden=true;panel.innerHTML="";return;}panel.hidden=false;
 const selected=choices.find(x=>x.key===state.machine),items=machineHistory(),done=items.filter(isDone).length,parts=items.filter(o=>repairParts(o).length).length,perPage=20,pages=Math.max(1,Math.ceil(items.length/perPage));
 state.machinePage=Math.min(state.machinePage,pages-1);
 const rows=items.slice(state.machinePage*perPage,(state.machinePage+1)*perPage).map(o=>{
  const related=repairParts(o),rawNote=String(o.note||"").trim(),hours=o._history?(o.historyHours==null?"未登錄":workHours(o).toFixed(2)+" 小時"):(String(o.work||"").trim()?workHours(o).toFixed(2)+" 小時":"未登錄");
  return '<tr><td class="mr-cell">'+esc(o.no)+'<small>'+esc(recordDate(o)||orderMonth(o))+'</small><small>'+esc(o.machine||"未明示")+'</small></td><td>'+status(o)+'<small>'+esc(o.type||"未分類")+'</small><small>'+esc(o.classification||"")+'</small></td><td class="mr-wrap">'+esc(o.issue||"未登錄")+'</td><td class="mr-wrap">'+esc(o.content||"未登錄")+'</td><td class="mr-wrap">'+(related.length?related.map(x=>'<div>'+esc(x)+'</div>').join(""):'<span class="mr-muted">未見明確零件文字</span>')+(rawNote?'<small class="mr-wrap">原始備註：'+esc(rawNote)+'</small>':'')+'</td><td>'+esc(o.technician||"未登錄")+'<small>'+esc(hours)+'</small></td></tr>';
 }).join("");
 panel.innerHTML='<div class="mr-listhead"><h3>'+esc((selected?.dept||"未明示")+"｜"+(selected?.name||"機台")+" 維修履歷")+'</h3><span class="mr-muted">'+esc(state.machinePeriod==="all"?"全部歷史月份":state.month)+'</span></div><div class="mr-machine-summary"><span>維修紀錄 <b>'+items.length+'</b> 件</span><span>已完成 <b>'+done+'</b> 件</span><span>含零件相關文字 <b>'+parts+'</b> 件</span></div>'+(items.length?'<div class="mr-tablescroll"><table class="mr-history-table"><thead><tr>'+["工單／日期","狀態／類型","故障描述","實際維修內容","更換零件／相關紀錄","處理人／工時"].map(x=>'<th>'+esc(x)+'</th>').join("")+'</tr></thead><tbody>'+rows+'</tbody></table></div>':'<div class="mr-empty">目前查詢範圍沒有該機台的維修紀錄。</div>')+(pages>1?'<div class="mr-pager"><button type="button" data-machine-page="-1" '+(state.machinePage===0?"disabled":"")+'>上一頁</button><span>第 '+(state.machinePage+1)+'／'+pages+' 頁，共 '+items.length+' 筆</span><button type="button" data-machine-page="1" '+(state.machinePage>=pages-1?"disabled":"")+'>下一頁</button></div>':'')+'<div class="mr-data-note">月報依上方月份統計，履歷預設顯示全部月份。零件欄摘錄維修內容與可取得的備註原文，可能包含請購、待更換或建議，非確認已更換清冊。目前名單與報修申請共用；三廠編號依報工設備序號建立，周邊設備暫無正式編號。歷史記錄未寫入設備識別碼，僅按廠區及明確名稱對應；同名換機仍須核對，不推定為同一實體。</div>';
}
function render(){
 if(!root)return;
 renderMachineHistory();
 const {regular,monthly,special,open,done}=getScoped();
 const historyPending=monthly.filter(o=>o._history&&!isDone(o));
 const unknownHours=monthly.filter(o=>o._history&&o.historyHours==null).length;
 const stop=monthly.filter(o=>String(o.stop||"").trim()==="是").length;
 const total=monthly.length,hours=monthly.reduce((n,o)=>n+workHours(o),0),rate=total?done.length/total*100:0;
 $("mrKpis").innerHTML=kpi("報修總數",total,"件","blue",state.month+" 報修")+
  kpi("已完成",done.length,"件","green","所選月份的工單")+
  kpi("未完成",open.length,"件","orange","全部未結，跨月")+
  kpi("通報停機",stop,"件","red","報修時勾選")+
  kpi("登錄維修工時",Number(hours.toFixed(1)),"小時","purple",unknownHours?"另有 "+unknownHours+" 筆未登錄":"不代表停機時數")+
  kpi("完成率",rate.toFixed(1),"%","teal","依所選月份工單")+
  kpi(SPECIAL,special.length,"件","special","本月合計");
 $("mrPanels").innerHTML='<div class="mr-panel"><h3>' + mrSvgIcon("bars") + '各廠區報修件數</h3>'+panelBars(monthly)+'</div>'+
   '<div class="mr-panel"><h3>' + mrSvgIcon("pie") + '維修類型占比</h3>'+panelDonut(monthly)+'</div>'+
   '<div class="mr-panel"><h3>' + mrSvgIcon("trophy") + '設備維修排行 Top 5</h3>'+panelTop(monthly)+'</div>'+
   '<div class="mr-panel"><h3>' + mrSvgIcon("trend") + '近六個月報修趨勢</h3>'+panelTrend(regular)+'</div>';
 $("mrLists").innerHTML=renderList("done",done,'✓ 已完成工單（所選月份：'+done.length+' 件）')+
  renderList("open",open,'◷ 未完成工單（所有未結：'+open.length+' 件）')+
  renderList("special",special,'▣ '+esc(SPECIAL)+'（本月共 '+special.length+' 件）')+(historyPending.length?renderHistoryPending(historyPending):"");
 const notice=$("mrFetchStatus");
 if(state.busy){notice.className="mr-notice";notice.textContent="正在從正式工單及歷史封存更新月報…";}
 else if(state.error){
  notice.className="mr-notice alert";
  notice.textContent="目前無法完整讀取月報："+state.error+"。下方如有資料，是先前快取，不代表即時統計。";
 }else if(state.loaded){
  notice.className="mr-notice";notice.textContent="正式工單及歷史封存已同步｜"+new Date(state.syncedAt).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})+"｜設備報修與「"+SPECIAL+"」分開計算。";
 }else{notice.className="mr-notice alert";notice.textContent="尚未確認最新正式工單，請按「更新資料」。";}
 $("mrMonth").value=state.month;
 $("mrDepts").querySelectorAll("button").forEach(b=>{const selected=b.dataset.dept===state.dept;b.classList.toggle("sel",selected);b.setAttribute("aria-pressed",selected)});
}
function make(){
 if(initialised)return;
 root=$("monthlyReportRoot");if(!root)return;
 root.innerHTML='<div class="mr-title"><div><h2>' + mrSvgIcon("wrench") + '維修月報</h2><p>設備維修統計與'+esc(SPECIAL)+'</p></div><span class="mr-last">資料來源：正式機修維修單及歷史維修資料</span></div>'+
 '<div class="mr-control"><label for="mrMonth">月份</label><div class="mr-month"><button type="button" id="mrMonthPrev" aria-label="上一個月" title="上一個月"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button><input id="mrMonth" type="month"><button type="button" id="mrMonthNext" aria-label="下一個月" title="下一個月"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button></div><label>廠區</label><div id="mrDepts" class="mr-dept">'+["全部","E3","E4","E5","W8","W8整修&組立","空壓機室"].map(n=>'<button type="button" data-dept="'+esc(n)+'">'+esc(n)+'</button>').join("")+'</div><button class="mr-reload" type="button" id="mrReload">↻ 更新資料</button><div class="mr-machine-control"><label for="mrMachine">機台</label><select id="mrMachine"><option value="">全部機台</option></select><label for="mrMachinePeriod">履歷範圍</label><select id="mrMachinePeriod"><option value="all">全部歷史月份</option><option value="month">所選月份</option></select></div></div>'+
 '<div class="mr-notice" id="mrFetchStatus">正在準備月報資料…</div><div class="mr-kpis" id="mrKpis"></div><div class="mr-panels" id="mrPanels"></div><article class="mr-list mr-machine-history" id="mrMachineHistory" hidden></article><div class="mr-lists" id="mrLists"></div>';
 $("mrMonthPrev").onclick=()=>{state.month=monthAdd(state.month,-1);state.machinePage=0;state.page={done:0,open:0,special:0};render()};
 $("mrMonthNext").onclick=()=>{state.month=monthAdd(state.month,1);state.machinePage=0;state.page={done:0,open:0,special:0};render()};
 $("mrMonth").onchange=e=>{if(monthRx.test(e.target.value)){state.month=e.target.value;state.machinePage=0;state.page={done:0,open:0,special:0};render()}};
 $("mrDepts").onclick=e=>{const btn=e.target.closest("button[data-dept]");if(btn){state.dept=btn.dataset.dept;state.machine="";state.machinePage=0;state.page={done:0,open:0,special:0};render()}};
 $("mrMachine").onchange=e=>{state.machine=e.target.value;state.machinePage=0;state.page={done:0,open:0,special:0};render()};
 $("mrMachinePeriod").onchange=e=>{state.machinePeriod=e.target.value==="month"?"month":"all";state.machinePage=0;render()};
 $("mrMachineHistory").addEventListener("click",e=>{const b=e.target.closest("button[data-machine-page]");if(!b)return;state.machinePage=Math.max(0,state.machinePage+Number(b.dataset.machinePage));render()});
 $("mrReload").onclick=()=>reload();
 $("mrLists").addEventListener("click",e=>{
  const btn=e.target.closest("button[data-action]");if(!btn)return;
  const kind=btn.dataset.kind,action=btn.dataset.action;
  if(!["done","open","special"].includes(kind))return;
  if(action==="toggle"){state.expanded[kind]=!state.expanded[kind];state.page[kind]=0}
  else if(action==="next")state.page[kind]++;
  else if(action==="prev")state.page[kind]=Math.max(0,state.page[kind]-1);
  render();
 });
 initialised=true;render();
}
function mergeReportOrders(live,history){
 const map=new Map();
 for(const o of history)if(o&&/^(?:MR20\d{8}|[A-Za-z]\d{6,14})$/.test(String(o.no||""))&&monthRx.test(o.historyMonth||""))map.set(o.no,{...o,_history:true});
 for(const o of live)map.set(o.no,{...o,_history:false});
 return [...map.values()];
}
async function loadHistory(token){
 if(!globalThis.crypto?.getRandomValues)throw Error("瀏覽器不支援安全查詢");
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 const requestId=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
 await fetch(SYNC_API_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"prepareMonthlyHistoryV1",requestId,sessionToken:token})});
 for(let i=0;i<20;i++){
  if(v10AuthToken_()!==token)throw Error("登入狀態已變更");
  const result=await jsonp_("monthlyHistoryResultV1",{requestId,part:"meta"},12000);
  if(result.pending){await new Promise(r=>setTimeout(r,500));continue;}
  if(result.spreadsheetId!==EXPECTED_SPREADSHEET_ID||!Number.isInteger(result.parts)||result.parts<0||result.parts>100)throw Error("歷史資料來源錯誤");
  const parts=await Promise.all(Array.from({length:result.parts},(_,part)=>jsonp_("monthlyHistoryResultV1",{requestId,part:String(part)},12000)));
  if(parts.some((p,i)=>p.pending||p.part!==i||!Array.isArray(p.orders)))throw Error("歷史資料讀取不完整");
  const rows=parts.flatMap(p=>p.orders);
  if(rows.length!==result.count)throw Error("歷史資料件數不符");
  return rows;
 }
 throw Error("歷史資料查詢逾時");
}
async function reload(){
 if(state.busy||!loader)return;
 state.busy=true;state.error="";render();
 try{
  await loader.load();
  const records=loader.get();
  if(!Array.isArray(records))throw Error("後端未回傳工單清單");
  const live=records.filter(o=>o&&typeof o==="object"&&/^MR20\d{8}$/.test(String(o.no||"")));
  const token=typeof v10AuthToken_==="function"?v10AuthToken_():"";
  if(!token)throw Error("請重新登入以查詢歷史維修資料");
  const history=await loadHistory(token);
  if(v10AuthToken_()!==token)throw Error("登入狀態已變更，請重新查詢");
  state.orders=mergeReportOrders(live,history);
  state.loaded=true;state.syncedAt=Date.now();state.error="";
 }catch(err){state.error=String(err?.message||err||"同步失敗");}
 finally{state.busy=false;render();}
}
window.maintenanceReport={
 clear(){state.orders=[];state.machine="";state.machinePage=0;state.loaded=false;state.error="";render();},
 open(options){
  loader=options;make();
  state.orders=[];state.loaded=false;state.error="";render();
  // Existing cache may appear only as a clearly marked fallback.
  const cache=loader?.get?.();
  if(Array.isArray(cache)&&cache.length&&!state.loaded){state.orders=cache.filter(o=>!o._history);render()}
  reload();
 },
 inspect(){
  const {monthly,open,done,special}=getScoped();
  return {loaded:state.loaded,error:state.error,month:state.month,dept:state.dept,monthly:monthly.length,
    completed:done.length,allOpen:open.length,special:special.length,sourceCount:state.orders.length};
 }
};
})();
