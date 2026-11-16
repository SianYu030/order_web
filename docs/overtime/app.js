/* 業務假日或臨時加班登記 V1.1.1 · GitHub Pages + Google Sheets API
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
  // 正式主管帳號尚未經使用者指定。空清單代表核准功能鎖定。
  // 前端白名單只能防一般誤操作，正式上線必須使用可驗證權限的後端處理核准。
  var APPROVER_EMAILS = [];
  var approvalId = new URLSearchParams(window.location.search).get("approve") || "";
  var CLIENT_KEY = "overtime:oauth-client-id:v1";
  var DEMO_KEY = "overtime:demo-records:v1";
  var COMMENT_TAG = "\n\n［加班登記網站］";
  var DEPT_SUFFIX = { "E3": "E3", "E4": "E4", "W8": "w8", "W8整修": "w8整修股", "E5": "E5機修課" };
  var DEPT_LABEL = { "E3": "E3 門板", "E4": "E4 櫃體", "W8": "W8", "W8整修": "W8 整修股", "E5": "E5 業務" };
  var KINDS = { "加班": 1 }; // 原月表每日五欄，固定使用第 2 欄「加班」；不修改支援或班別
  var WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  var state = {
    token: null, tokenClient: null, metadata: null, roster: [],
    kind: "加班", month: null, monthKey: "", loadId: 0, busy: false, editKey: ""
  };
  var $ = function (id) { return document.getElementById(id); };

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
    $("submitBtn").textContent = isBusy ? "處理中，請勿重複送出…" : (state.token ? "送出加班申請（待核准）" : "儲存展示申請");
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
  function demoRoster() {
    return [
      { id: "D001", name: "示範員工 A", company: "展示", unit: "E3", detail: "展示用" },
      { id: "D002", name: "示範員工 B", company: "展示", unit: "E4", detail: "展示用" },
      { id: "D003", name: "示範員工 C", company: "展示", unit: "W8", detail: "展示用" },
      { id: "D004", name: "示範員工 D", company: "展示", unit: "W8整修", detail: "展示用" },
      { id: "D005", name: "示範業務員", company: "展示", unit: "內勤", detail: "業務" }
    ];
  }
  function belongsToDept(person, dept) {
    if (dept === "E5") return person.unit === "內勤" && person.detail === "業務";
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
    renderDays(today.d);
  }
  function renderDays(preferred) {
    var d = $("day"), selected = preferred || Number(d.value) || 1;
    var last = new Date(Number($("year").value), Number($("month").value), 0).getDate();
    d.replaceChildren();
    for (var n = 1; n <= last; n++) selectOption(d, String(n), n + " 日");
    d.value = String(Math.min(Math.max(1, selected), last));
    updatePreview();
  }
  function getPeople() { return hasGoogle() ? state.roster : demoRoster(); }
  function populateEmployees() {
    var currentId = $("employee").value, dept = $("department").value;
    var selected = getPeople().filter(function (p) { return belongsToDept(p, dept); });
    var field = $("employee");
    field.replaceChildren();
    selectOption(field, "", selected.length ? "請選擇員工" : "目前沒有此單位的在職名冊");
    selected.forEach(function (p) {
      selectOption(field, p.id, p.id + " · " + p.name + (p.detail && dept === "E5" ? "（" + p.detail + "）" : ""));
    });
    if (selected.some(function (p) { return p.id === currentId; })) field.value = currentId;
    $("rosterText").textContent = hasGoogle() ?
      "已從人員主檔讀取在職業務人員，以完整工號比對。" :
      "目前為虛構測試名單，正式登入後只讀取業務人員資料。";
    updatePreview();
  }
  function chosenPerson() {
    return getPeople().find(function (p) { return p.id === $("employee").value && belongsToDept(p, $("department").value); }) || null;
  }
  function updateMode() {
    var online = hasGoogle();
    $("connectionStatus").textContent = online ? "Google 已連線" : "展示模式";
    $("connectionStatus").className = "pill status-pill" + (online ? " connected" : "");
    $("modeNotice").textContent = online ?
      "已登入 Google。送出只會建立「待核准」紀錄，不會修改 E5 原月表。" :
      "目前為展示模式，填寫內容只儲存在這台裝置，不會寫入公司試算表。需在「設定」完成 Google OAuth 授權才能正式同步。";
    $("modeNotice").className = online ? "notice" : "notice warning";
    $("submitHint").textContent = online ?
      "送出申請後，先顯示於業務加班月檢視；主管核准前不寫入 E5 月表。" :
      "展示資料只會儲存在本機，不會傳送至 Google。";
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
    $("summaryWhen").textContent = dateString(p) + " · " + (DEPT_LABEL[$("department").value] || "");
    $("summaryWho").textContent = person ? person.id + " · " + person.name : "請選擇員工";
    $("summaryKind").textContent = "加班 " + (numberOrNull($("hours").value) || 0) + " 小時";
    var cell = a1Col(colIndex(p.d, state.kind));
    var row = state.month && state.monthKey === contextKey() ? state.month.employeeRows.get($("employee").value) : null;
    $("summaryCell").textContent = cell + (row ? row : " · 待確認列號");
    $("summaryLunch").textContent = getLunchPreview(p, numberOrNull($("hours").value) || 0);
  }
  function switchView(name) {
    document.querySelectorAll(".tab").forEach(function (btn) {
      var yes = btn.dataset.view === name;
      btn.classList.toggle("is-active", yes);
      btn.setAttribute("aria-selected", yes ? "true" : "false");
    });
    document.querySelectorAll(".view").forEach(function (s) { s.classList.add("hidden"); });
    $("view-" + name).classList.remove("hidden");
    clearMessage();
    if (name === "history") refreshHistory();
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
    if (!person) throw Error("請先選擇正確的員工。");
    if (hours === null || hours < 0.5 || hours > 24 || Math.round(hours * 2) !== hours * 2) throw Error("時數須為 0.5 至 24 小時，且以半小時為單位。");
    if (!reason) throw Error("請填寫加班原因／備註。");
    if (reason.length > 1600) throw Error("原因文字過長，請控制在 1600 字內。");
    return {
      p: p, date: isoString(p), department: $("department").value, person: person, id: person.id,
      kind: "加班", hours: hours, reason: reason
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
  async function loadConnectionData() {
    var meta = await api(BASE + "?fields=sheets(properties(sheetId,title,hidden,gridProperties(columnCount))),properties(timeZone)");
    state.metadata = meta.sheets || [];
    var rows = await getValues(MASTER, "A4:H200", false);
    state.roster = rows.filter(function (r) {
      return r[0] && r[1] && r[5] === "在職";
    }).map(function (r) {
      return { id: String(r[0]).trim(), name: r[1], company: r[2] || "", unit: r[3] || "", detail: r[4] || "" };
    });
    if (!state.roster.length) throw Error("原始試算表已連結，但未取得在職員工名冊。");
    populateEmployees();
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

  // 申請資料先存入隱藏來源表，原 E5 月表在主管核准前完全不寫。
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
  function buildPendingRecord(entry,ctx,existing,now) {
    var old=existing||[],created=old[12]||now;
    return [supervisorRecordId(entry),sheetsDateNumber(entry.p),entry.p.y,entry.p.m,
      "E5",entry.id,entry.person.name,entry.hours,entry.reason,
      "待核准",ctx.sheetName,ctx.range,created,now,"GitHub 網站","待核准","",""];
  }
  // 資料位於 A2:R1500 的預先格式化區。精準寫入第一個空白列，不使用
  // appendCells 往表尾延伸，避免超出月檢視的讀取範圍。
  var PENDING_LAST_ROW = 1500;
  function findPendingRecord(records,id) {
    if (!/^BUS-[0-9]{8}-E5-[A-Za-z0-9]+$/.test(id)) throw Error("申請編號格式不正確。");
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
    if(entry.department!=="E5" || !entry.person ||
      !belongsToDept(entry.person,"E5") || String(entry.person.id)!==String(entry.id))
      throw Error("只能登記原始名冊中的 E5 業務人員，請重新選擇。");
    var id=supervisorRecordId(entry);
    var all=await getValues(REGISTER_SHEET,"A2:R1500",true);
    var prior=findPendingRecord(all,id);
    if(prior && prior.row[15]!=="待核准") throw Error("此申請已不是待核准，禁止自行修改；請聯繫主管。");
    if(prior && String(prior.row[6])===entry.person.name &&
       Number(prior.row[7])===entry.hours && String(prior.row[8])===entry.reason &&
       String(prior.row[10])===ctx.sheetName && String(prior.row[11])===ctx.range)
      return "unchanged";
    var rowIndex=prior?prior.rowIndex:firstPendingEmptyRow(all);
    var now=taiwanDateTimeNumber(),row=buildPendingRecord(entry,ctx,prior&&prior.row,now);
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
    $("approvalStatus").textContent=String(r[15]||"未知");
  }
  async function loadApprovalRequest() {
    switchView("approval");
    $("approveBtn").disabled=true;
    if(!hasGoogle()){
      $("approvalState").textContent="請先到「設定」使用 Google 帳號登入，才能檢視主管核准申請。";
      return;
    }
    try {
      var found=await getPendingById(approvalId);
      if(!found)throw Error("查無此筆申請，請重新開啟工作表的核准連結。");
      fillApprovalSummary(found.row);
      if(found.row[15]!=="待核准"){
        $("approvalState").textContent="這筆申請目前為「"+found.row[15]+"」，不可重複核准。";return;
      }
      if(APPROVER_EMAILS.length===0){
        $("approvalState").textContent="主管授權尚未設定。已完成待核准檢視，正式核准仍鎖定，避免一般員工擅自寫入 E5 月表。";return;
      }
      var email=await googleIdentity();
      if(!APPROVER_EMAILS.includes(email))throw Error("目前登入帳號不是授權主管。");
      $("approvalState").textContent="授權主管："+email+"。請確認日期、工號、時數及原因後核准。";
      $("approveBtn").disabled=false;
    } catch(e){$("approvalState").textContent="無法核准："+e.message;}
  }
  async function locateApprovedCell(row) {
    var p=serialToDate(row[1]),id=String(row[5]||"");
    if(!p || p.y!==Number(row[2]) || p.m!==Number(row[3]))
      throw Error("申請日期／年份／月份不一致。");
    if(String(row[4])!=="E5")throw Error("申請不是 E5 業務。");
    var person=state.roster.find(function(x){
      return x.id===id && x.name===String(row[6]) && x.detail==="業務" && x.unit==="內勤";
    });
    if(!person)throw Error("原始人員主檔中的業務工號／姓名不一致。");
    var shName=p.m+"月份E5機修課";
    var sheet=(state.metadata||[]).find(function(x){return x.properties&&x.properties.title===shName;});
    if(!sheet || sheet.properties.hidden)throw Error("對應 E5 月表不存在或已封存。");
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
  async function approvePending() {
    if(state.busy || !approvalId || !hasGoogle())return;
    setBusy(true);
    $("approveBtn").disabled=true;
    try{
      if(!APPROVER_EMAILS.length)throw Error("沒有設定授權主管帳號，核准功能維持鎖定。");
      var email=await googleIdentity();
      if(!APPROVER_EMAILS.includes(email))throw Error("目前登入者不是授權主管。");
      var item=await getPendingById(approvalId);
      if(!item || String(item.row[15])!=="待核准")throw Error("這筆申請已經核准或不存在，請勿重複送出。");
      var row=item.row,ctx=await locateApprovedCell(row);
      var hours=Number(row[7]),reason=String(row[8]||"").trim();
      if(!(hours>=0.5&&hours<=24&&Math.round(hours*2)===hours*2)||!reason)
        throw Error("申請時數或原因不完整。");
      var before=await getValues(ctx.sheetName,ctx.range,true);
      var previous=before[0]&&before[0][0];
      if(previous!=="" && previous!==undefined && previous!==null && Number(previous)!==0)
        throw Error("原 E5 月表「"+ctx.range+"」已有 "+previous+" 小時，為防覆蓋已停止核准。");
      var comments=await getCommentsAt(ctx);
      if(comments.some(function(x){return x.headPost&&isOurComment(x.headPost.content);}))
        throw Error("此格已經有網站建立的註解，請人工核對避免重複。");
      var okay=await confirmAction("主管核准後將正式寫入：\n"+ctx.sheetName+"!"+ctx.range+
        "\n姓名："+row[6]+"\n工號："+row[5]+"\n時數："+hours+" 小時\n原因："+reason+
        "\n是否確認？");
      if(!okay)return;
      // 再讀回待核准，避免重複點擊或在確認畫面期間已被他人處理。
      var check=await getPendingById(approvalId);
      if(!check || check.row[15]!=="待核准" ||
        Number(check.row[7])!==hours || String(check.row[8])!==reason)
        throw Error("申請內容在確認期間已變更，請重新開啟核准頁面。");
      var answer=await api(BASE+":batchUpdate","POST",{requests:[
        updateCellRequest(ctx,ctx.col,hours),
        {insertComment:{content:commentContent(reason),coordinate:{sheetId:ctx.sheetId,rowIndex:ctx.rowIndex,columnIndex:ctx.col}}}
      ]});
      var actual=await getValues(ctx.sheetName,ctx.range,true);
      if(Number(actual[0]&&actual[0][0])!==hours)throw Error("E5 月表寫入未通過核對。");
      if(answer.commentUpdateState && answer.commentUpdateState!=="ALL_SAVED")
        throw Error("E5 時數可能已寫入，但註解 API 回報 "+answer.commentUpdateState+"；請人工核對。");
      var fresh=await getCommentsAt(ctx);
      if(!fresh.some(function(c){return c.headPost&&c.headPost.content===commentContent(reason);}))
        throw Error("E5 時數已寫入，但尚未驗證註解成功；不得標記為已核准。");
      var now=taiwanDateTimeNumber(),index=check.rowIndex;
      await api(BASE+":batchUpdate","POST",{requests:[
        {updateCells:{start:{sheetId:REGISTER_SHEET_ID,rowIndex:index,columnIndex:9},
          rows:[{values:["已同步",ctx.sheetName,ctx.range].map(cellValue)}],fields:"userEnteredValue"}},
        {updateCells:{start:{sheetId:REGISTER_SHEET_ID,rowIndex:index,columnIndex:15},
          rows:[{values:["已核准",email,now].map(cellValue)}],fields:"userEnteredValue"}}
      ]});
      var final=await getPendingById(approvalId);
      if(!final||final.row[15]!=="已核准")throw Error("時數與註解已完成，但核准狀態尚未核對。");
      fillApprovalSummary(final.row);
      $("approvalState").textContent="核准完成：已確認寫入 "+ctx.sheetName+"!"+ctx.range+" 並建立加班註解。";
      message("主管核准完成，E5 月表時數及註解已讀回核對。","success");
    }catch(e){
      $("approvalState").textContent="核准未完成："+e.message+
        "。若已出現部分寫入，請先查核 E5 月表，禁止直接重複核准。";
    }finally{setBusy(false);$("approveBtn").disabled=true;}
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
      if (!hasGoogle()) {
        var yes = await confirmAction("展示模式，不會寫入公司試算表。\n" + dateString(entry.p) + " · " + entry.person.name +
          "\n" + entry.kind + " " + formatHours(entry.hours) + "\n原因：" + (entry.reason || "未填"));
        if (!yes) return;
        saveDemoRecord(entry);
        message("展示申請已儲存在本機，不會寫入月檢視或 E5 月表。", "success");
        state.editKey = "";
        return;
      }
      // 正式申請只能建立待核准資料；這裡不可寫入 E5 月表或註解。
      var ctx=await ensureMonth(entry);
      var yesOnline=await confirmAction("送出加班申請：\n"+
        dateString(entry.p)+" · "+entry.person.name+"\n"+formatHours(entry.hours)+
        "\n原因："+entry.reason+"\n主管核准前，不會寫入 E5 月表。");
      if(!yesOnline)return;
      var outcome=await savePendingRequest(entry,ctx);
      message((outcome==="created"?"已建立申請":outcome==="updated"?"已更新申請":"申請內容沒有變更")+
        "，狀態「待核准」。主管可在業務加班月檢視查看，尚未寫入 E5 月表。","success");
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
      heading.textContent = entry.date.replace(/-/g, "/") + "  " + entry.kind + " " + formatHours(entry.hours);
      var detail = document.createElement("small");
      detail.textContent = (entry.status ? "【"+entry.status+"】 " : "")+(entry.reason||"未填原因");
      left.append(heading, detail);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = entry.status==="已核准"?"已核准":"編輯";
      btn.disabled = entry.status==="已核准";
      btn.addEventListener("click", function () { editFromHistory(entry, online); });
      card.append(left, btn);
      list.appendChild(card);
    });
  }
  async function refreshHistory() {
    var person = chosenPerson(), p = dateParts();
    if (!person) {
      $("historyList").textContent = "請先回「登記」選擇員工。";
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
        return r[5]===person.id && d && d.y===p.y && d.m===p.m;
      }).map(function(r){
        var date=serialToDate(r[1]);
        return {p:date,date:isoString(date),id:person.id,department:"E5",
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
    if (online && entry.status!=="待核准") { message("此筆已完成核准，無法直接修改。","warning"); return; }
    $("day").value = String(Number(entry.date.slice(-2)));
    $("hours").value = String(entry.hours);
    $("reason").value = entry.reason || "";
    // 待核准申請的原因直接來自申請來源表，不讀取 E5 月表註解。
    state.editKey = entry.date + "|" + entry.kind + "|" + entry.id;
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
        state.token = response.access_token;
        updateMode();
        message("已取得 Google 授權，正在讀取人員主檔與日期…", "");
        try {
          await loadConnectionData();
          if (approvalId) {
            await loadApprovalRequest();
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
    document.querySelectorAll("[data-hour]").forEach(function (btn) {
      btn.addEventListener("click", function () { $("hours").value = btn.dataset.hour; updatePreview(); });
    });
    $("year").addEventListener("change", function () { renderDays(); loadMonth(); });
    $("month").addEventListener("change", function () { renderDays(); loadMonth(); });
    $("day").addEventListener("change", updatePreview);
    $("department").addEventListener("change", function () { populateEmployees(); loadMonth(); });
    $("employee").addEventListener("change", updatePreview);
    $("hours").addEventListener("input", updatePreview);
    $("entryForm").addEventListener("submit", submitEntry);
    $("refreshHistory").addEventListener("click", refreshHistory);
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
  }
  // 來源表的「主管核准」連結導向這個審核頁。
  var originalInit=init;
  init=function(){
    originalInit();
    $("approveBtn").addEventListener("click",approvePending);
    if(approvalId)loadApprovalRequest();
  };
  document.addEventListener("DOMContentLoaded", init);
})();
