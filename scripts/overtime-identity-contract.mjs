// Read-only contract for displaying employee codes and names without changing IDs used for submitting requests.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const app=readFileSync("overtime/app.js","utf8");
const page=readFileSync("overtime/index.html","utf8");
const css=readFileSync("overtime/style.css","utf8");
const edge=readFileSync("integrations/overtime-supabase/overtime-requests/index.ts","utf8");
assert(page.includes('app.js?v=1.1.44')&&page.includes('style.css?v=1.1.44'),"frontend assets must match release");
assert(app.includes('id:String(p.public_key),name:String(p.employee_name),code:String(p.display_code)'),"real backend display code must be separate from opaque key");
assert(app.includes('p.remote ? (p.code ? p.code+" "+p.name : p.name)'),"dropdown must display code before name");
assert(app.includes('const realId=employeeCodeFromRequestNo(record.request_no)'),"only verified receipt may supply the query code");
assert(app.includes('employee_code:realId,employee_name:record.employee_name'),"personal request must retain verified ID/name");
assert(app.includes('identity.className="history-person"')&&app.includes('identity.textContent=(entry.employee_code?entry.employee_code+" ":"")+entry.employee_name'),"personal request must show ID then name");
assert(css.includes('.history-card .history-person'),"mobile style must support the identity line");
assert(edge.includes('select("department,public_key,employee_name,team,employee_id")'),"API must read real employee ID");
assert(edge.includes('display_code:String(p.employee_id||"")'),"API must expose explicit employee code as display data");
assert(edge.includes('if(action==="cancel")'),"do not regress the already deployed receipt-cancel feature");
assert(edge.includes('receipt_hash:await sha256(token)'),"preserve request token authentication");
console.log("PASS employee code+name display, verified receipts, preserved submit and cancel controls");
