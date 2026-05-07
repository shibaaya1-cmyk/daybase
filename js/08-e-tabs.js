(function(){
    const btnTodo  = document.getElementById('eTabTodo');
    const btnTimer = document.getElementById('eTabTimer');
    const btnCL    = document.getElementById('eTabChecklist');

    const panelTodo  = document.getElementById('todoPanel');
    const panelTimer = document.getElementById('timerPanel');
    const panelCL    = document.getElementById('checklistPanel');

    if (!btnTodo || !btnTimer || !btnCL || !panelTodo || !panelTimer || !panelCL) return;

    function activate(btn){
      [btnTodo, btnTimer, btnCL].forEach(b => b && b.classList.toggle('active', b===btn));
      panelTodo.style.display  = (btn===btnTodo)  ? 'grid' : 'none';
      panelTimer.style.display = (btn===btnTimer) ? ''     : 'none';
      panelCL.style.display    = (btn===btnCL)    ? 'grid' : 'none';
      if (btn===btnCL && window.CL && CL.initIfNeeded) CL.initIfNeeded();
    }

    btnTodo .addEventListener('click', ()=> activate(btnTodo ));
    btnTimer.addEventListener('click', ()=> activate(btnTimer));
    btnCL   .addEventListener('click', ()=> activate(btnCL   ));
  })();

// 配置補正（ボタンは searchForm の右、ポップアップは body 直下）＋表示位置の再計算
document.addEventListener('DOMContentLoaded', () => {
  const searchArea = document.getElementById('searchArea');
  const searchForm = document.getElementById('searchForm');
  const dataBtn    = document.getElementById('cDataBtn');
  const popover    = document.getElementById('cDataPopover');

  if (searchArea && searchForm && dataBtn) {
    // ボタンは検索フォームの直後（右側）に固定
    searchForm.insertAdjacentElement('afterend', dataBtn);
  }

  if (popover && popover.parentElement !== document.body) {
    document.body.appendChild(popover); // レイアウト非干渉
  }

  // ポップアップのCSSを強制（固定配置 & 非表示時は display:none）
  Object.assign(popover.style, {
    position: 'fixed',
    zIndex: '99999',
    display: 'none'
  });

  // 既存 open/close を上書き（関数名が同じならこの定義が使われます）
  window.openDataPopover = function(){
    // いったん表示して寸法取得
    popover.style.display = 'block';
    // ボタンのビューポート座標
    const r = dataBtn.getBoundingClientRect();
    const popW = popover.offsetWidth || 320;
    const popH = popover.offsetHeight || 200;

    // 右端はみ出し対策・下方向基本配置
    const left = Math.min(Math.max(8, r.left), window.innerWidth - popW - 8);
    let top    = r.bottom + 8;
    // もし下に入らなければ上に出す
    if (top + popH + 8 > window.innerHeight) top = Math.max(8, r.top - popH - 8);

    popover.style.left = `${left}px`;
    popover.style.top  = `${top}px`;
  };
  window.closeDataPopover = function(){
    popover.style.display = 'none';
  };

  // 既存の開閉イベントがある場合はそこから上の関数を呼ぶように（なければ以下を追加）
  dataBtn.addEventListener('click', (e)=>{
    e.preventDefault();
    if (popover.style.display === 'none' || !popover.style.display) {
      window.openDataPopover();
    } else {
      window.closeDataPopover();
    }
  });
  document.addEventListener('click', (e)=>{
    if (!popover.contains(e.target) && e.target !== dataBtn && !dataBtn.contains(e.target)) {
      window.closeDataPopover();
    }
  });
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape') window.closeDataPopover();
  });
});
