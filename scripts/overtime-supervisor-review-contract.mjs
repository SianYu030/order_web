// Read-only static checks. No new approval or Google Sheets write.
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
assert(html.includes('app.js?v=1.1.26')&&html.includes('overtime-client.js?v=1.1.26'));
assert(app.includes('if (name === "batch" && PORTAL!=="supervisor") refreshBatchQueue();'),"supervisor portal must not invoke old Google OAuth queue");
assert(front.includes("主管加班審核清單")&&front.includes("後端待辦 "),"one genuine backend queue");
assert(front.includes('x.status==="需人工核對"'));
assert(front.includes("不要重新提交同日申請。"));
assert(front.includes('x.status==="待核准" && x.source_sheet==="業務假日或臨時加班登記"')||
       front.includes('x.status==="待核准"&&x.source_sheet==="業務假日或臨時加班登記"'),
 "approval remains gated by a verified Google source row");
assert(front.includes('api.approve(x.id)'),"supervisor approval must stay on authenticated Edge API");
console.log("PASS supervisor uses backend-only queue; stale OAuth batch hidden; pending/manual-review safety preserved");
