/* 加班／請假登記 V1.0.0 · GitHub Pages + Google Sheets API
 * 安全原則：只以 Google OAuth 的授權身分存取原始表，不把工作表內容或 OAuth token 寫入 GitHub。
 * 正式資料操作需有該試算表的「編輯者」權限；展示模式永不呼叫 Google API。
 */
(function () {
  "use strict";
  var SPREADSHEET_ID = "1yx_QWF4CFiRYn1Fp4osMjBAkX97_0QQu03yGJIpteLM";
  var BASE = "https://sheets.googleapis.com/v4/spreadsheets/" + SPREADSHEET_ID;
  var MASTER = "系統櫃人員主檔（新版）";
  var CLIENT_KEY = "overtime:oauth-client-id:v1";
  var DEMO_KEY = "overtime:demo-records:v1";
  var COMMENT_TAG = "\n\n［加班登記網站］";
  var DEPT_SUFFIX = { "E3": "E3", "E4": "E4", "W8": "w8", "W8整修": "w8整修股", "E5": "E5機修課" };
  var DEPT_LABEL = { "E3": "E3 門板", "E4": "E4 櫃體", "W8": "W8", "W8整修": "W8 整修股", "E5": "E5／機修課／業務／內勤" };
  var KINDS = { "請假": 0, "加班": 1, "支援": 2 };
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
    $("submitBtn").textContent = isBusy ? "處理中，請勿重複送出…" : (state.token ? "確認並同步試算表" : "儲存展示登記");
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
      { id: "D005", name: "示範員工 E", company: "展示", unit: "內勤", detail: "展示用" }
    ];
  }
  function belongsToDept(person, dept) {
    if (dept === "E5") return ["五金備料", "機修課", "內勤"].includes(person.unit);
    return person.unit === dept;
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
      "已讀取 Google 試算表主檔的在職名單，使用完整工號比對。" :
      "目前為虛構測試名單，不會在公開網站載入真實員工資料。";
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
      "已授權使用 Google 試算表。送出後會直接修改現有月份表格，請再次核對日期、人員與時數。" :
      "目前為展示模式，填寫內容只儲存在這台裝置，不會寫入公司試算表。需在「設定」完成 Google OAuth 授權才能正式同步。";
    $("modeNotice").className = online ? "notice" : "notice warning";
    $("submitHint").textContent = online ?
      "正式同步模式：提交前會確認舊值，寫入後再讀回檢查。" :
      "展示資料只會儲存在本機，不會傳送至 Google。";
    $("settingsState").textContent = online ? "連線有效。資料存取取決於目前 Google 帳號的試算表權限。" : "尚未連接 Google。";
    setBusy(false);
    populateEmployees();
  }
  function setKind(kind) {
    state.kind = kind;
    document.querySelectorAll("[data-kind]").forEach(function (btn) {
      var active = btn.dataset.kind === kind;
      btn.classList.toggle("selected", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    $("hoursLabel").textContent = kind + "時數";
    $("reasonRequired").classList.toggle("hidden", kind === "請假");
    updatePreview();
  }
  function getDayType(p) {
    if (hasGoogle() && state.month && state.monthKey === contextKey()) {
      var cell = state.month.dayTypes[5 * (p.d - 1) + 4];
      if (cell === "一般" || cell === "假日") return cell;
    }
    return dayOfWeek(p) === 0 || dayOfWeek(p) === 6 ? "假日（預估）" : "一般（預估）";
  }
  function getLunchPreview(p, n) {
    if (state.kind === "請假") return "不適用";
    if ($("shift").value === "中") return "中班，原表自動判定";
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
    $("summaryKind").textContent = state.kind + " " + (numberOrNull($("hours").value) || 0) + " 小時 · " + ($("shift").value === "中" ? "中班" : "早班");
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
    if (!p.y || !p.m || !p.d || p.d > new Date(p.y, p.m, 0).getDate()) throw Error("請選擇正確登記日期。");
    if (!person) throw Error("請先選擇正確的員工。");
    if (hours === null || hours < 0.5 || hours > 24 || Math.round(hours * 2) !== hours * 2) throw Error("時數須為 0.5 至 24 小時，且以半小時為單位。");
    if (!reason && state.kind !== "請假") throw Error("加班或支援登記必須填寫原因／備註。");
    if (reason.length > 1600) throw Error("原因文字過長，請控制在 1600 字內。");
    return {
      p: p, date: isoString(p), department: $("department").value, person: person, id: person.id,
      kind: state.kind, hours: hours, shift: $("shift").value, reason: reason
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
        message("展示紀錄已儲存在本機。這不是正式加班登記，也未寫入 Google。", "success");
        state.editKey = "";
        return;
      }
      var ctx = await ensureMonth(entry);
      var oldRows = await getValues(ctx.sheetName, ctx.range, true);
      var oldValue = oldRows[0] && oldRows[0][0];
      var existingComments = await getCommentsAt(ctx);
      var current = findOurComment(existingComments);
      var oldReason = current ? reasonFromComment(current.post.content) : "";
      var conflict = oldValue !== undefined && oldValue !== "" ? "\n注意：原格已填 " + oldValue + " 小時，本次會更新該格。" : "";
      var yesOnline = await confirmAction(
        "將寫入正式 Google 試算表：\n" + dateString(entry.p) + " · " + entry.person.name +
        "\n" + entry.kind + " " + formatHours(entry.hours) +
        "\n原因：" + (entry.reason || "未填") +
        "\n位置：" + ctx.sheetName + "!" + ctx.range +
        (oldReason ? "\n原網站備註：" + oldReason : "") + conflict
      );
      if (!yesOnline) return;
      var requests = [updateCellRequest(ctx, ctx.col, entry.hours), updateCellRequest(ctx, 6 + 5 * (entry.p.d - 1) + 3, entry.shift)];
      var needsComment = !!entry.reason || !!current;
      if (needsComment) requests.push(commentRequest(entry.reason, existingComments, ctx));
      var resp = await api(BASE + ":batchUpdate", "POST", { requests: requests });
      var resultValues = await getValues(ctx.sheetName, ctx.range, true);
      var actualHours = numberOrNull(resultValues[0] && resultValues[0][0]);
      if (actualHours !== entry.hours) throw Error("Google 已回應，但讀回時數不同。請先開啟試算表確認，不要重複送出。");
      if (needsComment) {
        if (resp.commentUpdateState === "ALL_FAILED_UNKNOWN_REASON") throw Error("加班時數已寫入，但 Google 回報註解儲存失敗，請勿直接重複送出。");
        var freshComments = await getCommentsAt(ctx);
        var foundNote = freshComments.some(function (c) {
          if (c.headPost && c.headPost.content === commentContent(entry.reason)) return true;
          return (c.replies || []).some(function (r) { return r.content === commentContent(entry.reason); });
        });
        if (!foundNote) throw Error("加班時數已寫入，但註解尚未讀回驗證，請到原試算表確認。");
      }
      message("正式同步成功：" + dateString(entry.p) + " " + entry.person.name + " " +
        entry.kind + " " + formatHours(entry.hours) + "，時數" +
        (needsComment ? "及註解" : "") + "已讀回核對。", "success");
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
      detail.textContent = entry.shift + "班" + (entry.reason ? " · " + entry.reason : (online ? " · 註解點編輯後讀取" : ""));
      left.append(heading, detail);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "編輯";
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
          r.date && r.date.startsWith(String(p.y) + "-" + pad(p.m) + "-");
      }).sort(function (a, b) { return b.date.localeCompare(a.date); });
      renderHistoryItems(records, false);
      return;
    }
    $("historyList").textContent = "正在讀取 Google 試算表紀錄…";
    try {
      await ensureReadMonth();
      var row = state.month.employeeRows.get(person.id);
      if (!row) throw Error("月份表找不到此員工工號。");
      var days = new Date(p.y, p.m, 0).getDate();
      var raw = await getValues(state.month.sheetName, "G" + row + ":" + a1Col(6 + days * 5 - 1) + row, false);
      var cells = raw[0] || [], records2 = [];
      for (var d = 1; d <= days; d++) {
        for (var kind of ["加班", "支援", "請假"]) {
          var offset = (d - 1) * 5;
          var hours = numberOrNull(cells[offset + KINDS[kind]]);
          if (hours !== null && hours > 0) {
            records2.push({
              p: { y: p.y, m: p.m, d: d }, date: String(p.y) + "-" + pad(p.m) + "-" + pad(d),
              id: person.id, department: $("department").value, kind: kind, hours: hours,
              shift: cells[offset + 3] === "中" ? "中" : "早", reason: ""
            });
          }
        }
      }
      records2.sort(function (a, b) { return b.date.localeCompare(a.date); });
      renderHistoryItems(records2, true);
    } catch (e) { $("historyList").textContent = "查詢失敗：" + e.message; }
  }
  async function ensureReadMonth() {
    if (!state.month || state.monthKey !== contextKey()) await loadMonth();
    if (!state.month) throw Error("沒有可查詢的月份表。");
  }
  async function editFromHistory(entry, online) {
    $("day").value = String(Number(entry.date.slice(-2)));
    setKind(entry.kind);
    $("hours").value = String(entry.hours);
    $("shift").value = entry.shift || "早";
    $("reason").value = entry.reason || "";
    if (online) {
      try {
        await ensureReadMonth();
        var ctx = makeCellContext({ p: dateParts(), id: entry.id, kind: entry.kind });
        var comments = await getCommentsAt(ctx), found = findOurComment(comments);
        $("reason").value = found ? reasonFromComment(found.post.content) : "";
      } catch (e) { message("註解讀取失敗：" + e.message, "warning"); }
    }
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
      client_id: clientId, scope: "https://www.googleapis.com/auth/spreadsheets",
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
          switchView("entry");
          if (state.month) message("Google 試算表已連線，月份及工號定位成功。", "success");
          else message("Google 已授權，但目前所選月份或廠別尚未完成對應；此狀態無法寫入。請檢查日期後再試。", "warning");
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
    document.querySelectorAll("[data-kind]").forEach(function (btn) {
      btn.addEventListener("click", function () { setKind(btn.dataset.kind); });
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
    $("shift").addEventListener("change", updatePreview);
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
    setKind("加班");
    updatePreview();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
