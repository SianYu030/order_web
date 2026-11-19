// Read-only deployment contract: GitHub Pages serves docs/overtime/, not overtime/.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const assets=[
  "index.html","app.js","style.css","overtime-client.js",
  "supervisor-auth.js","supervisor/index.html","admin/index.html","bridge-admin.js"
];
for(const asset of assets){
  const source=readFileSync("overtime/"+asset,"utf8");
  const published=readFileSync("docs/overtime/"+asset,"utf8");
  assert.equal(published,source,"GitHub Pages docs/overtime/"+asset+" is not synced with overtime/"+asset);
}
const html=readFileSync("docs/overtime/index.html","utf8");
const app=readFileSync("docs/overtime/app.js","utf8");
const appVersion=html.match(/app\.js\?v=(\d+\.\d+\.\d+)/)?.[1];
const cssVersion=html.match(/style\.css\?v=(\d+\.\d+\.\d+)/)?.[1];
assert(appVersion&&appVersion===cssVersion,"published employee JS and CSS versions must align");
assert(html.includes('id="ownHistoryForm"')&&html.includes('data-view="history"'),"employee lookup must be published");
assert(app.includes("employeeCodeFromRequestNo")&&app.includes("window.OvertimeApi.receipt("),
  "work number lookup must use verified receipt IDs, not public UUIDs");
console.log("PASS 8 GitHub Pages files match source; employee lookup and cache versions verified");
