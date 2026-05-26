(function(){
  // タブとパネルを取得
  const tabV = document.getElementById('bTabVideos');      // 「動画」タブ
  const tabS = document.getElementById('bTabSchedule');    // 「スケジュール」タブ
  const tabK = document.getElementById('bTabKeep');        // 「キープ」タブ
  const pnlV = document.getElementById('bPanelVideos');    // 動画パネル
  const pnlS = document.getElementById('bPanelSchedule');  // スケジュールパネル
  const pnlK = document.getElementById('bPanelKeep');      // キープパネル

  if (!tabV || !tabS || !tabK || !pnlV || !pnlS || !pnlK) {
      console.error("Bフレームの要素が見つかりません。HTMLを確認してください。");
      return;
  }

  // 表示切替の本体
  function show(mode){
    const showVideos   = (mode === 'videos');
    const showSchedule = (mode === 'schedule');
    const showKeep     = (mode === 'keep');

    // タブの色を変える
    tabV.classList.toggle('active', showVideos);
    tabS.classList.toggle('active', showSchedule);
    tabK.classList.toggle('active', showKeep);

    // 【最終手段】JSから直接 !important 付きでスタイルを強制上書きする
    pnlV.style.setProperty('display', showVideos ? 'block' : 'none', 'important');
    pnlS.style.setProperty('display', showSchedule ? 'grid' : 'none', 'important');
    pnlK.style.setProperty('display', showKeep ? 'flex' : 'none', 'important');

    if (showSchedule) {
      if (window.renderAll) window.renderAll();
      const d = document.getElementById('tlDate')?.value;
      if (window.scrollTimelineTo && d) window.scrollTimelineTo(d);
    }
  }

  // クリックで切替
  tabV.onclick = () => show('videos');
  tabS.onclick = () => show('schedule');
  tabK.onclick = () => show('keep');

  // 初期表示：スケジュール
  show('schedule');

  /* =========================================================
     ▼ クイックメモ（付箋）のロジック処理
     ========================================================= */
  const btnKeepMemo = document.getElementById('btnKeepMemo');
  const memoInput = document.getElementById('quickMemoInput');
  const memoList = document.getElementById('quickMemoList');
  const KEEP_TMP_KEY = 'D_KEEP_TEMP_V1';

  function loadTempKeeps() {
    try { return JSON.parse(localStorage.getItem(KEEP_TMP_KEY)) || []; } 
    catch(e){ return []; }
  }

  function renderTempKeeps() {
    if (!memoList) return;
    const list = loadTempKeeps();
    memoList.innerHTML = '';
    
    list.forEach(memo => {
      const div = document.createElement('div');
      div.style.cssText = "background:#fff9c4; border:1px solid #e5e7eb; padding:10px; border-radius:6px; font-size:12px; color:#333; box-shadow:0 1px 2px rgba(0,0,0,0.05); flex-shrink:0;";
      
      const text = document.createElement('div');
      text.style.whiteSpace = "pre-wrap";
      text.innerText = memo.text;
      div.appendChild(text);

      const btnBox = document.createElement('div');
      btnBox.style.cssText = "display:flex; justify-content:flex-end; gap:6px; margin-top:8px;";

      const btnDel = document.createElement('button');
      btnDel.innerText = '削除';
      btnDel.style.cssText = "padding:4px 8px; font-size:11px; background:#fff; border:1px solid #dc2626; color:#dc2626; border-radius:4px; cursor:pointer;";
      btnDel.onclick = () => {
        const newList = loadTempKeeps().filter(m => m.id !== memo.id);
        localStorage.setItem(KEEP_TMP_KEY, JSON.stringify(newList));
        renderTempKeeps();
      };

      const btnSave = document.createElement('button');
      btnSave.innerText = '保存';
      btnSave.style.cssText = "padding:4px 8px; font-size:11px; background:#2b6cb0; border:none; color:#fff; border-radius:4px; cursor:pointer;";
      btnSave.onclick = () => {
        saveToNotesBoard(memo.text);
        const newList = loadTempKeeps().filter(m => m.id !== memo.id);
        localStorage.setItem(KEEP_TMP_KEY, JSON.stringify(newList));
        renderTempKeeps();
        if (typeof D_SWITCH_TAB === 'function') D_SWITCH_TAB('keep');
      };

      btnBox.appendChild(btnDel);
      btnBox.appendChild(btnSave);
      div.appendChild(btnBox);
      memoList.appendChild(div);
    });
  }

  function saveToNotesBoard(text) {
    const NOTES_KEY = 'D_KEEP_NOTES_V1';
    let notes = [];
    try { notes = JSON.parse(localStorage.getItem(NOTES_KEY)) || []; } catch(e){}
    
    notes.push({
      id: 'note_' + Date.now(),
      text: text,
      color: '#fff9c4',
      x: 30 + (Math.random() * 40),
      y: 30 + (Math.random() * 40),
      w: 220,
      h: 180
    });
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    
    try { 
      const d = document.getElementById('dFrame') || document.getElementById('pageFrame');
      if(d) d.contentWindow.postMessage({ type: 'D_NOTES_UPDATED' }, '*');
    } catch(e){}
  }

  if (btnKeepMemo && memoInput) {
    btnKeepMemo.onclick = () => {
      const val = memoInput.value.trim();
      if (!val) return;
      const list = loadTempKeeps();
      list.unshift({ id: Date.now(), text: val });
      localStorage.setItem(KEEP_TMP_KEY, JSON.stringify(list));
      memoInput.value = '';
      renderTempKeeps();
    };
    renderTempKeeps();
  }
})();