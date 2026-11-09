/* PhotoAgent / Google Drive 接收驗收入口 v1.0
   只在正式網站 URL 加上 ?drive_test=1 時顯示。
   不更改既有工單、照片、LINE 或影片送出邏輯。 */
(() => {
  'use strict';
  const query = new URLSearchParams(location.search);
  if (query.get('drive_test') !== '1' || document.getElementById('drivePilotRoot')) return;

  const style = document.createElement('style');
  style.textContent = [
    '#drivePilotRoot{position:fixed;right:14px;bottom:16px;z-index:30000;font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif;color:#173047}',
    '#drivePilotOpen{background:#245c88;color:#fff;border:0;border-radius:24px;padding:12px 18px;box-shadow:0 3px 18px #0003;font-weight:800;cursor:pointer}',
    '#drivePilotPanel{position:fixed;right:14px;bottom:72px;width:min(440px,calc(100vw - 28px));max-height:calc(100dvh - 92px);overflow:auto;background:#fff;box-shadow:0 8px 30px #0004;border-radius:14px;padding:16px;box-sizing:border-box;border:1px solid #cad8e6}',
    '#drivePilotPanel[hidden]{display:none}',
    '#drivePilotPanel h3{font-size:17px;margin:0 0 6px;color:#163a59}',
    '#drivePilotPanel p{font-size:13px;line-height:1.55;margin:6px 0 12px;color:#485d71}',
    '#drivePilotPanel label{display:block;font-size:13px;font-weight:700;margin:8px 0}',
    '#drivePilotUrl{width:100%;box-sizing:border-box;padding:10px;border:1px solid #b9cadd;border-radius:8px;font-size:13px}',
    '#drivePilotPanel button{cursor:pointer;border:0;border-radius:8px;padding:10px;font-weight:700}',
    '#drivePilotConnect{background:#206994;color:#fff}',
    '#drivePilotClose{background:#e8edf2;color:#234}',
    '#drivePilotPanel .drive-actions{display:flex;gap:8px}',
    '#drivePilotFrame{display:block;width:100%;height:410px;border:1px solid #d5e2ec;border-radius:10px;margin-top:10px;background:#f7fafc}',
    '#drivePilotFrame[hidden]{display:none}',
    '#drivePilotStatus{font-size:12px;line-height:1.5;white-space:pre-wrap;margin-top:8px;color:#4b6173}',
    '#drivePilotDirect{display:none;font-size:12px;margin-top:9px;color:#126493;overflow-wrap:anywhere}'
  ].join('');
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'drivePilotRoot';
  root.innerHTML = [
    '<button type="button" id="drivePilotOpen" aria-expanded="false">☁️ 雲端附件測試</button>',
    '<section id="drivePilotPanel" role="dialog" aria-label="Google Drive 附件測試" hidden>',
    '<h3>Google Drive 附件接收驗收</h3>',
    '<p>這是原正式網站內的獨立驗收功能。只使用指定的測試 MR，不會建立、修改或刪除正式工單。驗收前不會取代原本照片、LINE 流程。</p>',
    '<label for="drivePilotUrl">公司 Google Apps Script 接收器網址（只需設定一次）</label>',
    '<input id="drivePilotUrl" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec">',
    '<div class="drive-actions" style="margin-top:10px">',
    '<button type="button" id="drivePilotConnect">連接接收器</button>',
    '<button type="button" id="drivePilotClose">關閉</button>',
    '</div>',
    '<div id="drivePilotStatus" role="status"></div>',
    '<iframe id="drivePilotFrame" title="Google Drive 安全驗收上傳" hidden referrerpolicy="no-referrer"></iframe>',
    '<a id="drivePilotDirect" target="_blank" rel="noopener noreferrer">接收器顯示空白？改用此連結開啟同一個 Google 接收器</a>',
    '</section>'
  ].join('');
  document.body.appendChild(root);

  const byId = (id) => document.getElementById(id);
  const panel = byId('drivePilotPanel');
  const frame = byId('drivePilotFrame');
  const urlInput = byId('drivePilotUrl');
  const direct = byId('drivePilotDirect');
  const status = byId('drivePilotStatus');
  try {
    urlInput.value = localStorage.getItem('repair_drive_receiver_url_v1') || '';
  } catch (_) { /* local storage might be disabled */ }

  byId('drivePilotOpen').onclick = () => {
    panel.hidden = !panel.hidden;
    byId('drivePilotOpen').setAttribute('aria-expanded', String(!panel.hidden));
  };
  byId('drivePilotClose').onclick = () => {
    panel.hidden = true;
    byId('drivePilotOpen').setAttribute('aria-expanded', 'false');
  };
  byId('drivePilotConnect').onclick = () => {
    const text = urlInput.value.trim();
    let parsed;
    try { parsed = new URL(text); } catch (_) {
      status.textContent = '請貼上正式 Google Apps Script 網頁應用程式的 /exec 網址。';
      return;
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'script.google.com' ||
        !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(parsed.pathname) ||
        parsed.username || parsed.password) {
      status.textContent = '為避免誤傳資料，只接受 script.google.com/macros/s/…/exec 網址。';
      return;
    }
    const clean = parsed.origin + parsed.pathname.replace(/\/$/, '');
    try { localStorage.setItem('repair_drive_receiver_url_v1', clean); } catch (_) {}
    const target = new URL(clean);
    target.searchParams.set('drive_pilot', '1');
    frame.src = target.toString();
    frame.hidden = false;
    direct.href = target.toString();
    direct.style.display = 'inline-block';
    status.textContent = '正在載入公司 Google Drive 接收器。請在下方選擇測試檔案並確認雲端寫入結果。若公司瀏覽器封鎖內嵌登入，請使用「改用此連結開啟」。';
  };
})();