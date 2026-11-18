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

assert(html.includes('class="supervisor-profile-actions"'),"signed-in account actions must be inline");
assert(html.includes('supervisor-auth.js?v=1.1.32')&&html.includes('style.css?v=1.1.32'),"cache bust aligned supervisor UI");
assert(css.includes('#supervisorAccess.supervisor-compact'),"only signed-in supervisor card should shrink");
assert(css.includes('.supervisor-compact .supervisor-heading{display:none}'),"redundant login heading should be hidden");
assert(css.includes('.supervisor-compact > .helper.small{display:none}'),"redundant Google description should be hidden when signed in");
const auth=readFileSync("overtime/supervisor-auth.js","utf8");
assert(auth.includes('PORTAL==="supervisor"&&signed&&!user.must_change'),"must not collapse login, admin or mandatory-password screens");
assert(auth.includes('e.classList.toggle("is-alert",!!fail)'),"errors must remain visible in compact state");
assert(html.includes('id="supervisorLogoutBtn"')&&html.includes('id="supervisorTogglePasswordBtn"')&&html.includes('id="supervisorChangeForm"'),"logout and password update must remain available");
console.log("PASS compact signed-in supervisor bar retains logout, password change and error visibility");

const matchAligned=css.match(/html\[data-portal="supervisor"\] #supervisorAccess\.supervisor-compact\{([^}]+)\}/);
assert(matchAligned&&matchAligned[1].includes("width:100%")&&matchAligned[1].includes("max-width:none"),"signed-in account bar must fill the same parent width as review panel");
assert(!matchAligned[1].includes("margin:0 0 12px auto"),"account bar must not be pushed to the right");
assert(matchAligned[1].includes("box-sizing:border-box"),"account bar should not overflow parent when padded");
assert(css.includes(".supervisor-compact .supervisor-profile-actions"),"account and actions remain aligned on a single row");
console.log("PASS full-width signed-in supervisor bar aligns with review panel on desktop and mobile");
