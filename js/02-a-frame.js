(() => {
  'use strict';

  // --- 状態管理 ---
  let ytApiReady = false;
  let ytPlayer = null;
  let currentPlayingUrl = ''; 
  let loopEnabled = false;

  const LS_KEYS = {
    LOOP: 'aFrameLoopEnabled',
    LAST_URL: 'aFrameVideoUrl',
    MODE: 'aPanelMode'
  };

  const el = {
    tabClock:  document.getElementById('aTabClock'),
    tabVideo:  document.getElementById('aTabVideo'),
    panelClk:  document.getElementById('panelClock'),
    panelVid:  document.getElementById('panelVideo'),
    form:      document.getElementById('aVidForm'),
    input:     document.getElementById('aVidUrl'),
    iframe:    document.getElementById('aVideoIframe'),
    ctrls:     document.getElementById('ytCtrls'),
    btnPrev:   document.getElementById('ytPrev'),
    btnNext:   document.getElementById('ytNext'),
    btnLoop:   document.getElementById('ytLoop') || document.getElementById('aLoopBtn'),
    btnReload: document.getElementById('ytReload') || document.getElementById('aReloadBtn'),
    aFrame:    document.getElementById('AFrame'),
    wrap:      document.getElementById('aVideoWrap'),
    box:       document.getElementById('aVideoBox')
  };

  // --- ① 時計機能（元々の完璧なアナログ時計のコードを完全復元） ---
  (function initClock(){
    try{
      const svgNS='http://www.w3.org/2000/svg';
      const minuteGroup=document.getElementById('minute-ticks');
      if (minuteGroup) {
        for(let i=0;i<60;i++){
          if(i%5===0) continue;
          const g=document.createElementNS(svgNS,'g');
          g.setAttribute('transform',`translate(50,50) rotate(${i*6})`);
          const r=document.createElementNS(svgNS,'rect');
          r.setAttribute('x','-0.5'); r.setAttribute('y','-44');
          r.setAttribute('width','1'); r.setAttribute('height','3');
          r.setAttribute('rx','0.5'); r.setAttribute('fill','#555555');
          g.appendChild(r); minuteGroup.appendChild(g);
        }
      }
      const cont=document.querySelector('#hour-ticks g g');
      if (cont) {
        for(let h=1;h<12;h++){
          const g=document.createElementNS(svgNS,'g');
          g.setAttribute('transform',`rotate(${h*30})`);
          const r=document.createElementNS(svgNS,'rect');
          r.setAttribute('x','-1'); r.setAttribute('y','-44');
          r.setAttribute('width','2'); r.setAttribute('height','7');
          r.setAttribute('rx','1'); r.setAttribute('fill','#EEEEEE');
          g.appendChild(r); cont.appendChild(g);
        }
      }
    }catch{}
    const hH=document.getElementById('hour-hand');
    const mH=document.getElementById('minute-hand');
    const sH=document.getElementById('second-hand');
    function tick(){
      const now=new Date();
      const s=now.getSeconds()+now.getMilliseconds()/1000;
      const m=now.getMinutes()+s/60;
      const h=(now.getHours()%12)+m/60;
      if(hH) hH.setAttribute('transform',`rotate(${h*30})`);
      if(mH) mH.setAttribute('transform',`rotate(${m*6})`);
      if(sH) sH.setAttribute('transform',`rotate(${s*6})`);
      requestAnimationFrame(tick);
    }
    tick();
  })();

  // --- ② UI表示切替（元のCSSクラスやhiddenプロパティに合わせる） ---
  function setViewMode(mode) {
    localStorage.setItem(LS_KEYS.MODE, mode);
    if (mode === 'video') {
      if (el.tabClock) el.tabClock.classList.remove('active');
      if (el.tabVideo) el.tabVideo.classList.add('active');
      if (el.panelClk) el.panelClk.hidden = true;
      if (el.panelVid) el.panelVid.hidden = false;
      if (el.form) el.form.classList.add('show');
      if (el.ctrls) el.ctrls.style.display = 'flex';
      fitVideoBox();
    } else {
      if (el.tabVideo) el.tabVideo.classList.remove('active');
      if (el.tabClock) el.tabClock.classList.add('active');
      if (el.panelVid) el.panelVid.hidden = true;
      if (el.panelClk) el.panelClk.hidden = false;
      if (el.form) el.form.classList.remove('show');
      if (el.ctrls) el.ctrls.style.display = 'none';
    }
  }

  function fitVideoBox() {
    if (el.panelVid?.hidden) return;
    if (!el.wrap || !el.box) return;
    const w = el.wrap.clientWidth, h = el.wrap.clientHeight;
    if (w === 0 || h === 0) return;
    const aspect = 16 / 9;
    let vw = w, vh = w / aspect;
    if (vh > h) { vh = h; vw = h * aspect; }
    el.box.style.width = Math.floor(vw) + 'px';
    el.box.style.height = Math.floor(vh) + 'px';
  }

  // --- ③ 動画読込・URLパース ---
  function parseUrl(url) {
    const s = String(url).trim();
    if (!s) return { isYt: false };
    const vMatch = s.match(/(?:v=|youtu\.be\/|embed\/)([^&?]+)/);
    const lMatch = s.match(/[?&]list=([^&]+)/);
    return { isYt: !!(vMatch || lMatch), v: vMatch ? vMatch[1] : null, l: lMatch ? lMatch[1] : null };
  }

  function loadVideo(url, force = false) {
    if (!url) return;
    const info = parseUrl(url);
    
    const params = new URLSearchParams();
    params.set('enablejsapi', '1');
    params.set('autoplay', '1');
    params.set('rel', '0');
    // リピートの制御はAPIで行うためURLパラメータのloopはつけないでおく
    if (info.l) params.set('list', info.l);

    const embedBase = 'https://www.youtube.com/embed/';
    const finalSrc = `${embedBase}${info.v || (info.l ? 'videoseries' : '')}?${params.toString()}`;

    if (!force && el.iframe && el.iframe.src === finalSrc) return;

    currentPlayingUrl = url;
    localStorage.setItem(LS_KEYS.LAST_URL, url);
    if (el.input) el.input.value = url;

    recreateIframe(finalSrc);
  }

  // 既存の枠が壊れないように、明示的に枠を作り直す関数
  function recreateIframe(src) {
    if (!el.box) return;
    
    if (ytPlayer) {
      try { ytPlayer.destroy(); } catch(e){}
      ytPlayer = null;
    }
    
    const newIframe = document.createElement('iframe');
    newIframe.id = 'aVideoIframe';
    newIframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    newIframe.allowFullscreen = true;
    newIframe.src = src;
    
    el.box.innerHTML = '';
    el.box.appendChild(newIframe);
    el.iframe = newIframe;

    newIframe.onload = () => {
      setTimeout(rebindApi, 500);
    };
  }

  // --- YouTube API 接続とリピートロジック ---
  function rebindApi() {
    if (!ytApiReady || !el.iframe) return;
    try {
      if (ytPlayer) return;

      ytPlayer = new window.YT.Player(el.iframe, {
        events: {
          'onReady': () => {
            // APIネイティブのループ設定を試みる（再生リストに有効）
            if (loopEnabled && ytPlayer.setLoop) ytPlayer.setLoop(true);
          },
          'onStateChange': (e) => {
            // ★ 動画が終了した（0）時の強制リピート処理
            if (e.data === 0 && loopEnabled) {
              try {
                const playlist = ytPlayer.getPlaylist();
                if (playlist && playlist.length > 0) {
                  // 再生リストの場合、最後の動画なら1曲目に戻す
                  const currentIdx = ytPlayer.getPlaylistIndex();
                  if (currentIdx === playlist.length - 1) {
                    ytPlayer.playVideoAt(0);
                  } else {
                    ytPlayer.nextVideo();
                  }
                } else {
                  // 単体動画の場合は時間を0秒に戻して再再生
                  ytPlayer.seekTo(0);
                  ytPlayer.playVideo();
                }
              } catch (err) {
                // エラー時のお守り
                ytPlayer.seekTo(0);
                ytPlayer.playVideo();
              }
            }
          }
        }
      });
    } catch (e) { 
      console.warn("YouTube APIの再接続に失敗しました", e); 
    }
  }

  // --- ボタン操作 ---
  function handleReload() {
    if (currentPlayingUrl) loadVideo(currentPlayingUrl, true);
  }

  function toggleLoop() {
    loopEnabled = !loopEnabled;
    localStorage.setItem(LS_KEYS.LOOP, loopEnabled ? '1' : '0');
    updateLoopUI();
    
    // APIが繋がっていればネイティブ設定も更新する（画面リロードはしない）
    if (ytPlayer && ytPlayer.setLoop) {
      try { ytPlayer.setLoop(loopEnabled); } catch(e){}
    }
  }

  function updateLoopUI() {
    if (!el.btnLoop) return;
    el.btnLoop.classList.toggle('active', loopEnabled);
    if (loopEnabled) {
      el.btnLoop.style.backgroundColor = '#2b6cb0';
      el.btnLoop.style.color = '#ffffff';
      el.btnLoop.style.borderColor = '#2b6cb0';
    } else {
      el.btnLoop.style.backgroundColor = '';
      el.btnLoop.style.color = '';
      el.btnLoop.style.borderColor = '';
    }
  }

  // --- イベント登録 ---
  if (el.tabClock) el.tabClock.addEventListener('click', () => setViewMode('clock'));
  if (el.tabVideo) el.tabVideo.addEventListener('click', () => setViewMode('video'));
  
  if (el.form) {
    el.form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (el.input) loadVideo(el.input.value, true);
    });
  }

  if (el.btnPrev) el.btnPrev.addEventListener('click', () => { try { ytPlayer?.previousVideo(); } catch(e){} });
  if (el.btnNext) el.btnNext.addEventListener('click', () => { try { ytPlayer?.nextVideo(); } catch(e){} });
  if (el.btnLoop) el.btnLoop.addEventListener('click', toggleLoop);
  if (el.btnReload) el.btnReload.addEventListener('click', handleReload);

  window.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'D_OPEN_URL') {
      loadVideo(ev.data.url, true);
      setViewMode('video');
    }
  });

  // --- 初期化 ---
  window.onYouTubeIframeAPIReady = () => { 
    ytApiReady = true; 
    rebindApi(); 
  };

  if (!window.YT) {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }

  loopEnabled = localStorage.getItem(LS_KEYS.LOOP) === '1';
  updateLoopUI();

  const lastUrl = localStorage.getItem(LS_KEYS.LAST_URL);
  if (lastUrl) loadVideo(lastUrl, true);

  setViewMode(localStorage.getItem(LS_KEYS.MODE) || 'clock');

  const ro = new ResizeObserver(fitVideoBox);
  if (el.aFrame) ro.observe(el.aFrame);
  window.addEventListener('resize', fitVideoBox);

})();