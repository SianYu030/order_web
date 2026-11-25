const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const path=require("node:path");
const root=process.argv[2]||path.resolve(__dirname,"../..");
const src=fs.readFileSync(path.join(root,"integrations/overtime-google/Code.gs"),"utf8");
const context={console,Utilities:{sleep(){}}};
vm.createContext(context);vm.runInContext(src,context);
const normal="支援E4", comp=normal+"\n（加班換補休）";
assert.equal(context.otIsComp_(normal),false);
assert.equal(context.otIsComp_(comp),true);
assert.equal(context.otIsComp_("一般（加班換補休）原因"),false);
assert.equal(context.otColorMatches_({textColor:{red:1}},comp),true);
assert.equal(context.otColorMatches_({textColor:{}},comp),false);
assert.equal(context.otColorMatches_({textColor:{}},normal),true);
function mockApproval(reason,correctColor=true){
 const target={sheetId:101,row:20,col:93,name:"測試月表",a1:"CO20"};
 const row=Array(18).fill("");row[0]="TEST";row[9]="待同步";row[10]=target.name;row[11]=target.a1;row[15]="待核准";
 let current={kind:"blank",number:null,formula:"",note:"",textColor:{}};
 let updates=[];
 context.otRegisteredSource_=()=>({target,values:row.slice(),row:2});
 context.otCellReadApi_=()=>current;
 context.otSourceReadApi_=()=>row.slice();
 context.otGoogleBatch_=reqs=>{
  updates.push(...reqs);
  for(const r of reqs){
   const u=r.updateCells;
   const values=u.rows[0].values;
   if(u.start.sheetId===target.sheetId){
    const v=values[0];
    current={kind:"number",number:v.userEnteredValue.numberValue,formula:"",note:v.note,textColor:correctColor?v.userEnteredFormat.textFormat.foregroundColorStyle.rgbColor:{}};
   }else if(u.start.columnIndex===9){
    for(let i=0;i<values.length;i++)row[9+i]=values[i].userEnteredValue.stringValue;
   }else if(u.start.columnIndex===15){
    for(let i=0;i<values.length;i++)row[15+i]=values[i].userEnteredValue.stringValue||values[i].userEnteredValue.numberValue;
   }
  }
 };
 const record={request_no:"TEST",hours:8,reason,manager_name:"測試主管",manager_time:"2026-11-25T08:00:00Z"};
 return {run:()=>context.otApprove_({},record),updates,row,current:()=>current};
}
for(const [reason,red] of [[normal,0],[comp,1]]){
 const t=mockApproval(reason);assert.equal(t.run().row,2);const u=t.updates[0].updateCells;
 const cell=u.rows[0].values[0];
 assert.equal(cell.userEnteredValue.numberValue,8);
 assert.equal(cell.note,reason);
 assert.equal(cell.userEnteredFormat.textFormat.foregroundColorStyle.rgbColor.red,red);
 assert.equal(t.row[15],"已核准");
 assert.equal(t.run().row,2);
 assert.equal(t.updates.length,3);
}
const bad=mockApproval(comp,false);assert.throws(()=>bad.run(),/讀回不一致/);assert.equal(bad.row[15],"待核准");
console.log("PASS: normal black, comp red, exact two-line note, numeric value, approval readback, repeat idempotency, failed color blocks approval");
const app=fs.readFileSync(path.join(root,"overtime/app.js"),"utf8");
const helpers=app.slice(app.indexOf('  var COMP_MARK='),app.indexOf('  function markComp('));
const ui={};vm.createContext(ui);vm.runInContext(helpers,ui);
assert.equal(ui.reasonWithType(normal,"normal"),normal);
assert.equal(ui.reasonWithType(normal,"comp"),comp);
assert.equal(ui.reasonWithType(comp,"comp"),comp);
assert.equal(ui.reasonWithType(comp,"normal"),normal);
assert.equal(ui.stripCompReason(comp),normal);
console.log("PASS: note marker added once, editing/correcting normal removes marker");
const mask=src.match(/var fields="(spreadsheetId,sheets\(properties\(sheetId\),data\(startRow,startColumn,rowData\(values\(userEnteredValue,note,effectiveFormat[^"]+)"/);
assert.ok(mask,"color readback mask exists");let n=0;for(const c of mask[1]){if(c==="(")n++;if(c===")")n--;assert.ok(n>=0);}assert.equal(n,0);
console.log("PASS: Sheets API field mask parentheses balanced");
