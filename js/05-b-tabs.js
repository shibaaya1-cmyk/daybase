(function(){
  // タブとパネルを取得
  const tabV = document.getElementById('bTabVideos');      // 「動画」タブ
  const tabS = document.getElementById('bTabSchedule');    // 「スケジュール」タブ
  const pnlV = document.getElementById('bPanelVideos');    // 動画パネル
  const pnlS = document.getElementById('bPanelSchedule');  // スケジュールパネル

  // 存在チェック（念のため）
  if (!tabV || !tabS || !pnlV || !pnlS) return;

  // 表示切替の本体
  function show(mode){
    const showVideos   = (mode === 'videos');
    const showSchedule = !showVideos;

    // タブの見た目
    tabV.classList.toggle('active', showVideos);
    tabS.classList.toggle('active', showSchedule);

    // パネル表示（CSSより強い inline-style で確実に切替）
    // スケジュールは CSS で grid レイアウトなので 'grid' 指定にしておく
    pnlV.style.display = showVideos   ? 'block' : 'none';
    pnlS.style.display = showSchedule ? 'grid'  : 'none';

    // 旧CSSの .b-panel.show を使っている場合に備えてクラスも同期
    pnlV.classList.toggle('show', showVideos);
    pnlS.classList.toggle('show', showSchedule);

    // スケジュール表示のときは再描画＆スクロール
    if (showSchedule) {
      if (window.renderAll) window.renderAll();
      const d = document.getElementById('tlDate')?.value;
      if (window.scrollTimelineTo && d) window.scrollTimelineTo(d);
    }
  }

  // クリックで切替
  tabV.onclick = () => show('videos');
  tabS.onclick = () => show('schedule');

  // 初期表示：スケジュール（ご希望どおり）
  show('schedule');
})();
