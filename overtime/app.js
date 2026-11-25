/* 業務假日或臨時加班登記 V1.1.45 · GitHub Pages + Google Sheets API
 * 安全原則：只以 Google OAuth 的授權身分存取原始表，不把工作表內容或 OAuth token 寫入 GitHub。
 * 正式資料操作需有該試算表的「編輯者」權限；展示模式永不呼叫 Google API。
 */
(function () {
  "use strict";
  var SPREADSHEET_ID = "1yx_QWF4CFiRYn1Fp4osMjBAkX97_0QQu03yGJIpteLM";
  var BASE = "https://sheets.googleapis.com/v4/spreadsheets/" + SPREADSHEET_ID;
  var MASTER = "系統櫃人員主檔（新版）";
  var REGISTER_SHEET = "業務假日或臨時加班登記";
  var REGISTER_SHEET_ID = 1399193095;
  var MONTH_VIEW_ID = 2131065558;
  var PORTAL=(document.documentElement.dataset&&document.documentElement.dataset.portal)||"employee";
  var parameters=new URLSearchParams(window.location.search);
  var approvalId=parameters.get("approve")||"";
  var batchMode=PORTAL==="supervisor"||parameters.get("review")==="1";
  var reviewAction=parameters.get("action")==="reject"?"reject":"approve";
  var batchRows=[],selectedIds=new Set(),batchActor="";
  var CLIENT_KEY = "overtime:oauth-client-id:v1";
  var DEMO_KEY = "overtime:demo-records:v1";
  var COMMENT_TAG = "\n\n［加班登記網站］";
  var DEPT_SUFFIX = { "E3": "E3", "E4": "E4", "W8": "w8", "W8整修": "w8整修股", "E5": "E5機修課", "REVIEW": "E5機修課" };
  var DEPT_LABEL = { "E3": "E3 門板", "E4": "E4 櫃體", "W8": "W8", "W8整修": "W8 整修股", "E5": "E5 業務", "REVIEW": "審圖" };
  // 審圖屬於 E5 原月份表；前端分類不變更後端授權、員工工號或核准寫入目的地。
  function backendDepartment(dept){ return dept==="REVIEW" ? "E5" : dept; }
  var KINDS = { "加班": 1 }; // 原月表每日五欄，固定使用第 2 欄「加班」；不修改支援或班別
  var WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  var state = {
    token: null, tokenClient: null, metadata: null, roster: [], remoteRoster: [],
    kind: "加班", month: null, monthKey: "", loadId: 0, busy: false, editKey: ""
  };
  var $ = function (id) { return document.getElementById(id); };
  var latestReceipt = null;
  var receiptPoller = null;

  function receiptStage(status){
    switch(String(status||"")){
      case "待同步": return {text:"公司已收件，正在等待 Google 同步，尚未送主管核准。",tone:"waiting"};
      case "同步中": return {text:"Google 正在處理此申請，請稍後更新狀態。",tone:"waiting"};
      case "同步失敗": return {text:"同步暫時失敗，系統會補同步；請勿重複提交同一筆申請。",tone:"attention"};
      case "待核准": return {text:"已進入 Google 待核准清單，等待主管審核。",tone:"waiting"};
      case "核准待同步": return {text:"主管已核准，正在等待 Google 寫入正式工時並完成驗證。",tone:"waiting"};
      case "已核准": return {text:"主管已核准，Google 正式工時與註解已完成讀回驗證。",tone:"done"};
      case "已駁回": return {text:"此筆申請已結束，不會寫入正式工時。",tone:"attention"};
      case "駁回待同步": return {text:"取消／駁回已送出，等待 Google 核對來源資料。",tone:"waiting"};
      case "需人工核對": return {text:"公司已收件，但 Google 同步發生異常，需由管理員核對處理。請勿再送出同一天的申請。",tone:"attention"};
      default: return {text:"後端已收到申請；目前尚未確認 Google 同步與主管核准。",tone:"waiting"};
    }
  }
  function displayReceiptStatus(status){
    var current=String(status||"待同步"),stage=receiptStage(current);
    $("receiptStatus").textContent=current;
    $("receiptStatus").className="receipt-status receipt-"+stage.tone;
    $("receiptProgress").textContent=stage.text;
    $("receiptProgress").className="receipt-progress receipt-"+stage.tone;
  }
  function showReceiptPage(record,entry,saved,receiptToken){
    if(PORTAL!=="employee"||!record||!record.request_no||!record.id)
      throw Error("申請收據缺少必要資料，請到查詢頁核對是否已送出。");
    latestReceipt={id:record.id,token:receiptToken||null};
    $("receiptHeading").textContent="申請已送出";
    $("receiptNo").textContent=record.request_no;
    $("receiptDate").textContent=String(record.date||entry.date).replace(/-/g,"/");
    $("receiptEmployee").textContent=String(record.employee_name||entry.person.name);
    $("receiptDept").textContent=DEPT_LABEL[entry.department==="REVIEW"?"REVIEW":(record.department||entry.department)]||entry.department;
    $("receiptHours").textContent=formatHours(record.hours===undefined?entry.hours:record.hours);
    $("receiptReason").textContent=String(record.reason||entry.reason);
    markComp($("receiptHours"),record.reason||entry.reason);
    $("receiptLocalWarning").classList.toggle("hidden",saved);
    // 僅在查詢憑證未保存時顯示申請編號，正常成功頁保持簡潔。
    $("receiptNumberBox").classList.toggle("hidden",!!saved);
    $("receiptRefreshed").textContent="";
    updateReceiptCancel(record);
    displayReceiptStatus(record.status);
    switchView("receipt");
    $("receiptHeading").focus({preventScroll:true});
    // 自動核對後端，但不在申請成功畫面顯示中間同步階段。
    void refreshReceiptStatus(true);
  }
  async function refreshReceiptStatus(silent){
    // 自動查詢只在真正的異常／駁回時提醒；手動查詢才顯示簡短進度。
    var automatic=silent===true;
    if(!latestReceipt||!latestReceipt.token){
      if(!automatic) $("receiptRefreshed").textContent="目前沒有可用的查詢憑證，請回查詢頁或聯絡管理員。";
      return;
    }
    var button=$("receiptRefresh");
    if(button.disabled)return;
    button.disabled=true;button.textContent="查詢中…";
    try{
      var response=await window.OvertimeApi.receipt(latestReceipt.id,latestReceipt.token);
      if(!response.record||response.record.id!==latestReceipt.id)
        throw Error("伺服器回傳的申請編號不一致，請聯絡管理員");
      var status=String(response.record.status||"待同步");
      updateReceiptCancel(response.record);
      if(isOwnCancellation(response.record))$("receiptHeading").textContent=friendlyStatus(response.record)==="已取消"?"申請已取消":"取消申請處理中";
      displayReceiptStatus(status);
      var important=["同步失敗","需人工核對","已駁回"].includes(status);
      if(important) $("receiptNumberBox").classList.remove("hidden");
      if(!automatic||important){
        var label=["待同步","同步中"].includes(status)?"已收件，處理中":status;
        $("receiptRefreshed").textContent="申請狀態："+label+"。"+receiptStage(status).text;
      }
    }catch(e){
      $("receiptNumberBox").classList.remove("hidden");
      $("receiptRefreshed").textContent="狀態查詢未完成："+e.message+"。申請已送出，請勿重複提交。";
    }finally{button.disabled=false;button.textContent="更新申請狀態";}
  }
  function canEmployeeCancel(status){
    return status==="待同步"||status==="待核准";
  }
  function isOwnCancellation(record){
    return !!record && record.manager==="員工自行取消";
  }
  function friendlyStatus(record){
    if(isOwnCancellation(record)&&record.status==="已駁回")return "已取消";
    if(isOwnCancellation(record)&&record.status==="駁回待同步")return "取消處理中";
    return String(record.status||"");
  }
  function updateReceiptCancel(record){
    var btn=$("receiptCancel");
    if(!btn)return;
    btn.classList.toggle("hidden",!record||!canEmployeeCancel(record.status)||
      !latestReceipt||!latestReceipt.token);
  }
  async function cancelOwnRequest(id,token,date,name){
    if(!id||!token)return;
    if(!await confirmAction("確定取消這筆加班申請？\n"+String(date||"")+" · "+String(name||"")+
      "\n\n僅限主管尚未核准的申請。取消後不會寫入正式工時，操作紀錄會保留。"))return;
    var receiptButton=$("receiptCancel");
    if(receiptButton)receiptButton.disabled=true;
    try{
      // Server checks ownership with the original receipt token and atomically compares status.
      const result=await window.OvertimeApi.cancel(id,token);
      if(latestReceipt&&latestReceipt.id===id){
        latestReceipt.status=result.record.status;
        updateReceiptCancel(result.record);
        $("receiptHeading").textContent=friendlyStatus(result.record)==="已取消"?"申請已取消":"取消申請處理中";
        $("receiptRefreshed").textContent=result.message||"取消已受理。";
        $("receiptNumberBox").classList.add("hidden");
      }
      if(!$("view-history").classList.contains("hidden"))await refreshHistory();
    }catch(e){
      message("取消失敗："+e.message+"。請先重新查詢，不要重複送出。","error");
      if(latestReceipt&&latestReceipt.id===id&&receiptButton)receiptButton.classList.remove("hidden");
    }finally{if(receiptButton)receiptButton.disabled=false;}
  }
  function newReceiptEntry(){
    latestReceipt=null;
    state.editKey="";
    $("employee").value="";
    $("hours").value="3";
    $("reason").value="";
    setOvertimeType("normal");
    $("receiptRefreshed").textContent="";
    updatePreview();
    switchView("entry");
    $("employee").focus({preventScroll:true});
  }


  function message(text, type) {
    var el = $("banner");
    el.textContent = text;
    el.className = "notice " + (type || "");
    if (text) window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function clearMessage() { $("banner").className = "notice hidden"; $("banner").textContent = ""; }
  function setBusy(isBusy) {
    state.busy = isBusy;
    $("submitBtn").disabled = isBusy;
    $("connectBtn").disabled = isBusy;
    $("refreshHistory").disabled = isBusy;
    if($("batchRefresh")) $("batchRefresh").disabled=isBusy;
    if($("batchSelectAll")) $("batchSelectAll").disabled=isBusy||!batchActor;
    if($("batchApproveBtn")) updateBatchActions();
    $("submitBtn").textContent = isBusy ? "處理中，請勿重複送出…" : (PORTAL==="employee" ? "送出加班申請" : (state.token ? "送出加班申請（待核准）" : "未連線不可送出"));
  }
  function hasGoogle() { return !!state.token; }
  function pad(n) { return String(n).padStart(2, "0"); }
  function dateParts() {
    return { y: Number($("year").value), m: Number($("month").value), d: Number($("day").value) };
  }
  function dateString(p) { return String(p.y) + "/" + pad(p.m) + "/" + pad(p.d); }
  function isoString(p) { return String(p.y) + "-" + pad(p.m) + "-" + pad(p.d); }
  function dayOfWeek(p) { return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); }
  function monthName(p) { return String(p.m) + "月份" + DEPT_SUFFIX[$("department").value]; }
  function a1Col(i) {
    var out = "";
    for (var x = i + 1; x > 0; x = Math.floor((x - 1) / 26)) out = String.fromCharCode(65 + (x - 1) % 26) + out;
    return out;
  }
  function colIndex(day, kind) { return 6 + 5 * (day - 1) + KINDS[kind]; }
  function sheetQuote(s) { return "'" + s.replace(/'/g, "''") + "'"; }
  function numberOrNull(value) {
    var n = Number(value);
    return value === "" || value === null || value === undefined || !Number.isFinite(n) ? null : n;
  }
  function formatHours(n) { return Number(n).toString() + " 小時"; }
  var COMP_MARK="（加班換補休）";
  function isCompReason(reason){return String(reason||"").trimEnd().endsWith("\n"+COMP_MARK);}
  function stripCompReason(reason){
    var value=String(reason||"").trim();
    while(isCompReason(value))value=value.slice(0,-COMP_MARK.length-1).trimEnd();
    return value;
  }
  function overtimeType(){return document.querySelector('input[name="overtimeType"]:checked')?.value==="comp"?"comp":"normal";}
  function setOvertimeType(value){
    var input=document.querySelector('input[name="overtimeType"][value="'+(value==="comp"?"comp":"normal")+'"]');
    if(input)input.checked=true;
  }
  function reasonWithType(reason,type){return stripCompReason(reason)+(type==="comp"?"\n"+COMP_MARK:"");}
  function markComp(node,reason){if(node)node.classList.toggle("comp-hours",isCompReason(reason));}
  function taiwanToday() {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric"
    }).formatToParts(new Date());
    var dict = {};
    parts.forEach(function (part) { dict[part.type] = part.value; });
    return { y: Number(dict.year), m: Number(dict.month), d: Number(dict.day) };
  }
  function serialToDate(num) {
    if (typeof num !== "number" || num < 20000) return null;
    var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(num) * 86400000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  function matchesDate(num, expected) {
    var actual = serialToDate(num);
    return !!actual && actual.y === expected.y && actual.m === expected.m && actual.d === expected.d;
  }
  // 公開展示名單只列姓名與單位，不公開員工真實工號。
  // 正式申請必須經 Google 登入後依主檔重新取得工號、在職狀態。
  var PREVIEW_ROSTER = [{"name":"林予瑄","unit":"內勤","detail":"業務","dept":"E5"},{"name":"林季昀","unit":"內勤","detail":"業務","dept":"E5"},{"name":"張妤甄","unit":"內勤","detail":"業務","dept":"E5"},{"name":"陳榮彬","unit":"內勤","detail":"業務","dept":"E5"},{"name":"郭哲維","unit":"內勤","detail":"業務","dept":"E5"},{"name":"劉妍秀","unit":"內勤","detail":"業務","dept":"E5"},{"name":"潘詠升","unit":"E4","detail":"E4櫃體股","dept":"E4"},{"name":"吳嘉偉","unit":"內勤","detail":"審圖","dept":"REVIEW"},{"name":"蔡雲龍","unit":"內勤","detail":"審圖","dept":"REVIEW"}];
  function demoRoster() {
    return PREVIEW_ROSTER.map(function(person,i){
      return {id:"PREVIEW"+String(i+1).padStart(2,"0"),name:person.name,
        unit:person.unit,detail:person.detail,company:"",preview:true};
    });
  }
  function belongsToDept(person, dept) {
    if (dept === "E5") return person.unit === "內勤" && person.detail === "業務";
    if (dept === "REVIEW") return person.unit === "內勤" && person.detail === "審圖";
    if (dept === "E4") return person.unit === "E4" && person.detail === "E4櫃體股";
    return false;
  }
  function selectOption(select, value, label) {
    var option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
  function initDates() {
    var today = taiwanToday();
    var y = $("year");
    for (var year = 2025; year <= Math.max(2027, today.y + 2); year++) selectOption(y, String(year), year + " 年");
    y.value = String(today.y);
    var m = $("month");
    for (var month = 1; month <= 12; month++) selectOption(m, String(month), month + " 月");
    m.value = String(today.m);
    if (PORTAL === "employee" && $("datePicker")) {
      $("datePicker").min = "2025-01-01";
      $("datePicker").max = String(Math.max(2027, today.y + 2)) + "-12-31";
    }
    renderDays(today.d);
  }
  function renderDays(preferred) {
    var d = $("day"), selected = preferred || Number(d.value) || 1;
    var last = new Date(Number($("year").value), Number($("month").value), 0).getDate();
    d.replaceChildren();
    for (var n = 1; n <= last; n++) selectOption(d, String(n), n + " 日");
    d.value = String(Math.min(Math.max(1, selected), last));
    if (PORTAL === "employee" && $("datePicker")) {
      var date = dateParts();
      $("datePicker").value = isoString(date);
      if ($("datePickerText")) $("datePickerText").textContent = date.y + "年" + date.m + "月" + date.d + "日";
    }
    updatePreview();
  }
  function parseCalendarDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
    var parts = value.split("-").map(Number);
    var y = parts[0], m = parts[1], d = parts[2];
    if (y < 2025 || m < 1 || m > 12 || d < 1 || d > new Date(y, m, 0).getDate()) return null;
    if (![...$("year").options].some(function(option){return Number(option.value)===y;})) return null;
    return { y:y, m:m, d:d };
  }
  function chooseCalendarDate(value) {
    var parsed = parseCalendarDate(value);
    if (!parsed) {
      $("datePicker").value = isoString(dateParts());
      message("請選擇有效的加班日期。", "warning");
      return;
    }
    var previousMonth = $("year").value + "|" + $("month").value;
    $("year").value = String(parsed.y);
    $("month").value = String(parsed.m);
    renderDays(parsed.d);
    if (previousMonth !== parsed.y + "|" + parsed.m) void loadMonth();
  }
  function getPeople() { return PORTAL==="employee" ? state.remoteRoster : (hasGoogle() ? state.roster : demoRoster()); }
  function populateEmployees(preferredName) {
    var currentId = $("employee").value, dept = $("department").value;
    var selected = getPeople().filter(function (p) { return belongsToDept(p, dept); });
    var field = $("employee");
    field.replaceChildren();
    selectOption(field, "", selected.length ? "請選擇員工" : "目前沒有此單位的在職名冊");
    selected.forEach(function (p) {
      selectOption(field, p.id, p.remote ? (p.code ? p.code+" "+p.name : p.name) : (p.preview ? p.name : (p.id+" · "+p.name)));
    });
    var previous = selected.find(function(p){return p.id===currentId;}) ||
      (hasGoogle() && preferredName ? selected.find(function(p){return p.name===preferredName;}) : null);
    if (previous) field.value=previous.id;
    $("rosterText").textContent = PORTAL==="employee" ?
      (state.remoteRoster.length?"已從後端核對正式在職名冊；員工以工號及姓名顯示。":"正在載入後端名冊；尚未載入時不可送出申請。") :
      (hasGoogle()?"已從原始人員主檔核對在職員工。":"管理員尚未連結 Google 試算表。");
    updatePreview();
  }

  async function loadBackendRoster(){
    if(PORTAL!=="employee")return;
    try{
      if(!window.OvertimeApi)throw Error("後端收件元件未載入");
      const resp=await window.OvertimeApi.roster();
      const people=(resp.people||[]).filter(p=>["E4","E5"].includes(p.department)&&p.public_key&&p.employee_name&&p.display_code);
      if(!people.length)throw Error("沒有讀到正式業務名冊");
      state.remoteRoster=people.map(p=>({
        id:String(p.public_key),name:String(p.employee_name),code:String(p.display_code),unit:p.department==="E4"?"E4":"內勤",
        detail:p.department==="E4"?"E4櫃體股":(p.team==="審圖"?"審圖":"業務"),remote:true,preview:false
      }));
      populateEmployees();
    }catch(e){
      state.remoteRoster=[];populateEmployees();
      message("讀取公司名冊失敗："+e.message+"。本頁暫停送出，請勿當作已完成申請。","error");
    }
  }
  function chosenPerson() {
    return getPeople().find(function (p) { return p.id === $("employee").value && belongsToDept(p, $("department").value); }) || null;
  }
  function updateMode() {
    var online = hasGoogle();
    $("connectionStatus").textContent = online ? "Google 已連線" : "Google 未連線";
    $("connectionStatus").classList.toggle("connected",online);
    $("modeNotice").textContent = online ?
      "已登入 Google。送出只會建立「待核准」紀錄，不會修改 對應原月表。" :
      "Google 尚未連線：業務登記僅儲存在本機，不會寫入公司試算表。主管帳號登入不代表已取得 Google 工時寫入權限。";
    $("modeNotice").classList.toggle("warning",!online);
    $("submitHint").textContent = PORTAL==="employee" ?
      "申請先送入公司後端，待 Google 同步成功後進入主管待核准清單。核准前不寫入正式工時。" :
      (online?"送出後建立待核准紀錄，核准前不寫入原月表。":"Google 尚未連線，正式核准功能暫停。");
    $("settingsState").textContent = online ? "連線有效。資料存取取決於目前 Google 帳號的試算表權限。" : "尚未連接 Google。";
    setBusy(false);
    populateEmployees();
  }
  function getDayType(p) {
    if (hasGoogle() && state.month && state.monthKey === contextKey()) {
      var cell = state.month.dayTypes[5 * (p.d - 1) + 4];
      if (cell === "一般" || cell === "假日") return cell;
    }
    return dayOfWeek(p) === 0 || dayOfWeek(p) === 6 ? "假日（預估）" : "一般（預估）";
  }
  function getLunchPreview(p, n) {

    var type = getDayType(p);
    var holiday = type.indexOf("假日") === 0;
    return n >= (holiday ? 5 : 3) ? "可能符合便當條件" : "未達便當時數門檻";
  }
  function updatePreview() {
    if (!$("day").value) return;
    var p = dateParts(), person = chosenPerson();
    $("weekdayText").textContent = WEEKDAYS[dayOfWeek(p)] + " · " + getDayType(p) + (hasGoogle() ? "（以原表為準）" : "（展示推算）");
    $("summaryDate").textContent = dateString(p) + "（" + ["日","一","二","三","四","五","六"][dayOfWeek(p)] + "）";
    $("summaryDept").textContent = DEPT_LABEL[$("department").value] || "尚未選擇";
    $("summaryWho").textContent = person ? (person.preview ? person.name + "（預覽）" : person.name) : "尚未選擇";
    var hours = numberOrNull($("hours").value);
    $("summaryHours").textContent = hours === null ? "尚未填寫" : formatHours(hours);
    var type=overtimeType(),baseReason=stripCompReason($("reason").value);
    if($("summaryOvertimeType"))$("summaryOvertimeType").textContent=type==="comp"?"加班換補休":"一般加班";
    $("summaryReason").textContent = baseReason ? reasonWithType(baseReason,type) : "尚未填寫";
    markComp($("summaryHours"),type==="comp"?"x\n"+COMP_MARK:"");
  }
  function switchView(name) {
    // 三個網址具有獨立的入口與頁面；真實寫入仍須經後端及 Google 權限驗證。
    if(PORTAL==="employee"&&!["entry","history","receipt"].includes(name))return;
    if(PORTAL==="supervisor"&&!["batch","approval"].includes(name))return;
    if(PORTAL==="admin"&&name!=="settings")return;
    document.body.classList.toggle("employee-receipt",PORTAL==="employee"&&name==="receipt");
    if(PORTAL==="employee"){
      if(receiptPoller!==null){window.clearInterval(receiptPoller);receiptPoller=null;}
      if(name==="receipt"){
        // 只在完成畫面開啟時每分鐘更新；切換離開就停止，避免不必要的背景請求。
        receiptPoller=window.setInterval(function(){
          if(!document.hidden&&latestReceipt)void refreshReceiptStatus();
        },60000);
      }
    }
    document.querySelectorAll(".employee-tool").forEach(function(btn){
      const selected=btn.dataset.view===(name==="receipt"?"entry":name);
      btn.classList.toggle("is-active",selected);
      btn.setAttribute("aria-pressed",String(selected));
    });
    if($("view-history"))$("view-history").setAttribute("aria-hidden",name==="history"?"false":"true");
    document.querySelectorAll(".tab").forEach(function (btn) {
      var yes = btn.dataset.view === name;
      btn.classList.toggle("is-active", yes);
      btn.setAttribute("aria-selected", yes ? "true" : "false");
    });
    document.querySelectorAll(".view").forEach(function (s) { s.classList.add("hidden"); });
    $("view-" + name).classList.remove("hidden");
    clearMessage();
    if (name === "history") refreshHistory();
    if (name === "batch" && PORTAL!=="supervisor") refreshBatchQueue();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function getDemoRecords() {
    try {
      var val = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
      return Array.isArray(val) ? val : [];
    } catch (e) { return []; }
  }
  function saveDemoRecord(entry) {
    var records = getDemoRecords();
    var key = entry.date + "|" + entry.department + "|" + entry.id + "|" + entry.kind;
    var record = Object.assign({}, entry, { key: key, changedAt: new Date().toISOString() });
    var index = records.findIndex(function (r) { return r.key === key; });
    if (index >= 0) records[index] = record; else records.push(record);
    localStorage.setItem(DEMO_KEY, JSON.stringify(records.slice(-500)));
  }
  function validateEntry() {
    var p = dateParts(), person = chosenPerson();
    var hours = numberOrNull($("hours").value), reason = $("reason").value.trim();
    if (state.kind !== "加班") throw Error("此網站只允許加班登記。");
    if (!p.y || !p.m || !p.d || p.d > new Date(p.y, p.m, 0).getDate()) throw Error("請選擇正確登記日期。");
    if (PORTAL === "employee" && (!$("datePicker").value || $("datePicker").value !== isoString(p))) throw Error("請選擇正確的加班日期。");
    if (!person) throw Error("請先選擇正確的員工。");
    if (hours === null || hours < 0.5 || hours > 24 || Math.round(hours * 2) !== hours * 2) throw Error("時數須為 0.5 至 24 小時，且以半小時為單位。");
    reason=stripCompReason(reason);
    if (!reason) throw Error("請填寫加班原因／備註。");
    var type=overtimeType();
    reason=reasonWithType(reason,type);
    if (reason.length > 1600) throw Error("原因文字過長，請控制在 1600 字內。");
    return {
      p: p, date: isoString(p), department: $("department").value, person: person, id: person.id,
      kind: "加班", hours: hours, reason: reason, overtime_type:type
    };
  }
  function makeCellContext(entry) {
    var row = state.month && state.month.employeeRows.get(entry.id);
    if (!row) throw Error("在月份表中找不到員工工號，已停止寫入。請先同步主檔及月份人員。");
    var col = colIndex(entry.p.d, entry.kind);
    var range = a1Col(col) + row;
    return { sheetId: state.month.sheetId, sheetName: state.month.sheetName, row: row, rowIndex: row - 1, col: col, range: range };
  }
  function contextKey() {
    return $("year").value + "|" + $("month").value + "|" + $("department").value;
  }

  async function api(url, method, data) {
    if (!state.token) throw Error("Google 授權已失效，請先重新連線。");
    var headers = { Authorization: "Bearer " + state.token };
    if (data) headers["Content-Type"] = "application/json";
    var response;
    try {
      response = await fetch(url, { method: method || "GET", headers: headers, body: data ? JSON.stringify(data) : undefined, cache: "no-store" });
    } catch (e) { throw Error("無法連接 Google API，請確認網路連線後重試。"); }
    var json = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var msg = json.error && json.error.message ? json.error.message : "HTTP " + response.status;
      if (response.status === 401) { state.token = null; updateMode(); throw Error("Google 授權逾時，請重新登入。"); }
      if (response.status === 403) throw Error("權限不足或 Google Sheets API 尚未啟用：" + msg);
      throw Error("Google API 回應失敗（" + response.status + "）：" + msg);
    }
    return json;
  }
  function valuesUrl(sheetName, range, raw) {
    return BASE + "/values/" + encodeURIComponent(sheetQuote(sheetName) + "!" + range) + "?valueRenderOption=" + (raw ? "UNFORMATTED_VALUE" : "FORMATTED_VALUE");
  }
  async function getValues(sheetName, range, raw) {
    var data = await api(valuesUrl(sheetName, range, raw));
    return data.values || [];
  }
  async function loadConnectionData(preferredName) {
    var meta = await api(BASE + "?fields=sheets(properties(sheetId,title,hidden,gridProperties(columnCount))),properties(timeZone)");
    state.metadata = meta.sheets || [];
    var rows = await getValues(MASTER, "A4:H200", false);
    state.roster = rows.filter(function (r) {
      return r[0] && r[1] && r[5] === "在職";
    }).map(function (r) {
      return { id: String(r[0]).trim(), name: r[1], company: r[2] || "", unit: r[3] || "", detail: r[4] || "" };
    });
    if (!state.roster.length) throw Error("原始試算表已連結，但未取得在職員工名冊。");
    populateEmployees(preferredName);
    await loadMonth();
  }
  async function loadMonth() {
    if (!hasGoogle()) { state.month = null; state.monthKey = ""; updatePreview(); return; }
    var key = contextKey(), p = dateParts(), sheetName = monthName(p), myLoadId = ++state.loadId;
    state.month = null;
    state.monthKey = "";
    updatePreview();
    try {
      var sheet = (state.metadata || []).find(function (s) { return s.properties && s.properties.title === sheetName; });
      if (!sheet) throw Error("找不到「" + sheetName + "」分頁。請先由管理人員建立該月份表格。");
      var maxCol = sheet.properties.gridProperties && sheet.properties.gridProperties.columnCount || 160;
      var lastCol = a1Col(Math.min(maxCol - 1, 6 + new Date(p.y, p.m, 0).getDate() * 5 - 1));
      var all = await Promise.all([
        getValues(sheetName, "G1:" + lastCol + "1", true),
        getValues(sheetName, "G6:" + lastCol + "6", false),
        getValues(sheetName, "C8:D180", false)
      ]);
      if (myLoadId !== state.loadId || key !== contextKey() || !hasGoogle()) return;
      var dates = all[0][0] || [], types = all[1][0] || [];
      // Google Sheets 顯示日期「11/16」，但底層是可檢查年份的日期序號。
      if (!matchesDate(dates[0], { y: p.y, m: p.m, d: 1 })) {
        throw Error("月份表的真正年份不等於 " + p.y + "，已阻止跨年誤寫。");
      }
      var map = new Map();
      all[2].forEach(function (r, i) {
        if (r[0] && r[1]) map.set(String(r[0]).trim(), i + 8);
      });
      state.month = {
        key: key, sheetName: sheetName, sheetId: sheet.properties.sheetId,
        hidden: !!sheet.properties.hidden, employeeRows: map,
        dateValues: dates, dayTypes: types, columnCount: maxCol
      };
      state.monthKey = key;
      updatePreview();
      if (sheet.properties.hidden) {
        message("此月份分頁已封存／隱藏。可查詢但不可從網站寫入，以免誤改歷史月表。", "warning");
      } else {
        clearMessage();
      }
    } catch (e) {
      if (myLoadId !== state.loadId || key !== contextKey()) return;
      state.month = null;
      state.monthKey = "";
      message(e.message, "error");
    }
  }
  async function ensureMonth(entry) {
    if (!hasGoogle()) throw Error("目前是展示模式。");
    if (!state.month || state.monthKey !== contextKey()) await loadMonth();
    if (!state.month) throw Error("無法確認月份工作表，已取消寫入。");
    if (state.month.hidden) throw Error("該月份分頁已封存，禁止修改。");
    var start = 6 + 5 * (entry.p.d - 1);
    if (start + 4 >= state.month.columnCount) throw Error("該日期超出工作表欄位範圍。");
    var value = state.month.dateValues[start - 6];
    if (!matchesDate(value, entry.p)) throw Error("日期欄的實際年份／月份／日期不一致，已阻止寫入。");
    return makeCellContext(entry);
  }
  function isOurComment(content) { return typeof content === "string" && content.endsWith(COMMENT_TAG); }
  function reasonFromComment(content) { return isOurComment(content) ? content.slice(0, -COMMENT_TAG.length) : ""; }
  function commentContent(reason) { return (reason || "（備註已清空）") + COMMENT_TAG; }
  async function getCommentsAt(ctx) {
    var range = sheetQuote(ctx.sheetName) + "!" + ctx.range;
    var url = BASE + "?commentsViewMode=COMMENTS_VIEW_MODE_INCLUDED&ranges=" + encodeURIComponent(range) +
      "&fields=comments(commentId,anchorId,headPost(postId,content,author(me)),replies(postId,content,author(me))),sheets(properties(sheetId),commentAnchors(anchorId,range))";
    var data = await api(url);
    var targetSheet = (data.sheets || []).find(function (s) { return s.properties && s.properties.sheetId === ctx.sheetId; });
    var anchors = (targetSheet && targetSheet.commentAnchors || []).filter(function (a) {
      var r = a.range || {};
      return r.startRowIndex <= ctx.rowIndex && r.endRowIndex > ctx.rowIndex &&
        r.startColumnIndex <= ctx.col && r.endColumnIndex > ctx.col;
    }).map(function (a) { return a.anchorId; });
    return (data.comments || []).filter(function (c) { return anchors.includes(c.anchorId); });
  }
  function findOurComment(comments) {
    for (var c of comments) {
      if (c.headPost && isOurComment(c.headPost.content)) {
        if (c.headPost.author && c.headPost.author.me) return { comment: c, post: c.headPost, editable: true, isHead: true };
        var replies = (c.replies || []).filter(function (r) { return isOurComment(r.content); });
        for (var j = replies.length - 1; j >= 0; j--) {
          if (replies[j].author && replies[j].author.me) return { comment: c, post: replies[j], editable: true, isHead: false };
        }
        return { comment: c, post: c.headPost, editable: false, isHead: true };
      }
    }
    return null;
  }
  function commentRequest(reason, comments, ctx) {
    var existing = findOurComment(comments), content = commentContent(reason);
    if (existing && existing.editable) {
      return { updateCommentPost: { commentId: existing.comment.commentId, postId: existing.post.postId, content: content } };
    }
    if (existing) {
      return { addCommentReply: { commentId: existing.comment.commentId, post: { content: content } } };
    }
    return { insertComment: { content: content, coordinate: { sheetId: ctx.sheetId, rowIndex: ctx.rowIndex, columnIndex: ctx.col } } };
  }
  function targetLink(ctx) {
    return "https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID + "/edit#gid=" + ctx.sheetId + "&range=" + ctx.range;
  }
  function updateCellRequest(ctx, col, value) {
    return {
      updateCells: {
        start: { sheetId: ctx.sheetId, rowIndex: ctx.rowIndex, columnIndex: col },
        rows: [{ values: [{ userEnteredValue: typeof value === "number" ? { numberValue: value } : { stringValue: value } }] }],
        fields: "userEnteredValue"
      }
    };
  }

  // 申請資料先存入隱藏來源表，原 對應月表在主管核准前完全不寫。
  function supervisorRecordId(entry) {
    return "BUS-" + entry.date.replace(/-/g, "") + "-" + entry.department + "-" + entry.id;
  }
  function sheetsDateNumber(p) {
    return (Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(1899, 11, 30)) / 86400000;
  }
  function taiwanDateTimeNumber() {
    var parts = new Intl.DateTimeFormat("en-US", { timeZone:"Asia/Taipei",
      year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false
    }).formatToParts(new Date());
    var x = {};
    parts.forEach(function (a) { x[a.type] = Number(a.value); });
    return (Date.UTC(x.year,x.month-1,x.day,x.hour%24,x.minute,x.second) - Date.UTC(1899,11,30))/86400000;
  }
  function cellValue(v) {
    return { userEnteredValue:typeof v==="number" ? {numberValue:v} : {stringValue:String(v)} };
  }
  function buildPendingRecord(entry,ctx,existing,now,customId) {
    var old=existing||[],created=old[12]||now;
    return [customId||supervisorRecordId(entry),sheetsDateNumber(entry.p),entry.p.y,entry.p.m,
      entry.department,entry.id,entry.person.name,entry.hours,entry.reason,
      "待核准",ctx.sheetName,ctx.range,created,now,"GitHub 網站","待核准","",""];
  }
  // 資料位於 A2:R1500 的預先格式化區。精準寫入第一個空白列，不使用
  // appendCells 往表尾延伸，避免超出月檢視的讀取範圍。
  var PENDING_LAST_ROW = 1500;
  function findPendingRecord(records,id) {
    if (!/^BUS-[0-9]{8}-(E4|E5)-[A-Za-z0-9]+(?:-[A-Fa-f0-9]{8})?(?:-R[1-9][0-9]*)?$/.test(id)) throw Error("申請編號格式不正確。");
    var matches=[];
    records.forEach(function(r,i){
      if(String(r[0]||"")===id)matches.push({row:r,rowIndex:i+1});
    });
    if(matches.length>1)throw Error("此申請ID有重複資料，已阻止操作。");
    return matches[0]||null;
  }
  function firstPendingEmptyRow(records) {
    for(var i=0;i<PENDING_LAST_ROW-1;i++){
      if(i>=records.length || !records[i].some(function(v){return v!==""&&v!==null&&v!==undefined;}))
        return i+1;
    }
    throw Error("業務申請來源表已滿（1500 列），請管理員先擴充並調整月檢視範圍。");
  }
  async function getPendingById(id) {
    var records=await getValues(REGISTER_SHEET,"A2:R1500",true);
    return findPendingRecord(records,id);
  }
  async function savePendingRequest(entry,ctx) {
    if (!state.metadata || !state.metadata.some(function(x) {
      return x.properties && x.properties.sheetId===REGISTER_SHEET_ID && x.properties.title===REGISTER_SHEET;
    })) throw Error("找不到業務登記來源分頁。");
    if(!["E4","E5"].includes(entry.department) || !entry.person ||
      !belongsToDept(entry.person,entry.department) || String(entry.person.id)!==String(entry.id) ||
      !state.roster.some(function(p){return p.id===entry.id && p.name===entry.person.name && belongsToDept(p,entry.department);}))
      throw Error("只能登記原始人員主檔核對通過的 E4 潘詠升或 E5 業務人員。");
    var baseId=supervisorRecordId(entry),id=baseId;
    var all=await getValues(REGISTER_SHEET,"A2:R1500",true);
    var prior=null, historical=[],seen=new Set();
    all.forEach(function(r,index){
      var recordId=String(r[0]||"");
      if(recordId===baseId || recordId.startsWith(baseId+"-R")){
        if(seen.has(recordId))throw Error("同一申請編號重複，已停止操作。");
        seen.add(recordId);historical.push({row:r,rowIndex:index+1});
      }
    });
    prior=historical.find(function(x){return x.row[15]==="待核准";})||null;
    if(historical.filter(function(x){return x.row[15]==="待核准";}).length>1)
      throw Error("同日同員工存在多筆待核准申請，請管理員先核對。");
    if(prior)id=String(prior.row[0]);
    else if(historical.length){
      if(historical.some(function(x){return x.row[15]!=="已駁回";}))
        throw Error("此日期的申請已核准或正在核對中，禁止重複送出。");
      // 被主管駁回後可重新提交；舊紀錄保留，新的申請取得新編號。
      var n=1;
      while(seen.has(baseId+"-R"+n))n++;
      id=baseId+"-R"+n;
    }
    if(prior && String(prior.row[6])===entry.person.name &&
       Number(prior.row[7])===entry.hours && String(prior.row[8])===entry.reason &&
       String(prior.row[10])===ctx.sheetName && String(prior.row[11])===ctx.range)
      return "unchanged";
    var rowIndex=prior?prior.rowIndex:firstPendingEmptyRow(all);
    var now=taiwanDateTimeNumber(),row=buildPendingRecord(entry,ctx,prior&&prior.row,now,id);
    var request={updateCells:{
      start:{sheetId:REGISTER_SHEET_ID,rowIndex:rowIndex,columnIndex:0},
      rows:[{values:row.map(cellValue)}],fields:"userEnteredValue"
    }};
    await api(BASE+":batchUpdate","POST",{requests:[request]});
    var check=await getPendingById(id);
    if(!check || check.rowIndex!==rowIndex ||
       String(check.row[5])!==String(entry.id) ||
       String(check.row[6])!==entry.person.name || Number(check.row[7])!==entry.hours ||
       String(check.row[8])!==entry.reason || String(check.row[15])!=="待核准")
      throw Error("申請紀錄寫入後驗證失敗，請勿重複送出。");
    return prior?"updated":"created";
  }
  async function googleIdentity() {
    var response=await fetch("https://www.googleapis.com/oauth2/v3/userinfo",{
      headers:{Authorization:"Bearer "+state.token},cache:"no-store"
    });
    if(!response.ok)throw Error("無法驗證 Google 登入身分，請重新登入。");
    var data=await response.json();
    if(!data.email || data.email_verified!==true)throw Error("Google 帳號信箱尚未驗證。");
    return data.email.toLowerCase();
  }
  function fillApprovalSummary(r) {
    var p=serialToDate(r[1]);
    if(!p)throw Error("來源申請日期無法辨識。");
    $("approvalDate").textContent=dateString(p);
    $("approvalEmployee").textContent=String(r[6]||"")+"（"+String(r[5]||"")+"）";
    $("approvalHours").textContent=formatHours(r[7]);
    $("approvalReason").textContent=String(r[8]||"");
    markComp($("approvalHours"),r[8]);
    $("approvalStatus").textContent=String(r[15]||"未知");
  }
  async function loadApprovalRequest() {
    switchView("approval");
    $("approveBtn").disabled=true;
    $("rejectBtn").disabled=true;
    if(!hasGoogle()){
      $("approvalState").textContent=(reviewAction==="reject"?"從月檢視選擇了「駁回刪除」。":"從月檢視選擇了「主管核准」。")+"請先以授權主管 Google 帳號登入，登入後才能操作。";return;
    }
    try{
      var actor=await requireApprover();
      var item=await getPendingById(approvalId);
      if(!item)throw Error("找不到這筆申請。");
      fillApprovalSummary(item.row);
      if(item.row[15]!=="待核准"){
        $("approvalState").textContent="目前狀態「"+item.row[15]+"」，不能再次核准或駁回。";
        return;
      }
      $("approvalState").textContent="已驗證主管 "+actor+"。"+(reviewAction==="reject"?"本次由月檢視點選「駁回刪除」，請核對後按紅色駁回按鈕；不會直接刪除工時。":"本次由月檢視點選「主管核准」，請核對後按藍色核准按鈕。");
      $("approveBtn").disabled=false;$("rejectBtn").disabled=false;
      if(reviewAction==="reject")$("rejectBtn").focus({preventScroll:true});
    }catch(e){$("approvalState").textContent=e.message;}
  }
  async function locateApprovedCell(row) {
    var p=serialToDate(row[1]),id=String(row[5]||"");
    if(!p || p.y!==Number(row[2]) || p.m!==Number(row[3]))
      throw Error("申請日期／年份／月份不一致。");
    var dept=String(row[4]||"");
    if(!["E4","E5"].includes(dept))throw Error("不支援此申請單位。");
    var person=state.roster.find(function(x){
      return x.id===id && x.name===String(row[6]) && belongsToDept(x,dept);
    });
    if(!person)throw Error("原始人員主檔中的業務工號／姓名不一致。");
    var shName=p.m+"月份"+DEPT_SUFFIX[dept];
    var sheet=(state.metadata||[]).find(function(x){return x.properties&&x.properties.title===shName;});
    if(!sheet || sheet.properties.hidden)throw Error("對應月份工作表不存在或已封存。");
    var days=await getValues(shName,"G1:"+a1Col(colIndex(p.d,"加班"))+"1",true);
    var serial=days[0]||[];
    if(!matchesDate(serial[0],{y:p.y,m:p.m,d:1})||
       !matchesDate(serial[5*(p.d-1)],p))
      throw Error("月表的真正日期與申請不同，已阻止誤寫。");
    var rows=await getValues(shName,"C8:D180",false);
    var found=[];
    rows.forEach(function(x,i){if(String(x[0]||"")===id && String(x[1]||"")===person.name)found.push(i+8);});
    if(found.length!==1)throw Error("月表中的工號／姓名比對不是唯一。");
    var column=colIndex(p.d,"加班"),range=a1Col(column)+found[0];
    return {sheetId:sheet.properties.sheetId,sheetName:shName,row:found[0],rowIndex:found[0]-1,col:column,range:range};
  }

  // 主管帳號目前未設定，保留拒絕寫入的安全鎖。
  async function requireApprover() {
    if (!window.SupervisorAuth) throw Error("主管登入元件尚未載入。");
    var username=await window.SupervisorAuth.requireApprover();
    if (!hasGoogle()) throw Error("主管帳號已登入，但 Google 試算表授權尚未連線；請至「設定」完成 Google 授權後才能核准工時。");
    return username;
  }
  // 每一筆核准都重新確認日期、人員、目標儲存格與申請狀態。
  async function approveById(id,actor) {
    if(!window.SupervisorAuth || (await window.SupervisorAuth.requireApprover())!==actor)throw Error("主管登入驗證失敗。");
    var item=await getPendingById(id);
    if(!item||item.row[15]!=="待核准")throw Error("這筆申請已核准、駁回或不存在。");
    var row=item.row,ctx=await locateApprovedCell(row),hours=Number(row[7]),reason=String(row[8]||"").trim();
    if(isCompReason(reason))throw Error("加班換補休請使用主管後端審核清單，禁止舊版直接寫入。");
    if(!(hours>=0.5&&hours<=24&&Math.round(hours*2)===hours*2) ||
       !reason || reason.length>1600)throw Error("申請時數或原因不符合規則。");
    var old=await getValues(ctx.sheetName,ctx.range,true);
    var value=old[0]&&old[0][0];
    if(value!==""&&value!==undefined&&value!==null&&Number(value)!==0)
      throw Error("原月表 "+ctx.sheetName+"!"+ctx.range+" 已有 "+value+"，禁止覆蓋。");
    var exactUrl=BASE+"?ranges="+encodeURIComponent(sheetQuote(ctx.sheetName)+"!"+ctx.range)+
      "&includeGridData=true&fields=sheets(data(rowData(values(userEnteredValue))))";
    var full=await api(exactUrl);
    var uv=full.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0]?.userEnteredValue;
    if(uv&&(uv.formulaValue||(uv.stringValue!==undefined&&uv.stringValue!=="")||
       (uv.numberValue!==undefined&&Number(uv.numberValue)!==0)))
      throw Error("原月表目標儲存格有公式或資料，不允許覆蓋。");
    var earlier=await getCommentsAt(ctx);
    if(earlier.some(function(c){return c.headPost&&isOurComment(c.headPost.content);}))
      throw Error("原月表已有本站建立的註解，請人工核對以免重複。");
    var again=await getPendingById(id);
    if(!again||again.row[15]!=="待核准"||Number(again.row[7])!==hours||
       String(again.row[8])!==reason||String(again.row[5])!==String(row[5])||
       String(again.row[4])!==String(row[4]))
      throw Error("申請內容已變更，請重新讀取後核准。");
    var answer=await api(BASE+":batchUpdate","POST",{requests:[
      updateCellRequest(ctx,ctx.col,hours),
      {insertComment:{content:commentContent(reason),coordinate:{
        sheetId:ctx.sheetId,rowIndex:ctx.rowIndex,columnIndex:ctx.col}}}
    ]});
    var actual=await getValues(ctx.sheetName,ctx.range,true);
    if(Number(actual[0]&&actual[0][0])!==hours)
      throw Error("時數寫入後讀回不一致，請人工查核。");
    if(answer.commentUpdateState&&answer.commentUpdateState!=="ALL_SAVED")
      throw Error("工時可能已寫入，但註解寫入失敗："+answer.commentUpdateState+"。");
    var comments=await getCommentsAt(ctx);
    if(!comments.some(function(c){return c.headPost&&c.headPost.content===commentContent(reason);}))
      throw Error("工時已寫入，但註解未通過驗證，禁止標記已核准。");
    var now=taiwanDateTimeNumber();
    await api(BASE+":batchUpdate","POST",{requests:[
      {updateCells:{start:{sheetId:REGISTER_SHEET_ID,rowIndex:again.rowIndex,columnIndex:9},
        rows:[{values:["已同步",ctx.sheetName,ctx.range].map(cellValue)}],fields:"userEnteredValue"}},
      {updateCells:{start:{sheetId:REGISTER_SHEET_ID,rowIndex:again.rowIndex,columnIndex:15},
        rows:[{values:["已核准",actor,now].map(cellValue)}],fields:"userEnteredValue"}}
    ]});
    var verified=await getPendingById(id);
    if(!verified||verified.row[15]!=="已核准"||String(verified.row[16])!==actor)
      throw Error("月表已處理，但核准狀態未驗證成功，請人工查核。");
    return ctx;
  }
  // 駁回不刪除原始資料，不更動 E4/E5 月表；
  // 狀態改成已駁回，月檢視公式與待審清單都會排除它。
  async function rejectById(id,actor) {
    if(!window.SupervisorAuth || (await window.SupervisorAuth.requireApprover())!==actor)throw Error("主管登入驗證失敗。");
    var item=await getPendingById(id);
    if(!item||item.row[15]!=="待核准")throw Error("已處理申請不可駁回。");
    await api(BASE+":batchUpdate","POST",{requests:[
      {updateCells:{start:{sheetId:REGISTER_SHEET_ID,rowIndex:item.rowIndex,columnIndex:9},
        rows:[{values:[cellValue("不需同步")]}],fields:"userEnteredValue"}},
      {updateCells:{start:{sheetId:REGISTER_SHEET_ID,rowIndex:item.rowIndex,columnIndex:15},
        rows:[{values:["已駁回",actor,taiwanDateTimeNumber()].map(cellValue)}],fields:"userEnteredValue"}}
    ]});
    var after=await getPendingById(id);
    if(!after||after.row[15]!=="已駁回"||String(after.row[16])!==actor)
      throw Error("駁回寫入後未通過讀回核對。");
    return true;
  }
  async function approvePending() {
    if(state.busy||!approvalId)return;
    try{
      var actor=await requireApprover(),item=await getPendingById(approvalId);
      if(!item||item.row[15]!=="待核准")throw Error("申請已處理或不存在。");
      var row=item.row,day=serialToDate(row[1]);
      if(!await confirmAction("主管確認核准？\n"+(day?dateString(day):"日期待核對")+
        " · "+row[4]+" · "+row[6]+"\n"+row[7]+" 小時\n原因："+row[8]))return;
      setBusy(true);$("approveBtn").disabled=true;$("rejectBtn").disabled=true;
      var ctx=await approveById(approvalId,actor);
      var fresh=await getPendingById(approvalId);
      fillApprovalSummary(fresh.row);
      $("approvalState").textContent="核准完成，已確認寫入 "+ctx.sheetName+"!"+ctx.range+" 的加班時數及註解。";
    }catch(e){$("approvalState").textContent="核准未完成："+e.message+
      "。遇到部分寫入請先核對原月表，不要直接重複操作。";}
    finally{setBusy(false);$("approveBtn").disabled=true;$("rejectBtn").disabled=true;}
  }
  async function rejectPending() {
    if(state.busy||!approvalId)return;
    try{
      var actor=await requireApprover(),item=await getPendingById(approvalId);
      if(!item||item.row[15]!=="待核准")throw Error("申請已處理或不存在。");
      if(!await confirmAction("確定駁回 "+item.row[6]+" 的加班申請？\n"+
        "紀錄將從待核准清單移除，來源資料保留供稽核。"))return;
      setBusy(true);$("approveBtn").disabled=true;$("rejectBtn").disabled=true;
      await rejectById(approvalId,actor);
      var fresh=await getPendingById(approvalId);
      fillApprovalSummary(fresh.row);
      $("approvalState").textContent="已駁回並移出待核准清單，來源紀錄已保留。";
    }catch(e){$("approvalState").textContent="駁回未完成："+e.message;}
    finally{setBusy(false);$("approveBtn").disabled=true;$("rejectBtn").disabled=true;}
  }


  function updateBatchActions() {
    if(!$("batchSelectedCount"))return;
    var n=selectedIds.size, allowed=!!batchActor&&hasGoogle()&&!state.busy;
    $("batchSelectedCount").textContent="已選 "+n+" 筆";
    $("batchApproveBtn").textContent="核准並寫入（"+n+"）";
    $("batchRejectBtn").textContent="駁回刪除（"+n+"）";
    $("batchApproveBtn").disabled=!allowed||!n;
    $("batchRejectBtn").disabled=!allowed||!n;
    $("batchSelectAll").disabled=!allowed||!batchRows.length;
    $("batchSelectAll").checked=!!batchRows.length&&batchRows.every(function(r){return selectedIds.has(String(r[0]));});
    $("batchSelectAll").indeterminate=n>0&&n<batchRows.length;
  }
  function renderBatchQueue() {
    var list=$("batchList");list.replaceChildren();
    $("batchCount").textContent="待核准 "+batchRows.length+" 筆";
    if(!batchRows.length){
      var empty=document.createElement("div");empty.className="empty";
      empty.textContent="目前沒有待主管核准的申請。";
      list.appendChild(empty);
    }
    batchRows.forEach(function(r){
      var id=String(r[0]||""),date=serialToDate(r[1]);
      var label=document.createElement("label");
      label.className="batch-card"+(selectedIds.has(id)?" is-selected":"");
      var checkbox=document.createElement("input");
      checkbox.type="checkbox";checkbox.value=id;
      checkbox.checked=selectedIds.has(id);
      checkbox.setAttribute("aria-label","選擇 "+String(r[6]||"")+" 的加班申請");
      var info=document.createElement("span");info.className="batch-info";
      var title=document.createElement("strong");
      title.textContent=(date?dateString(date):"日期待核對")+" · "+String(r[4]||"")+" · "+String(r[6]||"");
      var detail=document.createElement("small");
      detail.textContent=String(r[7]||"")+" 小時 · "+String(r[8]||"");
      info.append(title,detail);
      checkbox.addEventListener("change",function(){
        if(checkbox.checked)selectedIds.add(id);else selectedIds.delete(id);
        label.classList.toggle("is-selected",checkbox.checked);
        updateBatchActions();
      });
      label.append(checkbox,info);list.appendChild(label);
    });
    updateBatchActions();
  }
  async function refreshBatchQueue() {
    batchActor="";selectedIds.clear();batchRows=[];
    $("batchList").replaceChildren();
    $("batchCount").textContent="待核准 0 筆";
    $("batchState").textContent="正在檢查主管登入與 Google 試算表授權…";
    updateBatchActions();
    try{
      var actor=await requireApprover();
      var all=await getValues(REGISTER_SHEET,"A2:R1500",true);
      var rows=all.filter(function(r){return r[0]&&r[15]==="待核准";});
      var unique=new Set();
      for(var row of rows){
        var id=String(row[0]||"");
        if(!/^BUS-[0-9]{8}-(E4|E5)-[A-Za-z0-9]+(?:-[A-Fa-f0-9]{8})?(?:-R[1-9][0-9]*)?$/.test(id))
          throw Error("待核准清單中存在不合法的登記編號，已停止操作。");
        if(unique.has(id))throw Error("待核准清單存在重複登記編號，已停止操作。");
        unique.add(id);
      }
      rows.sort(function(a,b){return Number(b[1])-Number(a[1]);});
      batchRows=rows;batchActor=actor;
      $("batchState").textContent="主管帳號 "+actor+" 已驗證，請勾選需要處理的申請。";
      renderBatchQueue();
      return true;
    }catch(e){
      $("batchState").textContent=e.message;
      var info=document.createElement("div");info.className="empty";
      info.textContent="請先完成主管帳號授權，才能顯示及處理正式申請。";
      $("batchList").appendChild(info);
      updateBatchActions();
      return false;
    }
  }
  async function processBatch(action) {
    if(state.busy||!batchActor||!selectedIds.size||!hasGoogle())return;
    var ids=Array.from(selectedIds),actor,actionName=action==="approve"?"核准寫入":"駁回刪除";
    try{actor=await requireApprover();}catch(e){$("batchState").textContent=e.message;return;}
    if(actor!==batchActor){$("batchState").textContent="主管登入身分已變更，請重新讀取。";return;}
    var messageText="確認批次"+actionName+" "+ids.length+" 筆？\n"+
      (action==="approve"?"每筆核對工號、日期與現有時數後才會寫入月表及註解，遇到錯誤立即停止。":
       "駁回後從月檢視移除，但來源保留查核。已核准的工時不會刪除。");
    if(!await confirmAction(messageText))return;
    setBusy(true);updateBatchActions();
    var done=0,problem="";
    try{
      for(var id of ids){
        try{
          if(action==="approve")await approveById(id,actor);
          else if(action==="reject")await rejectById(id,actor);
          else throw Error("未知操作。");
          done++;
          $("batchState").textContent="正在"+actionName+"，已完成 "+done+"／"+ids.length+" 筆";
        }catch(e){problem=id+"："+e.message;break;}
      }
    }finally{setBusy(false);}
    var reloaded=await refreshBatchQueue();
    if(!reloaded){$("batchState").textContent="已執行 "+done+"／"+ids.length+" 筆，但清單重新讀取失敗；請至試算表核對結果。";return;}
    $("batchState").textContent=problem ?
      "已完成 "+done+"／"+ids.length+" 筆，發生錯誤並停止："+problem+
      "。請核對原始月表，避免重複寫入。" :
      "已成功"+actionName+" "+done+" 筆，清單已重新讀取。";
  }

  function confirmAction(text) {
    return new Promise(function (resolve) {
      var dlg = $("confirmDialog");
      $("confirmText").textContent = text;
      dlg.returnValue = "cancel";
      if (typeof dlg.showModal !== "function") { resolve(window.confirm(text)); return; }
      var onClose = function () { dlg.removeEventListener("close", onClose); resolve(dlg.returnValue === "confirm"); };
      dlg.addEventListener("close", onClose);
      dlg.showModal();
    });
  }
  async function submitEntry(event) {
    event.preventDefault();
    if (state.busy) return;
    clearMessage();
    var entry;
    try { entry = validateEntry(); }
    catch (e) { message(e.message, "error"); return; }
    setBusy(true);
    try {
      if(PORTAL==="employee"){
        if(!entry.person.remote||!window.OvertimeApi)throw Error("尚未取得正式後端名冊，無法送出");
        const receipt=state.editKey ? window.OvertimeApi.localReceipts().find(x=>x.id===state.editKey) : null;
        if(state.editKey&&!receipt)throw Error("找不到這筆申請的修改憑證，請使用原本送出的裝置查詢");
        if(receipt && (receipt.date!==entry.date||receipt.department!==backendDepartment(entry.department)||receipt.public_key!==entry.person.id))
          throw Error("修改原申請時，日期與員工不可變更；請重新選擇原本的申請。");
        const yes=await confirmAction((receipt?"修改待同步加班申請：\n":"送出加班申請至公司後端：\n")+
          dateString(entry.p)+" · "+entry.person.name+"\n"+formatHours(entry.hours)+"\n原因："+entry.reason+
          "\n申請先送公司後端，Google 待同步成功後才會進入正式月檢視。主管核准前不會更動工時。");
        if(!yes)return;
        const result=receipt ?
          await window.OvertimeApi.update({id:receipt.id,receipt_token:receipt.receipt_token,hours:entry.hours,reason:entry.reason,overtime_type:entry.overtime_type}) :
          await window.OvertimeApi.submit({department:backendDepartment(entry.department),roster_key:entry.person.id,
            employee_name:entry.person.name,date:entry.date,hours:entry.hours,reason:entry.reason,overtime_type:entry.overtime_type});
        const saved=receipt ? true : window.OvertimeApi.save(result.record,result.receipt_token,entry.person.id);
        state.editKey="";
        showReceiptPage(result.record,entry,saved,receipt?receipt.receipt_token:result.receipt_token);
        return;
      }
      if (!hasGoogle()) {
        throw Error("Google 尚未授權，暫停正式加班申請寫入；不能以本機展示紀錄代替申請。");
      }
      // 正式申請只能建立待核准資料；這裡不可寫入 對應月表或註解。
      var ctx=await ensureMonth(entry);
      var yesOnline=await confirmAction("送出加班申請：\n"+
        dateString(entry.p)+" · "+entry.person.name+"\n"+formatHours(entry.hours)+
        "\n原因："+entry.reason+"\n主管核准前，不會寫入 對應月表。");
      if(!yesOnline)return;
      var outcome=await savePendingRequest(entry,ctx);
      message((outcome==="created"?"已建立申請":outcome==="updated"?"已更新申請":"申請內容沒有變更")+
        "，狀態「待核准」。主管可在業務加班月檢視查看，尚未寫入 對應月表。","success");
      state.editKey = "";
    } catch (e) {
      message(e.message + (hasGoogle() ? " 原始資料未被本網站刪除；若訊息提到部分寫入，請先核對表格。" : ""), "error");
    } finally {
      setBusy(false);
      updatePreview();
    }
  }
  function renderHistoryItems(entries, online) {
    var list = $("historyList");
    list.replaceChildren();
    if (!entries.length) {
      var none = document.createElement("div");
      none.className = "empty";
      none.textContent = online ? "目前所選員工在此月沒有登記時數。" : "本機目前沒有此人員的展示登記。";
      list.appendChild(none);
      return;
    }
    entries.forEach(function (entry) {
      var card = document.createElement("div");
      card.className = "history-card";
      var left = document.createElement("div");
      var heading = document.createElement("strong");
      heading.textContent = entry.date.replace(/-/g, "/") + "  " + (isCompReason(entry.reason)?"加班換補休":entry.kind) + " " + formatHours(entry.hours);
      markComp(heading,entry.reason);
      var detail = document.createElement("small");
      detail.textContent = (entry.status ? "【"+friendlyStatus(entry)+"】 " : "")+(entry.reason||"未填原因");
      if(PORTAL==="employee"&&entry.employee_name){
        const identity=document.createElement("small");
        identity.className="history-person";
        identity.textContent=(entry.employee_code?entry.employee_code+" ":"")+entry.employee_name;
        left.append(heading,identity,detail);
      }else left.append(heading,detail);
      if(PORTAL==="employee"){
        const status=document.createElement("span");
        status.className="history-status";
        status.textContent=friendlyStatus(entry)||"處理中";
        left.append(status);
        card.append(left);
        if(entry.remoteId&&canEmployeeCancel(entry.status)){
          const tokenRecord=window.OvertimeApi.localReceipts().find(x=>x.id===entry.remoteId);
          if(tokenRecord&&tokenRecord.receipt_token){
            const cancelBtn=document.createElement("button");
            cancelBtn.type="button";
            cancelBtn.textContent="取消申請";
            cancelBtn.className="history-cancel";
            cancelBtn.addEventListener("click",async function(){
              cancelBtn.disabled=true;
              try{await cancelOwnRequest(entry.remoteId,tokenRecord.receipt_token,entry.date,entry.employee_name||"");}
              finally{cancelBtn.disabled=false;}
            });
            card.append(cancelBtn);
          }
        }
        list.appendChild(card);
        return;
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = entry.status==="待同步"?"編輯":
        entry.status==="待核准"?"待核准":
        entry.status==="已核准"?"已核准":
        entry.status==="已駁回"||entry.status==="駁回待同步"?friendlyStatus(entry):
        entry.status||"編輯";
      btn.disabled = entry.remoteId ? entry.status!=="待同步" : entry.status==="已核准";
      btn.addEventListener("click", function () { editFromHistory(entry, online); });
      if(PORTAL==="employee"&&entry.remoteId&&canEmployeeCancel(entry.status)){
        const tokenRecord=window.OvertimeApi.localReceipts().find(x=>x.id===entry.remoteId);
        if(tokenRecord&&tokenRecord.receipt_token){
          const cancelBtn=document.createElement("button");
          cancelBtn.type="button";cancelBtn.textContent="取消申請";cancelBtn.className="history-cancel";
          cancelBtn.addEventListener("click",function(){
            void cancelOwnRequest(entry.remoteId,tokenRecord.receipt_token,entry.date,entry.employee_name||"");
          });
          const group=document.createElement("div");group.className="history-actions";
          group.append(btn,cancelBtn);
          card.append(left,group);
        }else card.append(left,btn);
      }else card.append(left,btn);
      list.appendChild(card);
    });
  }
  // The server-generated request_no embeds the real employee ID; public_key is a UUID.
  // Only compare the ID AFTER the server has verified this browser's receipt token.
  function employeeCodeFromRequestNo(requestNo){
    const match=/^BUS-[0-9]{8}-(?:E4|E5)-(.+)-[0-9A-F]{8}$/i.exec(String(requestNo||""));
    return match?match[1]:"";
  }
  var historyLookupCounter=0;
  async function refreshHistory() {
    if(PORTAL==="employee"){
      const sequence=++historyLookupCounter;
      const code=String($("ownEmployeeId").value||"").trim();
      const list=$("historyList"),summary=$("historySummary");
      list.replaceChildren();
      if(!code){
        summary.textContent="請先輸入自己的工號查詢。";
        return;
      }
      if(!window.OvertimeApi){
        summary.textContent="網站查詢元件未載入，請重新整理頁面。";
        return;
      }
      // Do not compare public_key to employee ID: public_key is a UUID, not a work number.
      const saved=window.OvertimeApi.localReceipts().filter(x=>x.id&&x.receipt_token);
      if(!saved.length){
        summary.textContent="這台瀏覽器沒有保存加班申請憑證。這不代表公司沒有登記紀錄；請使用原申請裝置查詢。";
        return;
      }
      const searchBtn=$("ownHistorySearch"),refreshBtn=$("refreshHistory");
      searchBtn.disabled=true;refreshBtn.disabled=true;
      summary.textContent="正在向公司後端核對本機加班申請…";
      try{
        const verified=[];
        let failed=0;
        // Batch reads prevent a busy shared device from sending 120 concurrent requests.
        for(let offset=0;offset<saved.length;offset+=8){
          const group=saved.slice(offset,offset+8);
          const results=await Promise.allSettled(group.map(x=>
            window.OvertimeApi.receipt(x.id,x.receipt_token)));
          if(sequence!==historyLookupCounter||code!==String($("ownEmployeeId").value||"").trim())return;
          results.forEach((result,i)=>{
            if(result.status!=="fulfilled"||!result.value.record||
               result.value.record.id!==group[i].id){failed++;return;}
            const record=result.value.record;
            const realId=employeeCodeFromRequestNo(record.request_no);
            if(!realId||realId.toUpperCase()!==code.toUpperCase())return;
            verified.push({
              date:record.date,kind:"加班",hours:record.hours,reason:record.reason,
              status:record.status,manager:record.manager,employee_code:realId,employee_name:record.employee_name,
              remoteId:record.id
            });
          });
        }
        verified.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
        renderHistoryItems(verified,false);
        summary.textContent=verified.length?"查詢完成，共 "+verified.length+" 筆加班申請。":
          "這台瀏覽器沒有此工號可驗證的加班紀錄，請確認工號及原申請裝置。";
        if(failed)summary.textContent+=" 部分本機憑證未能驗證，請稍後重新讀取。";
      }catch(e){
        if(sequence===historyLookupCounter)summary.textContent="查詢失敗："+e.message+"。請確認網路後重新讀取。";
      }finally{
        searchBtn.disabled=false;refreshBtn.disabled=false;
      }
      return;
    }
    var person = chosenPerson(), p = dateParts();
    if(!person){
      $("historyList").textContent="請先回「登記」選擇員工。";
      return;
    }
    if (!hasGoogle()) {
      var records = getDemoRecords().filter(function (r) {
        return r.id === person.id && r.department === $("department").value &&
          r.kind === "加班" && r.date && r.date.startsWith(String(p.y) + "-" + pad(p.m) + "-");
      }).sort(function (a, b) { return b.date.localeCompare(a.date); });
      renderHistoryItems(records, false);
      return;
    }
    $("historyList").textContent = "正在讀取 Google 試算表紀錄…";
    try {
      var all=await getValues(REGISTER_SHEET,"A2:R1500",true);
      var records2=all.filter(function(r){
        var d=serialToDate(r[1]);
        return r[5]===person.id && r[15]!=="已駁回" && d && d.y===p.y && d.m===p.m;
      }).map(function(r){
        var date=serialToDate(r[1]);
        return {p:date,date:isoString(date),id:person.id,department:String(r[4]||""),
          kind:"加班",hours:Number(r[7]),reason:String(r[8]||""),status:String(r[15]||"待核准")};
      }).sort(function(a,b){return b.date.localeCompare(a.date);});
      renderHistoryItems(records2, true);
    } catch (e) { $("historyList").textContent = "查詢失敗：" + e.message; }
  }
  async function ensureReadMonth() {
    if (!state.month || state.monthKey !== contextKey()) await loadMonth();
    if (!state.month) throw Error("沒有可查詢的月份表。");
  }
  async function editFromHistory(entry, online) {
    if ((entry.remoteId && entry.status!=="待同步") || (online && entry.status!=="待核准")) { message("申請已進入正式流程，不能自行修改。","warning"); return; }
    $("day").value = String(Number(entry.date.slice(-2)));
    $("hours").value = String(entry.hours);
    $("reason").value = stripCompReason(entry.reason);
    setOvertimeType(isCompReason(entry.reason)?"comp":"normal");
    // 待核准申請的原因直接來自申請來源表，不讀取 對應月表註解。
    state.editKey = entry.remoteId || (entry.date + "|" + entry.kind + "|" + entry.id);
    updatePreview();
    switchView("entry");
    $("reason").focus({ preventScroll: true });
  }
  function connectGoogle() {
    var clientId = $("clientId").value.trim();
    if (!/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(clientId)) {
      message("請先填入有效的 Google OAuth 網頁用戶端 ID。", "error");
      return;
    }
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      message("Google 登入元件尚未載入，請檢查網路或阻擋第三方登入的瀏覽器設定。", "error");
      return;
    }
    localStorage.setItem(CLIENT_KEY, clientId);
    clearMessage();
    state.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: "openid email https://www.googleapis.com/auth/spreadsheets",
      callback: async function (response) {
        if (!response || !response.access_token) {
          message("Google 登入失敗：" + (response && response.error || "未取得授權"), "error");
          return;
        }
        var selectedBeforeSignIn=chosenPerson();
        var previousName=selectedBeforeSignIn&&selectedBeforeSignIn.preview?selectedBeforeSignIn.name:"";
        state.token = response.access_token;
        updateMode();
        message("已取得 Google 授權，正在讀取人員主檔與日期…", "");
        try {
          await loadConnectionData(previousName);
          if (PORTAL==="admin") {
            switchView("settings");
            message("Google 已授權；目前維持在管理員設定頁。正式核准寫入仍需完成驗收。", "warning");
          } else if (approvalId) {
            await loadApprovalRequest();
          } else if(batchMode) {
            switchView("batch");
          } else {
            switchView("entry");
            if (state.month) message("Google 已連線，業務申請只會進入待核准清單。", "success");
            else message("Google 已授權，但目前所選月份尚未建立；請檢查日期。", "warning");
          }
        } catch (e) {
          // 尚未成功讀到名冊前，不應讓畫面看起來可以正式寫入。
          state.token = null;
          state.metadata = null;
          state.roster = [];
          state.month = null;
          updateMode();
          message("Google 授權成功，但試算表資料載入失敗：" + e.message, "error");
        }
      },
      error_callback: function (err) {
        message("Google 授權視窗未完成：" + (err && err.type || "未知錯誤"), "error");
      }
    });
    state.tokenClient.requestAccessToken({ prompt: "consent" });
  }
  function disconnectGoogle() {
    var old = state.token;
    state.token = null;
    state.tokenClient = null;
    state.metadata = null;
    state.roster = [];
    state.month = null;
    state.monthKey = "";
    batchActor="";batchRows=[];selectedIds.clear();
    if($("batchList")) $("batchList").replaceChildren();
    if($("batchState")) $("batchState").textContent="已登出 Google，主管資料已從畫面清除。";
    if($("batchCount")) $("batchCount").textContent="待核准 0 筆";
    ++state.loadId;
    if (old && window.google && window.google.accounts && window.google.accounts.oauth2) {
      window.google.accounts.oauth2.revoke(old, function () {});
    }
    updateMode();
    message("已登出 Google 連線，已切回展示模式。", "");
  }
  function bindEvents() {
    document.querySelectorAll("[data-view]").forEach(function (btn) {
      btn.addEventListener("click", function () { switchView(btn.dataset.view); });
    });
    function syncQuickHours(){
      var selected=Number($("hours").value);
      document.querySelectorAll(".quick-hours [data-hour]").forEach(function(btn){
        var active=$("hours").value!=="" && selected===Number(btn.dataset.hour);
        btn.classList.toggle("is-selected",active);
        btn.setAttribute("aria-pressed",String(active));
      });
    }
    document.querySelectorAll(".quick-hours [data-hour]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        $("hours").value = btn.dataset.hour;
        syncQuickHours();
        updatePreview();
      });
    });
    $("hours").addEventListener("input", syncQuickHours);
    syncQuickHours();
    $("year").addEventListener("change", function () { renderDays(); loadMonth(); });
    $("month").addEventListener("change", function () { renderDays(); loadMonth(); });
    $("day").addEventListener("change", updatePreview);
    if (PORTAL === "employee" && $("datePicker")) {
      $("datePicker").addEventListener("change",function(){chooseCalendarDate($("datePicker").value);});
    }
    $("department").addEventListener("change", function () { populateEmployees(); loadMonth(); });
    $("employee").addEventListener("change", updatePreview);
    $("hours").addEventListener("input", updatePreview);
    $("reason").addEventListener("input", updatePreview);
    document.querySelectorAll('input[name="overtimeType"]').forEach(function(input){input.addEventListener("change",updatePreview);});
    $("entryForm").addEventListener("submit", submitEntry);
    if(PORTAL==="employee"){
      $("receiptCancel").addEventListener("click",function(){
        if(latestReceipt)void cancelOwnRequest(latestReceipt.id,latestReceipt.token,
          $("receiptDate").textContent,$("receiptEmployee").textContent);
      });
      $("receiptRefresh").addEventListener("click",refreshReceiptStatus);
      $("receiptHistory").addEventListener("click",function(){switchView("history");});
      $("receiptNew").addEventListener("click",newReceiptEntry);
      $("receiptCopy").addEventListener("click",async function(){
        var value=$("receiptNo").textContent;
        try{
          if(!navigator.clipboard||!navigator.clipboard.writeText)throw Error("Clipboard unavailable");
          await navigator.clipboard.writeText(value);
          $("receiptRefreshed").textContent="申請編號已複製。";
        }catch(e){
          window.prompt("請複製申請編號：",value);
        }
      });
    }
    if(PORTAL==="employee"){
      $("ownHistoryForm").addEventListener("submit",function(e){
        e.preventDefault();
        void refreshHistory();
      });
      $("ownEmployeeId").addEventListener("input",function(){
        ++historyLookupCounter;
        $("historyList").replaceChildren();
        $("historySummary").textContent="請按「查詢紀錄」核對這個工號的申請。";
      });
    }
    $("refreshHistory").addEventListener("click",refreshHistory);
    document.addEventListener("supervisor-auth-change",function(){
      if(approvalId)loadApprovalRequest();
      else if(!$("view-batch").classList.contains("hidden"))refreshBatchQueue();
    });
    $("batchRefresh").addEventListener("click",refreshBatchQueue);
    $("batchApproveBtn").addEventListener("click",function(){processBatch("approve");});
    $("batchRejectBtn").addEventListener("click",function(){processBatch("reject");});
    $("batchSelectAll").addEventListener("change",function(){
      if(!batchActor)return;
      selectedIds.clear();
      if($("batchSelectAll").checked)batchRows.forEach(function(r){selectedIds.add(String(r[0]));});
      renderBatchQueue();
    });
    $("connectBtn").addEventListener("click", connectGoogle);
    $("disconnectBtn").addEventListener("click", disconnectGoogle);
    $("clearDemo").addEventListener("click", async function () {
      if (!await confirmAction("這只會刪除本機的展示紀錄，不會更動 Google 試算表。\n確定清除嗎？")) return;
      localStorage.removeItem(DEMO_KEY);
      message("本機展示紀錄已清除。Google 試算表未受影響。", "success");
    });
  }
  function init() {
    initDates();
    $("department").value = "E5";
    $("clientId").value = localStorage.getItem(CLIENT_KEY) || "";
    bindEvents();
    updateMode();
    updatePreview();
    if(PORTAL==="employee")loadBackendRoster();
  }
  // 來源表的「主管核准」連結導向這個審核頁.
  var originalInit=init;
  init=function(){
    // 保留舊 Google Sheets 逐筆連結的可用性，轉向新的主管專屬網頁。
    if(PORTAL==="employee"&&(approvalId||parameters.get("review")==="1")){
      const url=new URL("./supervisor/",window.location.href);
      url.search=window.location.search;
      window.location.replace(url.href);
      return;
    }
    originalInit();
    $("approveBtn").addEventListener("click",approvePending);
    $("rejectBtn").addEventListener("click",rejectPending);
    if(approvalId&&PORTAL==="supervisor")loadApprovalRequest();
    else if(PORTAL==="supervisor")switchView("batch");
    else if(PORTAL==="admin")switchView("settings");
  };
  document.addEventListener("DOMContentLoaded", init);
})();
