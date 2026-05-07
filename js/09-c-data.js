(function(){
  const btn = document.getElementById('cDataBtn');
  const pop = document.getElementById('cDataPopover');

  if (!btn || !pop) {
    console.warn('[Data Popover] cDataBtn または cDataPopover が見つかりません。');
    return;
  }

  // ★ 同期から除外する管理用キー（これを含めるとPC間で時間や権限が混ざるため除外）
  const SYNC_META_KEYS = [
    'SYNC_AUTOSAVE_STATE_V1',
    'SYNC_LAST_MODIFIED_V1',
    'folder:work',
    'folder:private'
  ];

  // ★ 起動直後の上書き防止ロック
  let initialLoadCompleted = { work: false, private: false };

  // --- データ収集（同期対象外を除外） ---
  if (typeof window.collectAllData !== 'function') {
    window.collectAllData = function(){
      const payload = { __meta:{ exportedAt:new Date().toISOString(), app:'WorkPage', version:'1' }, data:{} };
      for (let i=0; i<localStorage.length; i++){
        const k = localStorage.key(i);
        if (SYNC_META_KEYS.includes(k)) continue; // 管理データは含めない
        try {
          const raw = localStorage.getItem(k);
          payload.data[k] = tryParseJSON(raw);
        } catch {}
      }
      return payload;
      function tryParseJSON(raw){ if(raw==null) return null; try{ return JSON.parse(raw); } catch { return { __raw:String(raw) }; } }
    };
  }

  // --- データ反映（削除されたデータも反映するように強化） ---
  if (typeof window.applyAllData !== 'function') {
    window.applyAllData = function(payload){
      if (!payload || !payload.data) return false;

      // 1. クラウドにないローカルデータ（他PCで削除されたもの）を削除
      const localKeys = [];
      for(let i=0; i<localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!SYNC_META_KEYS.includes(k)) localKeys.push(k);
      }
      localKeys.forEach(k => {
        if (payload.data[k] === undefined) {
          localStorage.removeItem(k);
        }
      });

      // 2. クラウド側のデータを上書き反映
      for (const k of Object.keys(payload.data)) {
        const v = payload.data[k];
        let newVal = '';
        if (v && typeof v === 'object' && v.__raw !== undefined) {
          newVal = String(v.__raw);
        } else {
          newVal = JSON.stringify(v);
        }
        localStorage.setItem(k, newVal);
      }

      // 3. 画面をリロードせずに即座に更新させるための通知
      window.dispatchEvent(new Event('storage'));
      try {
        document.querySelectorAll('iframe').forEach(ifr => {
          ifr.contentWindow.postMessage({ type: 'todo:saved' }, '*');
          ifr.contentWindow.postMessage({ type: 'D_VIDEOS_UPDATED' }, '*');
        });
      } catch(e){}

      return true;
    };
  }

  function downloadJSON(obj, filename){
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    a.download = filename || ('workpage-backup-' + stamp + '.json');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // --- ステータス表示の追加 ---
  let statusRow = pop.querySelector('.sync-status-row');
  if (!statusRow) {
    const titleEl = pop.querySelector('.dp-section:nth-child(2) .dp-title');
    if (titleEl) {
      statusRow = document.createElement('div');
      statusRow.className = 'sync-status-row';
      statusRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:12px; font-weight:bold; background:#f8fafc; padding:4px 8px; border-radius:6px; border:1px solid #e2e8f0;';
      statusRow.innerHTML = '<span style="color:#64748b;">接続状態:</span> <span class="sync-status-msg" style="display:flex; align-items:center; gap:6px;"></span>';
      titleEl.parentNode.insertBefore(statusRow, titleEl.nextSibling);
    }
  }

  // --- ポップオーバー開閉ロジック（復元） ---
  function openPop(){
    pop.hidden = false;
    btn.setAttribute('aria-expanded','true');
    const r = btn.getBoundingClientRect();
    const popWidth = pop.offsetWidth || 320;
    const x = Math.min(window.innerWidth - popWidth - 8, r.left);
    const y = r.bottom + window.scrollY + 8;
    pop.style.left = Math.max(8, x) + 'px';
    pop.style.top  = y + 'px';
    checkSyncStatus(currentProfile);
  }
  function closePop(){
    pop.hidden = true;
    btn.setAttribute('aria-expanded','false');
  }

  btn.addEventListener('click', function(e){
    e.preventDefault();
    if (pop.hidden) openPop(); else closePop();
  });
  document.addEventListener('click', function(e){
    if (!pop.hidden && !pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      closePop();
    }
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && !pop.hidden) { closePop(); btn.focus(); }
  });

  // --- A案：エクスポート/インポート（復元） ---
  const fileInput = document.getElementById('cImportFile');
  pop.addEventListener('click', async function(e){
    const tabBtn = e.target.closest('.dp-tab');
    if (tabBtn) { switchTab(tabBtn.dataset.prof); return; }

    const b = e.target.closest('.dp-btn');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'export') {
      const payload = window.collectAllData();
      downloadJSON(payload, 'workpage-backup.json');
    }
    if (act === 'import') {
      if (fileInput) fileInput.click();
    }
    if (act === 'pick')  pickFolder(currentProfile);
    if (act === 'save')  saveNow(currentProfile, false);
    if (act === 'load')  loadNow(currentProfile, false);
    if (act === 'reconnect') await reconnectSync(currentProfile);
  });

  if (fileInput) {
    fileInput.addEventListener('change', async function(){
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        const payload = JSON.parse(text);
        window.applyAllData(payload);
        showToast('JSONから復元しました。');
        closePop();
      } catch (err) {
        console.error(err);
        alert('JSONの読み込みに失敗しました。');
      } finally {
        fileInput.value = '';
      }
    });
  }

  // --- B案：クラウド同期（安全機構付き） ---
  var PROF_WORK = 'work';
  var PROF_PRIVATE = 'private';
  var FILE_NAME = { work:'workspace-data.work.json', private:'workspace-data.private.json' };
  var IDB_DB = 'wp-sync';
  var IDB_STORE = 'handles';
  var AUTOSAVE_KEY = 'SYNC_AUTOSAVE_STATE_V1';
  var LAST_MODIFIED_KEY = 'SYNC_LAST_MODIFIED_V1';
  var currentProfile = PROF_WORK;

  function idbOpen(){
    return new Promise(function(res, rej){
      var req = indexedDB.open(IDB_DB, 1);
      req.onupgradeneeded = function(){
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function(){ res(req.result); };
      req.onerror = function(){ rej(req.error); };
    });
  }
  function idbPut(key, val){
    return idbOpen().then(function(db){
      return new Promise(function(res, rej){
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(val, key);
        tx.oncomplete = function(){ res(); };
        tx.onerror = function(){ rej(tx.error); };
      });
    });
  }
  function idbGet(key){
    return idbOpen().then(function(db){
      return new Promise(function(res, rej){
        var tx = db.transaction(IDB_STORE, 'readonly');
        var rq = tx.objectStore(IDB_STORE).get(key);
        rq.onsuccess = function(){ res(rq.result || null); };
        rq.onerror = function(){ rej(rq.error); };
      });
    });
  }

  function getLastModified(profile) {
    try { return JSON.parse(localStorage.getItem(LAST_MODIFIED_KEY))[profile] || 0; } catch { return 0; }
  }
  function setLastModified(profile, timestamp) {
    try {
      var all = JSON.parse(localStorage.getItem(LAST_MODIFIED_KEY)) || {};
      all[profile] = timestamp;
      localStorage.setItem(LAST_MODIFIED_KEY, JSON.stringify(all));
    } catch {}
  }

  async function getFolderHandle(profile, requireInteractive = false){
    var key = 'folder:' + profile;
    var h = await idbGet(key);
    if (h) {
      var p = await (h.queryPermission ? h.queryPermission({mode:'readwrite'}) : 'granted');
      if (p !== 'granted' && requireInteractive && h.requestPermission) {
        try { p = await h.requestPermission({mode:'readwrite'}); } catch(e) {}
      }
      if (p !== 'granted') h = null;
    }
    return h || null;
  }

  async function pickFolder(profile){
    if (!('showDirectoryPicker' in window)) { alert('Chromium系ブラウザでご利用ください。'); return; }
    try {
      var folder = await window.showDirectoryPicker({ id:'workpage-sync-' + profile });
      var perm = await folder.requestPermission({mode:'readwrite'});
      if (perm !== 'granted') { alert('フォルダへのアクセス権限が必要です。'); return; }
      await idbPut('folder:' + profile, folder);
      
      initialLoadCompleted[profile] = false; // フォルダ変更時は再度ロック
      await autoLoad(profile, true);
      alert((profile==='work'?'仕事':'プライベート') + '用の同期フォルダを設定し、最新データを読み込みました。');
      checkSyncStatus(profile);
    } catch (e) {}
  }

  async function saveNow(profile, isAuto = false){
    // ★ ロック確認：一度もロードが完了していない場合は上書き保存させない
    if (!initialLoadCompleted[profile]) {
      console.log(`[sync:${profile}] 初期ロード待ちのため保存をスキップしました。`);
      return;
    }

    var folder = await getFolderHandle(profile, !isAuto);
    if (!folder) { 
      if (!isAuto) alert('先に「同期フォルダ」へのアクセスを許可してください。'); 
      return; 
    }

    try {
      var fh = await folder.getFileHandle(FILE_NAME[profile], {create:true});
      var f = await fh.getFile();
      
      var cloudMod = f.lastModified;
      var localMod = getLastModified(profile);
      
      // ★ 他のPCで更新されたファイルの検知
      if (cloudMod > localMod) {
        console.warn(`[sync:${profile}] 他PCの更新を検知。上書きを中止し、ロードします。`);
        await autoLoad(profile, false);
        if (!isAuto) alert('他のPCで更新された最新データがあったため、上書きを中止して読み込みました。');
        else showToast('他PCの更新を検知し、最新データを同期しました。');
        return;
      }

      var w = await fh.createWritable();
      await w.write(JSON.stringify(window.collectAllData(), null, 2));
      await w.close();
      
      var updated = await (await folder.getFileHandle(FILE_NAME[profile])).getFile();
      setLastModified(profile, updated.lastModified);
      
      if (!isAuto) showToast('保存しました。');

    } catch(e) {
      if (!isAuto) alert('保存に失敗しました。');
    }
  }

  async function loadNow(profile, isAuto = false){
    var folder = await getFolderHandle(profile, !isAuto);
    if (!folder) { 
      if (!isAuto) alert('先に「同期フォルダ」へのアクセスを許可してください。'); 
      return; 
    }
    await autoLoad(profile, true);
  }

  async function autoLoad(profile, showMsg = false) {
    var folder = await getFolderHandle(profile, false);
    if (!folder) {
      initialLoadCompleted[profile] = true; // 権限がない場合はロック解除して進行
      return false;
    }
    
    try {
      var fh = await folder.getFileHandle(FILE_NAME[profile], {create:false});
      var f = await fh.getFile();
      
      var cloudMod = f.lastModified;
      var localMod = getLastModified(profile);
      
      if (!showMsg && cloudMod <= localMod) {
        initialLoadCompleted[profile] = true; // 変更なしでもロック解除
        return true;
      }
      
      var text = await f.text();
      var payload = JSON.parse(text);
      
      window.applyAllData(payload); 
      setLastModified(profile, cloudMod); 
      initialLoadCompleted[profile] = true; // ロード成功でロック解除
      
      if (showMsg) showToast(FILE_NAME[profile] + ' を読み込みました。');
      return true;
    } catch (e) {
      initialLoadCompleted[profile] = true; // ファイルがない等のエラー時もロック解除
      if (showMsg) alert('同期ファイルが見つかりません。先に保存を実行してください。');
      return false;
    }
  }

  async function reconnectSync(profile) {
    var folder = await getFolderHandle(profile, true);
    if (folder) {
      await autoLoad(profile, true);
      checkSyncStatus(profile);
    }
  }

  async function checkSyncStatus(profile) {
    var key = 'folder:' + profile;
    var h = await idbGet(key);
    var statusEl = pop.querySelector('.sync-status-msg');
    if (!statusEl) return;
    
    if (!h) {
      statusEl.innerHTML = '<span style="color:#eab308">⚠️ 未設定</span>';
    } else {
      var p = await (h.queryPermission ? h.queryPermission({mode:'readwrite'}) : 'granted');
      if (p === 'granted') {
        statusEl.innerHTML = '<span style="color:#10b981">✅ 同期中</span>';
      } else {
        statusEl.innerHTML = '<span style="color:#ef4444">❌ 権限切れ</span> <button class="dp-btn" data-act="reconnect" style="height:22px; padding:0 8px; font-size:11px; margin-left:6px;">再接続</button>';
      }
    }
  }

  function showToast(msg) {
    let t = document.getElementById('syncToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'syncToast';
      t.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#334155; color:#fff; padding:10px 20px; border-radius:30px; font-size:13px; font-weight:bold; z-index:9999; opacity:0; transition:opacity 0.3s; pointer-events:none; box-shadow:0 4px 12px rgba(0,0,0,0.15);';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    setTimeout(() => { t.style.opacity = '0'; }, 3000);
  }

  function loadAutosave(){ try { return JSON.parse(localStorage.getItem(AUTOSAVE_KEY)) || {work:false, private:false}; } catch { return {work:false, private:false}; } }
  function saveAutosave(st){ localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(st)); }
  var autosaveTimers = { work:null, private:null };
  
  function setupAutosave(profile, enabled){
    if (autosaveTimers[profile]) { clearInterval(autosaveTimers[profile]); autosaveTimers[profile] = null; }
    if (enabled) { 
      autosaveTimers[profile] = setInterval(function(){ 
        saveNow(profile, true); 
      }, 30000); // 30秒に1回チェック
    }
  }
  
  var st = loadAutosave();
  setupAutosave('work', !!st.work);
  setupAutosave('private', !!st.private);

  // ★ 起動時オートロード
  setTimeout(() => {
    getFolderHandle('work', false).then(h => { if(h) autoLoad('work'); else initialLoadCompleted['work']=true; });
    getFolderHandle('private', false).then(h => { if(h) autoLoad('private'); else initialLoadCompleted['private']=true; });
  }, 500);

  var tabs = pop.querySelectorAll('.dp-tab');
  var autosaveCheckbox = pop.querySelector('input[type="checkbox"][data-act="autosave"]');
  function refreshAutosaveCheck(){ if (autosaveCheckbox) autosaveCheckbox.checked = !!st[currentProfile]; }
  
  function switchTab(to){
    currentProfile = to;
    tabs.forEach(function(t){
      var on = (t.dataset.prof === to);
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    refreshAutosaveCheck();
    checkSyncStatus(to);
  }
  switchTab('work');

  pop.addEventListener('change', function(e){
    var c = e.target.closest('input[type="checkbox"][data-act="autosave"]');
    if (!c) return;
    st[currentProfile] = !!c.checked;
    saveAutosave(st);
    setupAutosave(currentProfile, !!c.checked);
  });
})();