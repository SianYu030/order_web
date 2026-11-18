// Read-only assertions for supervisor review and rejection; no genuine approvals or writes.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync("overtime/supervisor/index.html","utf8");
const app=readFileSync("overtime/app.js","utf8");
const front=readFileSync("overtime/overtime-client.js","utf8");
const css=readFileSync("overtime/style.css","utf8");
assert(html.includes("主管登入後可直接查看後端審核清單，不需另做瀏覽器 Google OAuth"));
assert(html.includes('<div class="section-heading legacy-google-batch">'));
assert(html.includes('<section class="panel legacy-google-batch">'));
assert(css.includes('html[data-portal="supervisor"] .legacy-google-batch{display:none!important}'));
assert(html.includes('app.js?v=1.1.26')&&html.includes('overtime-client.js?v=1.1.29'));
assert(app.includes('if (name === "batch" && PORTAL!=="supervisor") refreshBatchQueue();'),"supervisor portal must not use legacy Google queue");
assert(front.includes("主管加班審核清單")&&front.includes("後端待辦 "));
assert(front.includes('x.status==="需人工核對"'));
assert(front.includes("不要重複提交。"));
assert(front.includes('x.status==="待核准"&&x.source_sheet==="業務假日或臨時加班登記"') ||
       front.includes('x.status==="待核准" && x.source_sheet==="業務假日或臨時加班登記"'),
 "approval must require a verified Google source row");
assert(front.includes('api.approve(x.id)')&&front.includes('api.reject(x.id)'),"both actions use authenticated Edge API");
assert(front.includes('駁回刪除（移出月檢視）'));
assert(front.includes('x.status==="駁回待同步"'));
assert(front.includes('query.get("approve")')&&front.includes('query.get("action")'));
assert(front.includes('window.setInterval(')&&front.includes('visibilitychange'));
assert(html.includes('class="notice warning legacy-google-batch" id="batchState"'));
assert(front.includes('if(!confirm(warning))return;')&&front.includes('if(!confirm("確定核准？'),"both actions require manual confirmation");
console.log("PASS supervisor approval/rejection controls, Google source guard, deep links, auto-refresh and obsolete OAuth warning hidden");
