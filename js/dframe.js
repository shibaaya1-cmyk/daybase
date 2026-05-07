(() => {
  // compact=1 なら余白最小化
  const usp = new URLSearchParams(location.search);
  if (usp.get('compact') === '1') document.body.classList.add('compact');

  const host  = document.getElementById('panelHost');
  const tabs  = [...document.querySelectorAll('.tab-btn')];
  
  // ★ journal を追加
  const panels = {
    calendar: document.getElementById('panel-calendar'),
    todo:     document.getElementById('panel-todo'),
    mindmap:  document.getElementById('panel-mindmap'),
    memo:     document.getElementById('panel-memo'),
    goals:    document.getElementById('panel-goals'),
    journal:  document.getElementById('panel-journal'),
    web:      document.getElementById('panel-web') // 互換用
  };
  const STORAGE_KEY = 'D_ACTIVE_TAB_V2'; // V2: 新タブ構成

  // タブ→外部HTMLの対応 (★ journal を追加)
  const includeMap = {
    calendar: 'd/calendar.html',
    todo:     'd/dtodo.html',
    mindmap:  'd/mindmap.html',
    goals:    'd/goals.html',
    journal:  'd/journal.html'
    // web は内蔵 iframe
  };

async function loadPanel(tab){
  /* ===== カレンダー（既存：iframe + calendar.js 注入） ===== */
  if (tab === 'calendar') {
    const el = panels.calendar;
    if (!el || el.dataset.loaded === 'true') return;

    el.innerHTML = `
      <div class="card" style="padding:0; position:relative;">
        <div id="calDiag" style="position:absolute;left:8px;top:8px;font-size:12px;color:#64748b;z-index:2">loading…</div>
        <iframe id="calFrame" title="カレンダー"></iframe>
      </div>`;

    const diag   = el.querySelector('#calDiag');
    const iframe = el.querySelector('#calFrame');

    function onMsg(ev){
      const d = ev.data || {};
      if (d.type === 'D_CAL_READY') { try{ diag.remove(); }catch{} window.removeEventListener('message', onMsg); }
      if (d.type === 'D_CAL_ERR')   { diag.textContent = 'ERROR: ' + d.message; }
    }
    window.addEventListener('message', onMsg);

    iframe.addEventListener('load', () => {
      try {
        const doc  = iframe.contentDocument || iframe.contentWindow.document;
        diag.textContent = 'calendar.html loaded (injecting JS)…';
        const jsUrl = new URL('calendar.js', iframe.contentWindow.location.href);
        const s = doc.createElement('script');
        s.src = jsUrl.href + '?v=' + Date.now();
        s.onload  = () => { diag.textContent = 'calendar.js loaded, waiting READY…'; };
        s.onerror = ()  => { diag.textContent = 'ERROR: cannot load ' + jsUrl.href; };
        doc.body.appendChild(s);
      } catch (e) {
        diag.textContent = 'ERROR: inject failed: ' + String(e);
      }
    });

    iframe.addEventListener('error', () => {
      diag.textContent = 'ERROR: calendar.html failed to load';
    });

    const calendarURL = new URL('d/calendar.html', location.href);
    calendarURL.searchParams.set('v', Date.now());   // キャッシュ回避
    calendarURL.searchParams.set('scale', '0.9');    // 任意倍率
    iframe.src = calendarURL.href;

    el.dataset.loaded = 'true';
    return;
  }

  /* ===== TODO一括管理（新規：iframe で読込） ===== */
  if (tab === 'todo') {
    const el = panels.todo;
    if (!el || el.dataset.loaded === 'true') return;

    el.innerHTML = `
      <div class="card" style="padding:0; position:relative; height:100%;">
        <div id="todoDiag" style="position:absolute;left:8px;top:8px;font-size:12px;color:#64748b;z-index:2">loading…</div>
        <iframe id="todoFrame" title="TODO一括管理" style="width:100%;height:100%;border:0;display:block"></iframe>
      </div>`;

    const diag = el.querySelector('#todoDiag');
    const ifr  = el.querySelector('#todoFrame');

    ifr.addEventListener('load',  () => { try{ diag.remove(); }catch{} });
    ifr.addEventListener('error', () => { diag.textContent = 'ERROR: dtodo.html failed to load'; });

    const todoURL = new URL('d/dtodo.html', location.href);
    todoURL.searchParams.set('v', Date.now()); // キャッシュ回避
    ifr.src = todoURL.href;

    el.dataset.loaded = 'true';
    return;
  }

  /* ===== マインドマップ（iframe で読込） ===== */
  if (tab === 'mindmap') {
    const el = panels.mindmap;
    if (!el || el.dataset.loaded === 'true') return;

    el.innerHTML = `
      <div class="card" style="position:relative; height:100%;">
        <div id="mmDiag" style="position:absolute;left:8px;top:8px;font-size:12px;color:#64748b;z-index:2">
          loading…
        </div>
        <iframe id="mindmapFrame" title="マインドマップ"></iframe>
      </div>`;

    const diag = el.querySelector('#mmDiag');
    const ifr  = el.querySelector('#mindmapFrame');

    ifr.addEventListener('load',  () => { try{ diag.remove(); }catch{} });
    ifr.addEventListener('error', () => { diag.textContent = 'ERROR: mindmap.html failed to load'; });

    const mmURL = new URL('d/mindmap.html', location.href);
    mmURL.searchParams.set('v', Date.now()); // キャッシュ回避
    ifr.src = mmURL.href;

    el.dataset.loaded = 'true';
    return;
  }

  /* ===== メモ（iframe で読込） ===== */
  if (tab === 'memo') {
    const el = panels.memo;
    if (!el || el.dataset.loaded === 'true') return;

    el.innerHTML = `
      <div class="card" style="position:relative; height:100%;">
        <div id="memoDiag" style="position:absolute;left:8px;top:8px;font-size:12px;color:#64748b;z-index:2">
          loading…
        </div>
        <iframe id="memoFrame" title="メモ" style="width:100%;height:100%;border:0;display:block"></iframe>
      </div>`;

    const diag = el.querySelector('#memoDiag');
    const ifr  = el.querySelector('#memoFrame');

    ifr.addEventListener('load',  () => { try{ diag.remove(); }catch{} });
    ifr.addEventListener('error', () => { diag.textContent = 'ERROR: dmemo.html failed to load'; });

    const memoURL = new URL('d/dmemo.html', location.href);
    memoURL.searchParams.set('v', Date.now()); // キャッシュ回避
    ifr.src = memoURL.href;

    el.dataset.loaded = 'true';
    return;
  }

  /* ★★★ 目標進捗管理（iframe で読込） ★★★ */
  if (tab === 'goals') {
    const el = panels.goals;
    if (!el || el.dataset.loaded === 'true') return;

    el.innerHTML = `
      <div class="card" style="position:relative; height:100%;">
        <div id="goalsDiag" style="position:absolute;left:8px;top:8px;font-size:12px;color:#64748b;z-index:2">
          loading…
        </div>
        <iframe id="goalsFrame" title="目標進捗管理" style="width:100%;height:100%;border:0;display:block"></iframe>
      </div>`;

    const diag = el.querySelector('#goalsDiag');
    const ifr  = el.querySelector('#goalsFrame');

    ifr.addEventListener('load',  () => { try{ diag.remove(); }catch{} });
    ifr.addEventListener('error', () => { diag.textContent = 'ERROR: goals.html failed to load'; });

    const goalsURL = new URL('d/goals.html', location.href);
    goalsURL.searchParams.set('v', Date.now()); // キャッシュ回避
    ifr.src = goalsURL.href;

    el.dataset.loaded = 'true';
    return;
  }

  /* ★★★ ジャーナル（iframe で読込） ★★★ */
  if (tab === 'journal') {
    const el = panels.journal;
    if (!el || el.dataset.loaded === 'true') return;

    el.innerHTML = `
      <div class="card" style="position:relative; height:100%; padding:0;">
        <div id="journalDiag" style="position:absolute;left:8px;top:8px;font-size:12px;color:#64748b;z-index:2">
          loading…
        </div>
        <iframe id="journalFrame" title="ジャーナル" style="width:100%;height:100%;border:0;display:block"></iframe>
      </div>`;

    const diag = el.querySelector('#journalDiag');
    const ifr  = el.querySelector('#journalFrame');

    ifr.addEventListener('load',  () => { try{ diag.remove(); }catch{} });
    ifr.addEventListener('error', () => { diag.textContent = 'ERROR: journal.html failed to load'; });

    const url = new URL('d/journal.html', location.href);
    url.searchParams.set('v', Date.now()); // キャッシュ回避
    ifr.src = url.href;

    el.dataset.loaded = 'true';
    return;
  }

  /* ===== それ以外（web 互換）は従来どおり ===== */
  if (tab === 'web') return; // 互換パネルは内蔵 iframe のまま

  const el = panels[tab];
  if (!el || el.dataset.loaded === 'true') return;
  const url = includeMap[tab];
  if (!url) {
    el.innerHTML = `<div class="card">"${tab}" の読み込み先が未設定です。</div>`;
    el.dataset.loaded = 'true';
    return;
  }
  try {
    const res = await fetch(url, { cache:'no-store' });
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    el.innerHTML = '';
    Array.from(doc.body.childNodes).forEach(node => el.appendChild(node.cloneNode(true)));
    el.dataset.loaded = 'true';
  } catch (e) {
    el.innerHTML = `<div class="card">読み込みに失敗しました：${String(e)}</div>`;
    el.dataset.loaded = 'true';
  }
}

  function setActive(tab){
    tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    Object.entries(panels).forEach(([k,el]) => { el.dataset.active = String(k === tab); });
    try { localStorage.setItem(STORAGE_KEY, tab); } catch {}
    loadPanel(tab);
    host.focus({preventScroll:true});
  }

  // 初期タブ（URL > localStorage > デフォルト=calendar）
  const urlTab = new URLSearchParams(location.search).get('tab');
  const savedTab = localStorage.getItem(STORAGE_KEY);
  setActive(urlTab || savedTab || 'calendar');

  tabs.forEach(btn => btn.addEventListener('click', () => setActive(btn.dataset.tab)));

  // ==== 互換API受け皿（index 側からの postMessage）====
  const webview = document.getElementById('webview');
  window.addEventListener('message', (ev) => {
    const data = ev.data || {};
    if (data.type === 'D_OPEN_URL' && typeof data.url === 'string' && data.url) {
      setActive('web'); webview.src = data.url;
    }
    if (data.type === 'D_SWITCH_TAB' && typeof data.tab === 'string') {
      if (panels[data.tab]) setActive(data.tab);
    }

    // ホームからの完全リセット
    if (data.type === 'D_GO_HOME') {
      const target = typeof data.tab === 'string' && panels[data.tab] ? data.tab : 'calendar';
      setActive(target);
      try { webview.src = 'about:blank'; } catch(_) {}
    }
  });

  // 親へ「準備完了」を通知（index の D_READY 待ち用）
  try { window.parent.postMessage({ type:'D_READY' }, '*'); } catch {}
})();