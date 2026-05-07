(function(){
  // ---- 参照要素 ----
  const panel     = document.getElementById('resultPanel');
  const dFrame    = document.getElementById('dFrame');     // src="dframe.html?compact=1" を推奨
  const cseFrame  = document.getElementById('cseFrame');   // src="./results.html"
  const pageFrame = document.getElementById('pageFrame');  // 互換用
  const homeBtn   = document.getElementById('tabHome');    // ホームボタン

  // ---- 初期状態：dframe を前面に（used-d でプレースホルダ非表示）----
  if (panel) panel.classList.add('show-d','used-d');

  // ---- URL判定ユーティリティ ----
  const DFRAME_URL_BASIS = (dFrame?.getAttribute('src') || '').split('?')[0];
  const isHttpUrl = (u) => /^https?:\/\//i.test(u);
  const isInternalLike = (u) => {
    if (!u || u === 'about:blank') return true;                 // document.write系
    if (/^(data:|blob:|javascript:)/i.test(u)) return true;     // data/blob/js URL
    if (DFRAME_URL_BASIS && u.includes(DFRAME_URL_BASIS)) return true; // dframe自身
    return false;
  };

  // =========================================================
  // ① CSE結果（検索結果）の表示制御：抑止フラグ & D優先ウィンドウ対応
  // =========================================================
  const obsCSE = new MutationObserver(() => {
    // ホーム処理中 or D優先時間は CSE への切替を無視
    if (window.__D_SUPPRESS_CSE_ON_HOME) return;
    if (window.__D_FORCE_SHOW_D_UNTIL && Date.now() < window.__D_FORCE_SHOW_D_UNTIL) return;

    const url = cseFrame?.getAttribute('src') || '';
    if (url) {
      panel.classList.remove('show-d','show-page');
      panel.classList.add('show-cse');
    }
  });
  if (cseFrame) obsCSE.observe(cseFrame, { attributes:true, attributeFilter:['src'] });

  // =========================================================
  // ② pageFrame（互換用）の表示制御：外部は dframe に委譲、内部は page を前面
  // =========================================================
  const obsPage = new MutationObserver(() => {
    const url = pageFrame?.getAttribute('src') || '';

    // 内部生成（about:blank/data/blob/js）や自己参照は pageFrame を前面へ
    if (isInternalLike(url)) {
      panel.classList.remove('show-d','show-cse');
      panel.classList.add('show-page','used-d');
      return;
    }

    // 外部HTTP(S)URLは dframe の Webタブに委譲 → dframe を前面
    if (isHttpUrl(url)) {
      try { dFrame?.contentWindow?.postMessage({ type:'D_OPEN_URL', url }, '*'); } catch(e) {
        console.warn('[D] postMessage D_OPEN_URL failed:', e);
      }
      panel.classList.remove('show-cse','show-page');
      panel.classList.add('show-d','used-d');
      // pageFrame.src はクリアしない（白画面対策）
      return;
    }

    // それ以外は安全側で page を前面
    panel.classList.remove('show-d','show-cse');
    panel.classList.add('show-page','used-d');
  });
  if (pageFrame) obsPage.observe(pageFrame, { attributes:true, attributeFilter:['src'] });

  // about:blank → document.write 系の描画完了も拾って page を前面に
  pageFrame?.addEventListener('load', () => {
    try {
      const url = pageFrame.contentWindow?.location?.href || pageFrame.getAttribute('src') || '';
      if (isInternalLike(url)) {
        panel.classList.remove('show-d','show-cse');
        panel.classList.add('show-page','used-d');
      }
    } catch(_) { /* クロスオリジンは無視（外部URLは dframe 委譲済み） */ }
  });

  // =========================================================
  // ③ 明示API（将来の“postMessage統一”用）
  // =========================================================
  window.D_OPEN_URL = function(url){
    panel.classList.remove('show-cse','show-page');
    panel.classList.add('show-d','used-d');
    try { dFrame?.contentWindow?.postMessage({ type:'D_OPEN_URL', url }, '*'); } catch {}
  };
  window.D_SWITCH_TAB = function(tab){
    try { dFrame?.contentWindow?.postMessage({ type:'D_SWITCH_TAB', tab }, '*'); } catch {}
    panel.classList.remove('show-cse','show-page');
    panel.classList.add('show-d','used-d');
  };

  // dframe 側からの READY 受信時に d を前面（初期表示の安定化）
  window.addEventListener('message', (ev) => {
    if ((ev.data||{}).type === 'D_READY') {
      panel.classList.remove('show-cse','show-page');
      panel.classList.add('show-d','used-d');
    }
  });

  // =========================================================
  // ④ ホームボタン：検索結果表示中でも必ず dframe に戻す
  // =========================================================
  function resetDFrameToHome() {
    const dFr = dFrame, pFr = pageFrame, cFr = cseFrame;

    // CSE切替を一時抑止 & D優先ウィンドウ（200ms）
    window.__D_SUPPRESS_CSE_ON_HOME = true;
    window.__D_FORCE_SHOW_D_UNTIL = Date.now() + 200;

    // pageFrame は内容リセットのみ（内部描画の白残り回避）
    if (pFr) {
      try { pFr.src = 'about:blank'; } catch(_) {}
      pFr.style.display = '';
    }

    // dFrame の表示を保証（src が空なら補填、compact 付与）
    if (dFr) {
      dFr.style.display = '';
      let src = dFr.getAttribute('src') || 'dframe.html?compact=1';
      if (!/\bcompact=1\b/.test(src)) {
        const u = new URL(src, location.href);
        if (!u.searchParams.get('compact')) u.searchParams.set('compact','1');
        dFr.setAttribute('src', u.pathname + '?' + u.searchParams.toString());
      }
    }

    // 即時で D を前面、CSEを一時的に隠す（競合断ち切り）
    panel.classList.remove('show-cse','show-page');
    panel.classList.add('show-d','used-d');
    if (cFr) cFr.style.display = 'none';

    // dframe 内“ホーム相当タブ”へ（必要なら 'bookmarks' 等に変更）
    try {
      if (window.D_SWITCH_TAB) {
        D_SWITCH_TAB('search');
      } else if (dFr?.contentWindow) {
        dFr.contentWindow.postMessage({ type:'D_SWITCH_TAB', tab:'search' }, '*');
      }
    } catch(e) {
      console.warn('[Home] タブ切替エラー', e);
    }

    // 遅延でもう一度 D を前面化し、CSE の強制 display を解除 → 抑止解除
    setTimeout(() => {
      panel.classList.remove('show-cse','show-page');
      panel.classList.add('show-d','used-d');
      if (cFr) cFr.style.display = '';
      window.__D_SUPPRESS_CSE_ON_HOME = false;
    }, 150);
  }

  homeBtn?.addEventListener('click', resetDFrameToHome);
})();
