// V1.1.24: static receipt-view contract (no real submissions or changes).
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync("overtime/index.html","utf8");
const app=readFileSync("overtime/app.js","utf8");
const css=readFileSync("overtime/style.css","utf8");
assert(html.includes('id="view-receipt" class="view hidden receipt-view"'),"receipt view must initially be hidden");
for(const id of ["receiptHeading","receiptNo","receiptStatus","receiptProgress","receiptDate","receiptEmployee","receiptDept","receiptHours","receiptReason","receiptLocalWarning","receiptRefresh","receiptHistory","receiptNew","receiptCopy","receiptRefreshed"]){
 assert(html.includes('id="'+id+'"'),"missing receipt field: "+id);
}
assert(app.includes('if(PORTAL==="employee"&&!["entry","history","receipt"].includes(name))return;'));
assert(app.includes('showReceiptPage(result.record,entry,saved,receipt?receipt.receipt_token:result.receipt_token);'),"only confirmed backend response triggers completion view");
assert(app.includes('switchView("receipt")'));
assert(app.includes('void refreshReceiptStatus();'),"must refresh status immediately after confirming backend acceptance");
assert(app.includes('receiptPoller=window.setInterval(')&&app.includes('},60000);'),"must refresh while receipt is visible every minute");
assert(app.includes('window.clearInterval(receiptPoller)'),"polling must stop after leaving receipt view");
assert(app.includes('if(button.disabled)return;'),"prevent overlapping status refreshes");
assert(app.includes('if (state.busy) return;'));
assert(app.includes('state.editKey="";'));
assert(app.includes('window.OvertimeApi.receipt(latestReceipt.id,latestReceipt.token)'),"refresh must query the exact receipt token");
assert(app.includes('case "需人工核對"')&&app.includes('case "已核准"'),"verified failure and approved states need distinct presentation");
assert(css.includes('body.employee-receipt .tabs{display:none}'),"navigation must be hidden after submission");
assert(html.includes('app.js?v=1.1.24')&&html.includes('style.css?v=1.1.24'),"cache-busted UI must load");
console.log("PASS standalone mobile receipt, safe state refresh, error state, hidden duplicate-submit form");
