// グローバルな JS エラー検出（どのスクリプトで死んでも捕まえる）
  window.addEventListener('error', function (e) {
    console.error('[GLOBAL ERROR]', e.message, e.filename + ':' + e.lineno + ':' + e.colno);
  });

  // Promise のエラー（非同期エラー）も拾う
  window.addEventListener('unhandledrejection', function (e) {
    console.error('[UNHANDLED REJECTION]', e.reason);
  });

// 1) reload を呼ぶ犯人を特定
(function(){
  const origReload = window.location.reload;
  window.location.reload = function(){
    console.group('[TRACE] location.reload が呼ばれました');
    console.trace();
    console.groupEnd();
    return origReload.apply(this, arguments);
  };

  // 2) 履歴操作／ナビゲーションの痕跡
  ['hashchange','popstate','beforeunload','pagehide','unload','visibilitychange'].forEach(ev=>{
    window.addEventListener(ev, () => console.log('[NAV]', ev, document.visibilityState), {capture:true});
  });

  const _push = history.pushState, _rep = history.replaceState;
  history.pushState = function(){ console.log('[NAV] pushState', arguments); return _push.apply(this, arguments); };
  history.replaceState = function(){ console.log('[NAV] replaceState', arguments); return _rep.apply(this, arguments); };

  // 3) storage イベント監視（他フレーム／タブでの localStorage 更新検知）
  window.addEventListener('storage', (e)=>{
    console.log('[STORAGE]', e.key, e.oldValue, '->', e.newValue, 'from', e.url);
  }, false);

  // 4) 読み込み関数を呼んでいないかチェック
  const _loadNow = window.loadNow;
  if (typeof _loadNow === 'function') {
    window.loadNow = async function(){
      console.log('[TRACE] loadNow 呼び出し');
      console.trace();
      return _loadNow.apply(this, arguments);
    };
  }
})();

    /* サイドバー開閉 */
    function toggleLeft(){
      document.body.classList.toggle("left-collapsed");
      document.querySelector(".toggle-left").textContent =
        document.body.classList.contains("left-collapsed") ? "➡" : "⬅";
    }
    function toggleRight(){
      document.body.classList.toggle("right-collapsed");
      document.querySelector(".toggle-right").textContent =
        document.body.classList.contains("right-collapsed") ? "⬅" : "➡";
    }

    /* C：検索/ブックマーク 切替 */
    const tabSearch = document.getElementById('tabSearch');
    const tabBm = document.getElementById('tabBm');
    const searchArea = document.getElementById('searchArea');
    const bmArea = document.getElementById('bmArea');
    function switchMode(mode){
      if (mode === 'search'){
        tabSearch.classList.add('active'); tabBm.classList.remove('active');
        searchArea.style.display = 'flex';  bmArea.style.display = 'none';
      } else {
        tabBm.classList.add('active'); tabSearch.classList.remove('active');
        searchArea.style.display = 'none';  bmArea.style.display = 'flex';
        renderBookmarks();
      }
    }
    tabSearch.addEventListener('click', () => switchMode('search'));
    tabBm.addEventListener('click',    () => switchMode('bm'));
    switchMode('search');

    /* D：検索実行（キーワード→CSE、URL→そのまま表示） */
    const form   = document.getElementById('searchForm');
    const input  = document.getElementById('searchInput');
    const ph     = document.getElementById('placeholder');
    const cseFr  = document.getElementById('cseFrame');
    const pageFr = document.getElementById('pageFrame');

    function hide(el){ el.style.display = 'none'; }
    function show(el){ el.style.display = 'block'; }
    function isLikelyUrl(text){ return /^https?:\/\//i.test(text) || /^[\w-]+(\.[\w-]+)+/.test(text); }
    function openInPageFrame(url){
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      hide(cseFr); show(pageFr); ph.style.display = 'none'; pageFr.src = url;
    }
    function sendQueryToCSE(query){
      cseFr.contentWindow.postMessage({ type: 'search', query }, '*');
      hide(pageFr); show(cseFr); ph.style.display = 'none';
    }
    form.addEventListener('submit', (ev)=>{
      ev.preventDefault();
      const q = (input.value||'').trim(); if (!q) return;
      if (isLikelyUrl(q)) openInPageFrame(q); else sendQueryToCSE(q);
    });
     
    // ===== Dフレームへ確実に戻す =====
    const homeBtn = document.getElementById('tabHome');

    function resetDFrameToHome() {
      const panel  = document.getElementById('resultPanel');
      const dFr    = document.getElementById('dFrame');
      const pageFr = document.getElementById('pageFrame');
      const cseFr  = document.getElementById('cseFrame');

      window.__D_SUPPRESS_CSE_ON_HOME = true;
      window.__D_FORCE_SHOW_D_UNTIL = Date.now() + 200;

      if (pageFr) {
        try { pageFr.src = 'about:blank'; } catch(_) {}
        pageFr.style.display = '';
      }

      panel.classList.remove('show-cse','show-page');
      panel.classList.add('show-d','used-d');
      if (cseFr) cseFr.style.display = 'none';

      try {
        if (dFr?.contentWindow) {
          dFr.contentWindow.postMessage({ type:'D_GO_HOME', tab:'calendar' }, '*');
        }
      } catch(e) {
        console.warn('[Home] D_GO_HOME 送信失敗:', e);
      }

      setTimeout(() => {
        panel.classList.remove('show-cse','show-page');
        panel.classList.add('show-d','used-d');
        if (cseFr) cseFr.style.display = '';
        window.__D_SUPPRESS_CSE_ON_HOME = false;
      }, 150);
    }

    homeBtn?.addEventListener('click', resetDFrameToHome);
    
/* ===== URLブックマーク（C）— ★階層対応・美UI・安全化版 ===== */
    (function() {
      const KEY_V2 = 'customBookmarksV2';
  
      const bmRail = document.getElementById('bmRail');
      const openMgr = document.getElementById('openManager');
  
      function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  
      function getFaviconUrl(url){
        try{
          const u=new URL(/^https?:\/\//i.test(url)?url:'https://'+url);
          return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=32`;
        }catch{ return ''; }
      }
      
      function openInDFrame(url){
        try{
          if (typeof openInPageFrame === 'function'){ openInPageFrame(url); return; }
        }catch(_){}
        const pf = document.getElementById('pageFrame'), cf = document.getElementById('cseFrame');
        if (cf) cf.style.display='none';
        if (pf){ pf.style.display='block'; pf.src = /^https?:\/\//i.test(url)?url:('https://'+url); }
      }
  
      function loadV2(){
        try{
          const v = JSON.parse(localStorage.getItem(KEY_V2));
          if (v && typeof v==='object' && v.root && Array.isArray(v.root.items) && Array.isArray(v.folders)) return v;
        }catch{}
        return { folders:[], root:{ items:[], collapsed:false } };
      }
  
      function buildFolderTree(folders) {
        const map = {};
        const roots = [];
        folders.forEach(f => map[f.id] = { ...f, children: [] });
        folders.forEach(f => {
          if (f.parentId && map[f.parentId]) map[f.parentId].children.push(map[f.id]);
          else roots.push(map[f.id]);
        });
        return roots;
      }
  
      /* ===== ポップオーバー ===== */
      let popBackdrop = null, popElem = null;
      function closePopover(){
        popElem?.remove(); popElem=null;
        popBackdrop?.remove(); popBackdrop=null;
        window.removeEventListener('keydown', onEsc);
      }
      function onEsc(e){ if (e.key==='Escape') closePopover(); }
  
      function appendFolderHTML(node, container, depth = 0) {
        if ((!node.items || node.items.length === 0) && (!node.children || node.children.length === 0)) return;
  
        const isSub = depth > 0;
        const fWrap = document.createElement('div');
        fWrap.style.marginBottom = isSub ? '4px' : '8px';
  
        const fHead = document.createElement('div');
        fHead.className = 'popover-folder-head';
        
        if (isSub) {
          fHead.style.cssText = `padding: 6px 8px; font-size: 12px; font-weight: 700; color: #475569; display: flex; align-items: center; cursor: pointer; border-bottom: 1px dashed #cbd5e1; user-select: none; transition: background 0.2s; border-radius: 6px;`;
          fHead.onmouseenter = () => fHead.style.background = '#f1f5f9';
          fHead.onmouseleave = () => fHead.style.background = 'transparent';
        } else {
          fHead.style.cssText = `padding: 8px 10px; font-size: 13px; font-weight: 700; color: #334155; display: flex; align-items: center; cursor: pointer; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; user-select: none; transition: background 0.2s;`;
          fHead.onmouseenter = () => fHead.style.background = '#f1f5f9';
          fHead.onmouseleave = () => fHead.style.background = '#f8fafc';
        }
        fHead.innerHTML = `<span style="margin-right:6px;">${isSub?'📁':'📂'} ${escapeHtml(node.name)}</span> <span class="caret" style="margin-left:auto; font-size:10px; transition:0.2s; transform: rotate(-90deg); color:#94a3b8;">▼</span>`;
  
        const fBody = document.createElement('div');
        fBody.style.cssText = `display: none; flex-direction: column; gap: 6px; padding: 8px 0 0 ${isSub?'12px':'10px'}; border-left: 2px solid ${isSub?'#cbd5e1':'#e2e8f0'}; margin-left: ${isSub?'6px':'8px'};`;
  
        if (node.items) {
          node.items.forEach(v => {
            const btn = document.createElement('button');
            btn.className = 'bm-item';
            btn.dataset.url = v.url;
            const ico = getFaviconUrl(v.url);
            btn.innerHTML = `${ico ? `<img src="${ico}">` : `<span>🔖</span>`} <span class="bm-title">${escapeHtml(v.title || '(無題)')}</span>`;
            fBody.appendChild(btn);
          });
        }
        
        if (node.children) {
          node.children.forEach(child => appendFolderHTML(child, fBody, depth + 1));
        }
  
        fHead.onclick = (e) => {
          e.stopPropagation();
          const isOpen = fBody.style.display === 'flex';
          fBody.style.display = isOpen ? 'none' : 'flex';
          fHead.querySelector('.caret').style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0deg)';
        };
  
        fWrap.appendChild(fHead);
        fWrap.appendChild(fBody);
        container.appendChild(fWrap);
      }
  
      function openFolderPopover(folderNode, anchorEl){
        closePopover();
        popBackdrop = document.createElement('div');
        popBackdrop.className = 'bm-popover-backdrop';
        popBackdrop.addEventListener('click', closePopover);
        document.body.appendChild(popBackdrop);
  
        popElem = document.createElement('div');
        popElem.className = 'bm-popover';
        
        const head = document.createElement('div');
        head.className = 'bm-popover-head';
        head.innerHTML = `<span>📂</span><span>${escapeHtml(folderNode.name || '（名前なし）')}</span>`;
        popElem.appendChild(head);
  
        const body = document.createElement('div');
        body.className = 'bm-popover-body';
        
        if (folderNode.items && folderNode.items.length > 0) {
          folderNode.items.forEach(v => {
            const btn = document.createElement('button');
            btn.className = 'bm-item';
            btn.dataset.url = v.url;
            const ico = getFaviconUrl(v.url);
            btn.innerHTML = `${ico ? `<img src="${ico}">` : `<span>🔖</span>`} <span class="bm-title">${escapeHtml(v.title || '(無題)')}</span>`;
            body.appendChild(btn);
          });
        }
  
        if (folderNode.children && folderNode.children.length > 0) {
          folderNode.children.forEach(child => appendFolderHTML(child, body, 1));
        }
  
        if (body.children.length === 0) {
          body.innerHTML = '<div style="color:#94a3b8; font-size:12px; padding:6px 4px; text-align:center;">（このフォルダにはまだありません）</div>';
        }
  
        popElem.appendChild(body);
        document.body.appendChild(popElem);
  
        const r = anchorEl.getBoundingClientRect();
        const top = r.bottom + window.scrollY + 6;
        let left = r.left + window.scrollX;
        const maxLeft = window.scrollX + document.documentElement.clientWidth - popElem.offsetWidth - 8;
        if (left > maxLeft) left = Math.max(window.scrollX + 8, maxLeft);
        popElem.style.top = `${top}px`;
        popElem.style.left = `${left}px`;
  
        popElem.addEventListener('click', (e)=>{
          const btn = e.target.closest('.bm-item');
          if (!btn) return;
          const url = btn.getAttribute('data-url');
          if (url) openInDFrame(url);
          closePopover();
        });
        window.addEventListener('keydown', onEsc);
      }
  
      /* ===== バー描画 ===== */
      function renderBookmarks(){
        closePopover();
        const data = loadV2();
  
        const tree = buildFolderTree(data.folders);
        
        // ★ IDによる安全な紐付けのためにグローバルにツリーを保存
        window.__bmTree = tree;
  
        const foldersHTML = tree.map(f=>{
          const name = escapeHtml(f.name||'（名前なし）');
          return `
            <button class="bm-folder-btn" data-id="${f.id}" title="${name}">
              <span>📁</span>
              <span class="name">${name}</span>
              <span class="caret">▾</span>
            </button>
          `;
        }).join('');
  
        const rootHTML = (data.root?.items||[]).map(it=>{
          const ico = getFaviconUrl(it.url);
          return `<button class="bm-item" data-url="${it.url}" title="${it.title} - ${it.url}">
            ${ico ? `<img src="${ico}">` : `<span>🔖</span>`}
            <span class="bm-title">${escapeHtml(it.title)}</span>
          </button>`;
        }).join('');
  
        if (bmRail) {
          bmRail.innerHTML = (foldersHTML + rootHTML) || '<div style="color:#94a3b8; font-size:12px; padding:6px 10px;">ブックマークはまだありません</div>';
        }
      }
  
      if (bmRail) {
        bmRail.addEventListener('click', (e)=>{
          const bm = e.target.closest('.bm-item');
          if (bm){ openInDFrame(bm.getAttribute('data-url')); return; }
    
          const folderBtn = e.target.closest('.bm-folder-btn');
          if (folderBtn){
            const id = folderBtn.dataset.id;
            const tree = window.__bmTree || [];
            const nodeData = tree.find(n => n.id === id);
            if (nodeData) openFolderPopover(nodeData, folderBtn);
          }
        });
      }
  
      if (openMgr) {
        openMgr.addEventListener('click', ()=>{
          const cseFr  = document.getElementById('cseFrame');
          const pageFr = document.getElementById('pageFrame');
          if (cseFr)  cseFr.style.display='none';
          if (pageFr){ pageFr.style.display='block'; pageFr.src='./bookmarks.html'; }
        });
      }
  
      window.addEventListener('storage', (e)=>{
        if (e.key===KEY_V2) renderBookmarks();
      });
      window.addEventListener('message', (e)=>{
        if (e.data && e.data.type === 'D_BOOKMARKS_UPDATED') renderBookmarks();
      });
  
      renderBookmarks();
    })();
  
    /* ===== Bフレーム：動画ブックマーク（既存維持）===== */
    (function() {
      const VB_KEY_V2 = 'D_VID_V2';
      const openVideoBmManagerBtn = document.getElementById('openVideoBmManager');
  
      if (openVideoBmManagerBtn) {
        openVideoBmManagerBtn.addEventListener('click', () => {
          const pf = document.getElementById('pageFrame') || (window.parent && window.parent.document.getElementById('pageFrame'));
          const cf = document.getElementById('cseFrame')  || (window.parent && window.parent.document.getElementById('cseFrame'));
          const ph = document.getElementById('placeholder') || (window.parent && window.parent.document.getElementById('placeholder'));
  
          if (cf) cf.style.display = 'none';
          if (ph) ph.style.display = 'none';
  
          const url = new URL('./video-bookmarks.html', location.href).toString();
          if (pf) {
            pf.style.display = 'block';
            pf.src = url;
          } else {
            window.open(url, '_blank', 'noopener');
          }
        });
      }
    })();