function doGet(e) {
  // GitHub / Next.js bridge endpoint:
  // https://script.google.com/.../exec?api=systems
  if (e && e.parameter && String(e.parameter.api || '').trim().toLowerCase() === 'systems') {
    return jsonOutput_(getSystemList());
  }

  const template = HtmlService.createTemplateFromFile('index');

  // 取得網址參數 role
  // 支援：
  // ?role=staff       現場版
  // ?role=supervisor  主管版
  // ?role=admin       管理版
  let role = 'staff';

  if (e && e.parameter && e.parameter.role) {
    role = String(e.parameter.role).trim().toLowerCase();
  }

  const allowedRoles = ['staff', 'supervisor', 'admin'];

  if (!allowedRoles.includes(role)) {
    role = 'staff';
  }

  template.role = role;

  return template.evaluate()
    .setTitle('大成鋼系統櫥櫃部管理平台')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSystemList() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!ss) {
      throw new Error('找不到總控試算表，請確認 Apps Script 是從總控表的「擴充功能 → Apps Script」開啟。');
    }

    const sheet = ss.getSheetByName('系統清單');

    if (!sheet) {
      throw new Error('找不到分頁：系統清單，請確認分頁名稱完全一樣，不能多空格。');
    }

    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return {
        success: true,
        data: []
      };
    }

    const range = sheet.getRange(2, 1, lastRow - 1, 9);
    const values = range.getDisplayValues();
    const richTexts = range.getRichTextValues();

    const data = values
      .filter(row => {
        const id = String(row[0] || '').trim();
        const name = String(row[2] || '').trim();
        return id !== '' || name !== '';
      })
      .map((row, index) => {
        return {
          id: row[0],
          module: row[1],
          name: row[2],
          type: row[3],
          department: row[4],
          user: row[5],
          formUrl: getLinkOrText_(richTexts[index][6], row[6]),
          recordUrl: getLinkOrText_(richTexts[index][7], row[7]),
          note: row[8]
        };
      });

    return {
      success: true,
      data: data
    };

  } catch (err) {
    return {
      success: false,
      message: err && err.message ? err.message : String(err)
    };
  }
}

// 讀取儲存格連結，如果沒有超連結，就讀取文字
function getLinkOrText_(richText, text) {
  try {
    if (richText) {
      const link = richText.getLinkUrl();

      if (link) {
        return link;
      }

      const runs = richText.getRuns();

      for (let i = 0; i < runs.length; i++) {
        const runLink = runs[i].getLinkUrl();

        if (runLink) {
          return runLink;
        }
      }
    }
  } catch (e) {}

  return String(text || '').trim();
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
