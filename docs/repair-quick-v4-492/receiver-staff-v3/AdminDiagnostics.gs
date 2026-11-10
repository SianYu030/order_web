/**
 * 管理員唯讀預檢：不建立工單、不刪資料、不上傳附件。
 * 僅在廠務室 Apps Script 編輯器由管理員手動執行。
 */
function drivePilotAdminPreflight_(){
  drivePilotEffectiveOwner_();
  const root=DriveApp.getFolderById(REPAIR_DRIVE_PILOT.ROOT_FOLDER_ID);
  const ss=SpreadsheetApp.openById(REPAIR_DRIVE_PILOT.FORMAL_SHEET_ID);
  const tab=ss.getSheetByName(REPAIR_DRIVE_PILOT.FORMAL_SHEET_NAME);
  if(!tab)throw new Error("正式機修維修單不存在");
  const report={
    ok:true,
    receiverVersion:"3.0",
    accountVerified:true,
    rootFolderName:root.getName(),
    sheetName:tab.getName(),
    lastRow:tab.getLastRow(),
    message:"僅讀取授權與資料夾狀態，沒有更動正式工單或雲端檔案"
  };
  Logger.log(JSON.stringify(report));
  return report;
}
