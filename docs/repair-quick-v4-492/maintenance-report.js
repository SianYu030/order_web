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
 const shapes={
  bars:'<path d="M4 20V13M10 20V8M16 20V4M22 20H2"/>',
  pie:'<path d="M12 3v9h9"/><path d="M20.5 15a9 9 0 1 1-11.5-11.5"/>',
  trophy:'<path d="M8 3h8v7a4 4 0 0 1-8 0V3Z"/><path d="M8 5H5v3a3 3 0 0 0 3 3m8-6h3v3a3 3 0 0 1-3 3M12 14v4m-4 3h8m-8-3h8"/>',
  trend:'<path d="m3 17 6-6 4 4 8-9M15 6h6v6"/>'
 };
 return '<svg class="mr-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">'+(shapes[kind]||shapes.bars)+'</svg>';
};
const state={month:monthNow(),dept:"全部",orders:[],syncedAt:0,error:"",loaded:false,expanded:{done:false,open:false,special:false},page:{done:0,open:0,special:0},busy:false};
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
function orderMonth(o){return recordDate(o).slice(0,7)}
function isDone(o){return DONE.has(String(o.status||"").trim())}
function isSpecial(o){return String(o.machine||"").trim()===SPECIAL}
function sameDept(o){return state.dept==="全部"||String(o.dept||"").trim()===state.dept}
function workHours(o){
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
 const active=state.orders.filter(o=>!CLOSED.has(String(o.status||"").trim())&&sameDept(o));
 const regular=active.filter(o=>!isSpecial(o));
 const monthly=regular.filter(o=>orderMonth(o)===state.month);
 const special=active.filter(o=>isSpecial(o)&&orderMonth(o)===state.month);
 // Open orders are not limited by selected month, including prior years.
 const open=regular.filter(o=>!isDone(o)).sort((a,b)=>recordDate(a).localeCompare(recordDate(b))||String(a.no).localeCompare(String(b.no)));
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
  const title=esc(o.issue||o.content||"未填寫");
  const date=dateShort(recordDate(o));
  if(type==="special"){
   return '<tr><td class="mr-cell">'+esc(o.no)+'</td><td>'+date+'</td><td>'+title+'</td><td>'+esc(o.person||"—")+'</td><td>'+esc(o.dept||"—")+'</td><td>'+status(o)+'</td></tr>';
  }
  if(type==="open"){
   return '<tr><td class="mr-cell">'+esc(o.no)+'</td><td>'+date+'</td><td>'+esc(o.dept||"—")+'</td><td>'+esc(o.machine||"—")+'</td><td>'+status(o)+'</td><td>'+esc(overdue(o))+'</td></tr>';
  }
  return '<tr><td class="mr-cell">'+esc(o.no)+'</td><td>'+date+'</td><td>'+esc(o.dept||"—")+'</td><td>'+esc(o.machine||"—")+'</td><td>'+title+'</td><td>'+esc(o.technician||"—")+'</td><td>'+workHours(o).toFixed(1)+'</td></tr>';
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
function countsBy(items,key){const x=new Map();items.forEach(o=>{const k=String(o[key]||"未分類").trim()||"未分類";x.set(k,(x.get(k)||0)+1)});return [...x].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"zh-Hant"))}
function panelBars(items){
 const map=new Map();["E3","E4","E5","W8","W8整修&組立","空壓機室"].forEach(d=>map.set(d,0));
 items.forEach(o=>{const d=String(o.dept||"").trim();map.set(d,(map.get(d)||0)+1)});
 const values=[...map].filter(([dept,n])=>n>0||["E3","E4","E5","W8"].includes(dept));
 const max=Math.max(1,...values.map(([,n])=>n));
 return values.map(([k,n])=>'<div class="mr-pair"><b>'+esc(k)+'</b><strong>'+n+' 件</strong></div><div class="mr-meter"><i style="width:'+(100*n/max).toFixed(1)+'%"></i></div>').join("")||'<div class="mr-empty">本月沒有設備報修。</div>';
}
function panelDonut(items){
 const data=countsBy(items,"type").slice(0,5);
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
function render(){
 if(!root)return;
 const {regular,monthly,special,open,done}=getScoped();
 const pendingMonth=monthly.filter(o=>!isDone(o)).length;
 const stop=monthly.filter(o=>String(o.stop||"").trim()==="是").length;
 const total=monthly.length,hours=monthly.reduce((n,o)=>n+workHours(o),0),rate=total?done.length/total*100:0;
 $("mrKpis").innerHTML=kpi("報修總數",total,"件","blue",state.month+" 報修")+
  kpi("已完成",done.length,"件","green","所選月份的工單")+
  kpi("未完成",open.length,"件","orange","全部未結，跨月")+
  kpi("通報停機",stop,"件","red","報修時勾選")+
  kpi("登錄維修工時",Number(hours.toFixed(1)),"小時","purple","不代表停機時數")+
  kpi("完成率",rate.toFixed(1),"%","teal","依所選月份工單")+
  kpi(SPECIAL,special.length,"件","special","本月合計");
 $("mrPanels").innerHTML='<div class="mr-panel"><h3>' + mrSvgIcon("bars") + '各廠區報修件數</h3>'+panelBars(monthly)+'</div>'+
   '<div class="mr-panel"><h3>' + mrSvgIcon("pie") + '維修類型占比</h3>'+panelDonut(monthly)+'</div>'+
   '<div class="mr-panel"><h3>' + mrSvgIcon("trophy") + '設備維修排行 Top 5</h3>'+panelTop(monthly)+'</div>'+
   '<div class="mr-panel"><h3>' + mrSvgIcon("trend") + '近六個月報修趨勢</h3>'+panelTrend(regular)+'</div>';
 $("mrLists").innerHTML=renderList("done",done,'✓ 已完成工單（所選月份：'+done.length+' 件）')+
  renderList("open",open,'◷ 未完成工單（所有未結：'+open.length+' 件）')+
  renderList("special",special,'▣ '+esc(SPECIAL)+'（本月共 '+special.length+' 件）');
 const notice=$("mrFetchStatus");
 if(state.busy){notice.className="mr-notice";notice.textContent="正在從正式「機修維修單」更新月報…";}
 else if(state.error){
  notice.className="mr-notice alert";
  notice.textContent="目前無法讀取最新工單："+state.error+"。下方如有資料，是先前快取，不代表即時統計。";
 }else if(state.loaded){
  notice.className="mr-notice";notice.textContent="正式工單資料已同步｜"+new Date(state.syncedAt).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})+"｜設備報修與「"+SPECIAL+"」分開計算。";
 }else{notice.className="mr-notice alert";notice.textContent="尚未確認最新正式工單，請按「更新資料」。";}
 $("mrMonth").value=state.month;
 $("mrDepts").querySelectorAll("button").forEach(b=>{const selected=b.dataset.dept===state.dept;b.classList.toggle("sel",selected);b.setAttribute("aria-pressed",selected)});
}
function make(){
 if(initialised)return;
 root=$("monthlyReportRoot");if(!root)return;
 root.innerHTML='<div class="mr-title"><div><h2>' + mrSvgIcon("bars") + '維修月報</h2><p>設備維修統計與'+esc(SPECIAL)+'</p></div><span class="mr-last">資料來源：正式機修維修單</span></div>'+
 '<div class="mr-control"><label for="mrMonth">月份</label><div class="mr-month"><button type="button" id="mrMonthPrev" aria-label="上一個月">‹</button><input id="mrMonth" type="month"><button type="button" id="mrMonthNext" aria-label="下一個月">›</button></div><label>廠區</label><div id="mrDepts" class="mr-dept">'+["全部","E3","E4","E5","W8","W8整修&組立","空壓機室"].map(n=>'<button type="button" data-dept="'+esc(n)+'">'+esc(n)+'</button>').join("")+'</div><button class="mr-reload" type="button" id="mrReload">↻ 更新資料</button></div>'+
 '<div class="mr-notice" id="mrFetchStatus">正在準備月報資料…</div><div class="mr-kpis" id="mrKpis"></div><div class="mr-panels" id="mrPanels"></div><div class="mr-lists" id="mrLists"></div>';
 $("mrMonthPrev").onclick=()=>{state.month=monthAdd(state.month,-1);state.page={done:0,open:0,special:0};render()};
 $("mrMonthNext").onclick=()=>{state.month=monthAdd(state.month,1);state.page={done:0,open:0,special:0};render()};
 $("mrMonth").onchange=e=>{if(monthRx.test(e.target.value)){state.month=e.target.value;state.page={done:0,open:0,special:0};render()}};
 $("mrDepts").onclick=e=>{const btn=e.target.closest("button[data-dept]");if(btn){state.dept=btn.dataset.dept;state.page={done:0,open:0,special:0};render()}};
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
async function reload(){
 if(state.busy||!loader)return;
 state.busy=true;state.error="";render();
 try{
  await loader.load();
  const records=loader.get();
  if(!Array.isArray(records))throw Error("後端未回傳工單清單");
  state.orders=records.filter(o=>o&&typeof o==="object"&&/^MR20\d{8}$/.test(String(o.no||"")));
  state.loaded=true;state.syncedAt=Date.now();state.error="";
 }catch(err){state.error=String(err?.message||err||"同步失敗");}
 finally{state.busy=false;render();}
}
window.maintenanceReport={
 open(options){
  loader=options;make();
  // Existing cache may appear only as a clearly marked fallback.
  const cache=loader?.get?.();
  if(Array.isArray(cache)&&cache.length&&!state.loaded){state.orders=cache;render()}
  reload();
 },
 inspect(){
  const {monthly,open,done,special}=getScoped();
  return {loaded:state.loaded,error:state.error,month:state.month,dept:state.dept,monthly:monthly.length,
    completed:done.length,allOpen:open.length,special:special.length,sourceCount:state.orders.length};
 }
};
})();
