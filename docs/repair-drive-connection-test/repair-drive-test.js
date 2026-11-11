/**
 * V3.3 Apps Script /dev connection diagnostic.
 * One user click opens Google popup, then handshake + healthcheck run automatically.
 * The /dev URL is passed by a private link query parameter, not published in source.
 * No MR, file uploads, LINE, NAS, or staff credential collection.
 */
(() => {
  'use strict';
  const CHANNEL = 'repair-drive-mr-v1';
  const VERSION = '3.3';
  const DEV = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/dev$/;
  const $ = id => document.getElementById(id);
  const form = $('configForm'), input = $('devUrl'), inputLabel = $('devUrlLabel');
  const button = $('connectBtn'), status = $('status'), steps = $('steps');
  const qs = new URLSearchParams(location.search);
  const configured = String(qs.get('receiver_dev') || '');
  let nonce = '', popup = null, remote = null, remoteOrigin = '';
  let verified = false, startedHealth = false, pending = null, generation = 0;
  let handshakeTimer = null;

  function show(message, state='pending') {
    status.textContent = message;
    status.dataset.state = state;
  }
  function originAllowed(origin) {
    try {
      const u = new URL(origin);
      return u.protocol === 'https:' && (
        u.hostname === 'script.google.com' ||
        u.hostname === 'script.googleusercontent.com' ||
        /^[a-z0-9-]+-script\.googleusercontent\.com$/.test(u.hostname)
      );
    } catch (_) { return false; }
  }
  function stopPending() {
    if (handshakeTimer !== null) { clearTimeout(handshakeTimer); handshakeTimer = null; }
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('連線已重新開始'));
      pending = null;
    }
  }
  if (DEV.test(configured)) {
    input.value = configured;
    input.hidden = true;
    inputLabel.hidden = true;
    steps.textContent = '測試網址已自動設定。按一次「開始連線測試」即可自動完成檢查。';
    show('已準備好 V3.3 接收器網址，不用複製或貼上。', 'ready');
  } else {
    steps.textContent = '此連結未附測試網址，請使用已建立的專用測試連結，或輸入 Apps Script /dev 網址。';
    show('尚未指定接收器測試網址。', 'pending');
  }

  function healthcheck() {
    if (!remote || !remoteOrigin) {
      return Promise.reject(new Error('還沒收到 Google 接收器的連線回應'));
    }
    if (pending) return Promise.reject(new Error('已有健康檢查正在執行'));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending && pending.id === id) pending = null;
        reject(new Error('45 秒內未收到接收器回覆，請檢查 Google 登入及彈出視窗。'));
      }, 45000);
      pending = { id, resolve, reject, timer };
      try {
        remote.postMessage({
          channel: CHANNEL, kind: 'call', nonce,
          id, action: 'health', args: []
        }, remoteOrigin);
      } catch (error) {
        clearTimeout(timer);
        pending = null;
        reject(error);
      }
    });
  }
  async function verifyAutomatically(localGeneration) {
    show('已連上接收器，正在自動檢查 Google Drive 唯讀權限…');
    steps.textContent = '正在執行唯一允許的 healthcheck，不會建立工單或傳送附件。';
    try {
      const response = await healthcheck();
      if (localGeneration !== generation) return;
      if (!response.ok) throw new Error(String(response.error || 'Google 接收器拒絕'));
      const result = response.result;
      if (!result || result.ok !== true || result.receiverVersion !== VERSION || result.testOnly !== false)
        throw new Error('接收器版本或狀態不符；目前只接受 V3.3。');
      verified = true;
      button.disabled = false;
      button.textContent = '重新檢查';
      show('✅ V3.3 接收器連線成功，Google Drive 唯讀檢查通過。', 'success');
      steps.textContent = 'Drive 唯讀驗證已通過，照片、影片及 NAS 尚未測試。Google 視窗將自動關閉。';
      // Close only the exact popup created by this diagnostic page.
      try { if (popup && !popup.closed) popup.close(); } catch (_) {}
      try { window.focus(); } catch (_) {}
    } catch (error) {
      if (localGeneration !== generation) return;
      verified = false;
      button.disabled = false;
      button.textContent = '重新連接測試';
      show('⚠️ 連線尚未成功：' + String(error?.message || error));
      steps.textContent = '請保留 Google 接收器視窗，核對登入身分或允許測試站開啟彈出視窗。';
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const receiverDev = input.value.trim();
    if (!DEV.test(receiverDev)) {
      show('請使用 Google Apps Script「測試部署作業」提供的 /dev 網址，不能使用 /exec。');
      return;
    }
    if (!crypto?.randomUUID) {
      show('目前瀏覽器無法建立安全握手識別碼，請改用新版 Chrome 或 Safari。');
      return;
    }
    generation += 1;
    stopPending();
    nonce = crypto.randomUUID();
    const url = new URL(receiverDev);
    url.searchParams.set('bridgeNonce', nonce);
    url.searchParams.set('bridgeMode', 'popup');
    remote = null; remoteOrigin = ''; verified = false; startedHealth = false;
    // Opening a new window requires a direct user click on most browsers.
    try { popup = window.open(url.toString(), 'repairDriveV33Dev', 'popup=yes,width=560,height=650,scrollbars=yes,resizable=yes'); }
    catch (_) { popup = null; }
    if (!popup) {
      show('瀏覽器阻擋 Google 視窗。請允許此測試站開啟彈出視窗後，再按一次連接。');
      return;
    }
    button.disabled = true;
    show('正在等待 Google 接收器回應，檢查會自動進行…');
    steps.textContent = 'Google 視窗開啟後會自動回傳結果；成功時測試視窗會自動關閉。';
    const localGeneration = generation;
    handshakeTimer = setTimeout(() => {
      handshakeTimer = null;
      if (localGeneration !== generation || startedHealth) return;
      button.disabled = false;
      button.textContent = '重新連接測試';
      show('⚠️ Google 接收器已開啟，但沒有回傳連線確認。尚未通過驗證。');
      steps.textContent = '請留意 Google 視窗是否顯示「找不到連線視窗」或需要登入。不要重複建立 MR 工單。';
    }, 18000);
  });
  window.addEventListener('message', event => {
    const data = event.data;
    if (!nonce || !originAllowed(event.origin) || !data ||
        data.channel !== CHANNEL || data.nonce !== nonce) return;
    if (data.kind === 'ready') {
      if (startedHealth) return;
      if (handshakeTimer !== null) { clearTimeout(handshakeTimer); handshakeTimer = null; }
      remote = event.source;
      remoteOrigin = event.origin;
      startedHealth = true;
      const localGeneration = generation;
      verifyAutomatically(localGeneration);
      return;
    }
    if (data.kind === 'result' && pending && data.id === pending.id &&
        event.source === remote && event.origin === remoteOrigin) {
      const current = pending;
      pending = null;
      clearTimeout(current.timer);
      current.resolve(data);
    }
  });
})();