/* ===== Eフレーム：TODO / タイマー 切替 & タイマー本体（ドーナツ版） ===== */
  (function(){
    const tabTodo  = document.getElementById('eTabTodo');
    const tabTimer = document.getElementById('eTabTimer');
    const listPanel= document.getElementById('todoPanel') || document.getElementById('todoList');
    const timerEl  = document.getElementById('timerPanel');
      // ★もしタイマーパネルがまだ DOM に無ければ、何もせず終了（例外で全体が止まるのを防ぐ）
  if (!timerEl) {
    console.warn('[TimerInit] #timerPanel が見つからないため、タイマー初期化をスキップしました。');
    return;
  }
    const MODE_KEY = 'ePanelModeV1';
    const pomoStatus = document.getElementById('pomoStatus');

    function show(mode){
      const isTimer = (mode === 'timer');
      tabTodo?.classList.toggle('active', !isTimer);
      tabTimer?.classList.toggle('active',  isTimer);
      if (listPanel){ listPanel.style.display = isTimer ? 'none'  : (listPanel.id==='todoPanel'?'grid':'block'); }
      timerEl.style.display = isTimer ? 'block' : 'none';
      try{ localStorage.setItem(MODE_KEY, isTimer ? 'timer' : 'todo'); }catch(_){}
    }
    tabTodo?.addEventListener('click', ()=> show('todo'));
    tabTimer?.addEventListener('click', ()=> show('timer'));
    show(localStorage.getItem(MODE_KEY) || 'todo');

    // ==== 終了処理を一元化（音声ON→読み上げ / OFF→ビープ）====
    let __finishing = false;
    function finishAll(message='終了です。お疲れさまでした。'){
      if (__finishing) return;          // 同時多発の保険
      __finishing = true;
      try{
        window.stopBeep && stopBeep();  // 走っている音を停止
        speakOrBeep(message, { kind:'end' }); // 音声 or ビープ（speakOrBeep に一本化）
        pause();                        // 状態を停止へ（IIFE 内の pause を呼ぶ）
        if (tMain) tMain.textContent = '0:00';
        save();
      } finally {
        // 次のフレームで解錠（多重終了を抑止）
        setTimeout(()=>{ __finishing = false; }, 0);
      }
    }
    
    /* === タイマー（持続保存つき） === */
    const tMain = document.getElementById('tTimeMain') || document.getElementById('tDisplayMain');
    const tSub  = document.getElementById('tTimeSub')  || document.getElementById('tDisplaySub');
    const tEta = document.getElementById('tEta');
    let etaTickerId = 0;
    const tMin     = document.getElementById('tMinutes');
    const tStart   = document.getElementById('tStart');
    const tPause   = document.getElementById('tPause');
    const tReset   = document.getElementById('tReset');
    const tPresets = timerEl?.querySelectorAll('.t-presets button') || [];
    [tStart, tPause, tReset].forEach(el => el?.addEventListener('click', ()=> {
      window.ensureAudio && window.ensureAudio();
      window.ensureSpeech && window.ensureSpeech();   // ★追加
    }));
    tPresets.forEach(btn => btn.addEventListener('click', ()=> {
      window.ensureAudio && window.ensureAudio();
      window.ensureSpeech && window.ensureSpeech();   // ★追加
    }));

    const tpFg       = document.getElementById('tpFg');
    const tpBg       = document.getElementById('tpBg');
    const tpInnerFg  = document.getElementById('tpInnerFg');
    const tpInnerBg  = document.getElementById('tpInnerBg');
    const tModeTabs      = document.getElementById('timerModeTabs');
    const tModeBtnNormal = document.getElementById('tModeBtnNormal');
    const tModeBtnPomo   = document.getElementById('tModeBtnPomo');

    // === 登録タイマー 用 参照（★ここに上げる） ===
    const tModeBtnReg   = document.getElementById('tModeBtnReg');
    const regWrap       = document.getElementById('regListWrap');
    const regListEl     = document.getElementById('regList');
    const regAddBtn     = document.getElementById('regAddBtn');
    const regClearBtn   = document.getElementById('regClearBtn');
    const regExportBtn  = document.getElementById('regExportBtn');
    const regImportBtn  = document.getElementById('regImportBtn');
    const regImportFile = document.getElementById('regImportFile');
    const currentTaskName = document.getElementById('currentTaskName');
    const regOverallEtaEl = document.getElementById('regOverallEta');

    const pWrap  = document.getElementById('pomoInputs');
    const pWork  = document.getElementById('pWork');
    const pBreak = document.getElementById('pBreak');
    const pLoops = document.getElementById('pLoops');
    const regViewEl = document.getElementById('regView'); // ★追加：表示専用側


    const R_OUT = 52, C_OUT = 2*Math.PI*R_OUT;
    const R_IN  = 42, C_IN  = 2*Math.PI*R_IN;
    
    if (tpInnerFg) {
        tpInnerFg.style.transform = '';
        tpInnerFg.style.transformOrigin = '';
      }
    if (tpFg)      tpFg.style.strokeDasharray      = `${C_OUT} ${C_OUT}`;
    if (tpInnerFg) tpInnerFg.style.strokeDasharray = `${C_IN} ${C_IN}`;

    const pLongOn    = document.getElementById('pLongOn');   // ← HTMLのIDに合わせる
    const pLongEvery = document.getElementById('pLongEvery');
    const pLongMin   = document.getElementById('pLongMin');

    /* ドーナツ描画 */
    const COLORS = { blue:'#2b6cb0', green:'#2ecc71', orange:'#f39c12', red:'#e74c3c' };
    const colorForRatio = (r)=>{
      if (r > 0.50) return COLORS.blue;
      if (r > 0.25) return COLORS.green;
      if (r > 0.12) return COLORS.orange;
      return COLORS.red;
    };
    function drawOuter(remainMs, totalMs){
      if (!tpFg) return;
      const total = Math.max(1, +totalMs || 1);
      const r = Math.max(0, Math.min(1, (+remainMs||0) / total));
      const visible = C_OUT * r;
      tpFg.style.strokeDasharray = `${visible} ${C_OUT}`;
      tpFg.style.stroke = colorForRatio(r);
    }
    function drawInner(remainMs, totalMs){
      if (!tpInnerFg) return;
      const total = Math.max(1, +totalMs || 1);
      const r = Math.max(0, Math.min(1, (+remainMs||0) / total));
      const visible = C_IN * r;
      tpInnerFg.style.strokeDasharray = `${visible} ${C_IN}`;
      tpInnerFg.style.stroke = colorForRatio(r);
      /* 内側は薄く（CSSで opacity:.6 を指定済み。ここでは色だけ追従） */
    }

    /* 状態 */
    const TKEY = 'timerStateV1';
    let timer = {
      mode:'normal', running:false,
      // ノーマル
      endAt:0, remain:0, lastSetMin:25, totalMs:25*60*1000,
      // 🍅設定
      pWorkMin:25, pBreakMin:5, pLoops:4,
      // 🍅進行
      pIdx:0, pSegTotal:0, pSegEndAt:0, pSegRemain:0, pTotalMs:0, pOverallEndAt:0,
      // 🍅ロングブレイク設定
      pLongOn: false,      // 使う/使わない
      pLongEvery: 4,       // 何セット毎に長め休憩
      pLongMin: 15         // 長め休憩の分数
    };
    try{ const v=JSON.parse(localStorage.getItem(TKEY)||'{}'); if(v && typeof v==='object') timer={...timer,...v}; }catch(_){}
    if (Number.isFinite(timer.lastSetMin)) tMin.value = timer.lastSetMin;

    /* 進捗しきい値 */
    let fired50=false, fired25=false, fired12=false;
    function primeMilestones(remMs, totalMs){
      const total=Math.max(1,+totalMs||1);
      const r=Math.max(0,(+remMs||0)/total);
      fired50=(r<=0.50); fired25=(r<=0.25); fired12=(r<=0.12);
    }

    // ——— モード切替の**正規版**（単一アクティブ＆UI切替を一括管理）———
    function applyModeUI(){
      const isP = (timer.mode==='pomo');
      const isN = (timer.mode==='normal');
      const isR = (timer.mode==='reg');

      // タブのON/OFF（単一アクティブ）
      tModeBtnNormal?.classList.toggle('active', isN);
      tModeBtnPomo  ?.classList.toggle('active', isP);
      tModeBtnReg   ?.classList.toggle('active', isR);

      tModeBtnNormal?.setAttribute('aria-pressed', String(isN));
      tModeBtnPomo  ?.setAttribute('aria-pressed', String(isP));
      tModeBtnReg   ?.setAttribute('aria-pressed', String(isR));

      const panel = document.getElementById('timerPanel');
      panel?.classList.toggle('pomo-on', isP);
      panel?.classList.toggle('reg-on',  isR);

      // 🍅専用UI
      if (pWrap)       pWrap.style.display = isP ? 'flex' : 'none';
      if (pomoStatus)  pomoStatus.style.display = isP ? 'flex' : 'none';

      // 登録UI
      if (regWrap) regWrap.style.display = isR ? 'block' : 'none';

      // ノーマル専用UI（分入力・プリセット）
      const minutesEl = document.getElementById('tMinutes');
      const presetsEl = panel?.querySelector('.t-presets');
      if (minutesEl) minutesEl.style.display = isN ? '' : 'none';
      if (presetsEl) presetsEl.style.display = isN ? '' : 'none';

      // いまの予定名
      if (currentTaskName) currentTaskName.style.display = isR ? '' : 'none';
      if (!isR && currentTaskName) currentTaskName.textContent = '';
    }


    // ——— クリックで確実に切り替えるための**正規版** setMode ———
    function setMode(m){
      if (timer.mode===m) return;
      if (timer.running) pause();            // 走行中ならいったん止める
      timer.mode = m;
      applyModeUI();                         // UIきりかえ
      render();                              // 表示更新
      save();                                // 永続化
    }

    // ——— クリックリスナーを**再バインド**（重複は気にせずOK）———
    try{
      tModeBtnNormal?.addEventListener('click', ()=> setMode('normal'), { passive:true });
      tModeBtnPomo  ?.addEventListener('click', ()=> setMode('pomo'),   { passive:true });
      tModeBtnReg   ?.addEventListener('click', ()=> setMode('reg'),    { passive:true });

      // クリック不能の保険（重なり対策）
      const tabs = document.getElementById('timerModeTabs');
      if (tabs){
        tabs.style.position = 'relative';
        tabs.style.zIndex = '20';
        tabs.style.pointerEvents = 'auto';
      }
    } catch(_){}



    function updatePomoStatus(){
      const wrap = document.getElementById('pomoStatus');
      if (!wrap) return;
      const isP = (timer.mode === 'pomo');
      wrap.style.display = isP ? 'flex' : 'none';
      if (!isP) return;

      const br = isBreak(timer.pIdx, timer.pLoops);
      const loopNum = Math.min(timer.pLoops, Math.floor(timer.pIdx / 2) + 1);
      const isLong = isLongBreakIdx(timer.pIdx, timer.pLoops);

      wrap.classList.toggle('break', br);
      wrap.classList.toggle('work',  !br);

      const stateLabel = br ? (isLong ? '🌙 長休憩中' : '☕ 休憩中') : '🔥 作業中';
      wrap.innerHTML =
        `<span class="state">${stateLabel}</span>` +
        `<span class="loop">${loopNum}/${timer.pLoops}</span>`;
    }


    applyModeUI();
    updatePomoStatus();

    /* 表示フォーマット */
    function fmt(ms){
      if (ms<0) ms=0;
    // ▶ 小数切り捨てで統一（双方の表示差をなくす）
      const total = Math.max(0, Math.floor(ms/1000));
      const h=Math.floor(total/3600);
      const m=Math.floor((total%3600)/60);
      const s=total%60;
      const mm = h>0 ? String(m).padStart(2,'0') : String(m);
      const hh = String(h);
      const ss = String(s).padStart(2,'0');
      return h>0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
    }

    // 時計表示（ローカル）: 例 "14:05"。翌日以降は "明日 01:05" / "M/D 01:05"
    function fmtETA(ts){
      if (!ts) return '';
      const d = new Date(ts);
      const hh = String(d.getHours()).padStart(2,'0');
      const mm = String(d.getMinutes()).padStart(2,'0');
      // 秒も出すなら↓を有効化
      // const ss = String(d.getSeconds()).padStart(2,'0');
      // return `${hh}:${mm}:${ss}`;
      return `${hh}:${mm}`;
    }

    // ETAを更新（remainMs と now から算出）
    // 絶対時刻で ETA をセット
    function setETAByAbs(ts){
      if (!tEta) return;
      tEta.textContent = ts ? `終了 ${fmtETA(ts)}` : '';
    }

    // 走行中は endAt / pOverallEndAt を使い、停止中は now + remain を使う
    function updateETA(mode, now){
      if (!tEta) return;
      if (mode === 'normal'){
        if (timer.running && timer.endAt){
          setETAByAbs(timer.endAt);                              // 走行中は固定
        } else {
          setETAByAbs(timer.remain > 0 ? now + timer.remain : 0); // 停止中はリアルタイム見込み
        }
      } else { // pomo
        if (timer.running && timer.pOverallEndAt){
          setETAByAbs(timer.pOverallEndAt);                      // 走行中は固定
        } else {
          setETAByAbs(timer.remain > 0 ? now + timer.remain : 0); // 停止中はリアルタイム見込み
        }
      }
    }

    // 停止中も毎秒 ETA を更新（走行中は render() 内で呼ばれるのでここは保険）
    function ensureEtaTicker(){
      if (etaTickerId) return;
      etaTickerId = setInterval(()=> updateETA(timer.mode, Date.now()), 1000);
    }
    function stopEtaTicker(){
      if (!etaTickerId) return;
      clearInterval(etaTickerId);
      etaTickerId = 0;
    }

    // 初期起動
    ensureEtaTicker();

    // ★ 変更点：バックグラウンドでも止まらないタイマー（setTimeout）を使用
    let renderTimerId = 0;
    function render(){
      updatePomoStatus();
      const now=Date.now();

      if (timer.mode==='normal'){
        const remain = timer.running ? (timer.endAt - now) : timer.remain;
        updateETA('normal', now);
        tMain.textContent = fmt(remain);
        if (tSub) tSub.textContent = ''; // サブ行は非表示（空文字）
        const wrap = document.getElementById('tRemainWrap');
        wrap?.classList.toggle('t-finished', remain<=0 && (timer.running || timer.remain===0));

        // ★開始・一時停止ボタンの有効／無効をここで制御
        {
          const startBtn = document.getElementById('tStart');
          const pauseBtn = document.getElementById('tPause');
          if (startBtn) startBtn.disabled = !!timer.running;   // 走行中は開始を押せなくする
          if (pauseBtn) pauseBtn.disabled = !timer.running;    // 走行中だけ一時停止を押せる
        }


        drawOuter(Math.max(0,remain), timer.totalMs);
        if (tpInnerFg){ tpInnerFg.style.strokeDasharray = `${C_IN} ${C_IN}`; tpInnerFg.style.stroke = 'transparent'; }

        if (timer.running){
          const ratio = Math.max(0,remain)/Math.max(1,timer.totalMs);
         if (!fired50 && ratio<=0.50){
           const ok = window.announceRemaining && announceRemaining(Math.max(0,remain), timer.totalMs, 0.5);
           if (!ok && window.beepMark) beepMark(0.5);
           fired50 = true;
         }
         if (!fired25 && ratio<=0.25){
           const ok = window.announceRemaining && announceRemaining(Math.max(0,remain), timer.totalMs, 0.25);
           if (!ok && window.beepMark) beepMark(0.25);
           fired25 = true;
         }
         if (!fired12 && ratio<=0.12){
           const ok = window.announceRemaining && announceRemaining(Math.max(0,remain), timer.totalMs, 0.12);
           if (!ok && window.beepMark) beepMark(0.12);
           fired12 = true;
         }

          if (remain <= 0){
            return finishAll('終了です。お疲れさまでした。');
          }
          // ★ 変更点：requestAnimationFrame から setTimeout に変更
          renderTimerId = setTimeout(render, 200);
        }
        return;
      }

      /* 🍅モード */
    const nowMs = Date.now();
    const overallRemain = timer.running ? (timer.pOverallEndAt - nowMs) : timer.remain;
    const segRemain     = timer.running ? (timer.pSegEndAt     - nowMs) : timer.pSegRemain;
      updateETA('pomo', now);

      // ==== 長休憩スイッチのUI同期（1回だけバインド） ====
      (function(){
        const pomoInputs = document.getElementById('pomoInputs');
        function syncLongBreakUI(){
          if (!pomoInputs) return;
          const on = !!pLongOn?.checked;
          pomoInputs.classList.toggle('use-long', on);
          try{
            if (typeof timer === 'object'){ timer.pUseLong = on; }
            if (typeof save  === 'function'){ save(); }
          }catch(_){}
        }
        // 初期反映 & リスナー（1回だけ）
        syncLongBreakUI();
        pLongOn?.addEventListener('change', syncLongBreakUI);
      })();

      // 表示：上=全体、下=区間
      tMain.textContent = fmt(overallRemain);
      if (tSub) tSub.textContent = fmt(segRemain);

      const wrap = document.getElementById('tRemainWrap');
      wrap?.classList.toggle('t-finished', overallRemain<=0 && (timer.running || timer.remain===0));

      // ★開始・一時停止ボタンの有効／無効をここで制御
      {
        const startBtn = document.getElementById('tStart');
        const pauseBtn = document.getElementById('tPause');
        if (startBtn) startBtn.disabled = !!timer.running;
        if (pauseBtn) pauseBtn.disabled = !timer.running;
      }

      drawOuter(Math.max(0,overallRemain), Math.max(1,timer.pTotalMs||timer.totalMs));
      drawInner(Math.max(0,segRemain),     Math.max(1,timer.pSegTotal||1));

      if (timer.running){
        const r = Math.max(0,segRemain)/Math.max(1,timer.pSegTotal);
      if (!fired50 && r<=0.50){
        const ok = window.announceRemaining && announceRemaining(Math.max(0,segRemain), timer.pSegTotal||1, 0.5);
        if (!ok && window.beepMark) beepMark(0.5);
        fired50 = true;
      }
      if (!fired25 && r<=0.25){
        const ok = window.announceRemaining && announceRemaining(Math.max(0,segRemain), timer.pSegTotal||1, 0.25);
        if (!ok && window.beepMark) beepMark(0.25);
        fired25 = true;
      }
      if (!fired12 && r<=0.12){
        const ok = window.announceRemaining && announceRemaining(Math.max(0,segRemain), timer.pSegTotal||1, 0.12);
        if (!ok && window.beepMark) beepMark(0.12);
        fired12 = true;
      }

      if (segRemain <= 0) {
        // 次の区間を、まず判定（← ここが先）
        const next = nextNonZeroIndex(
          Array.isArray(timer.regItems) ? timer.regItems : new Array(totalSegments(timer.pLoops)).fill({min:0}), 
          timer.pIdx + 1
        );

        // ポモドーロは「作業/休憩」を idx で管理しているので、
        // 本来は totalSegments(timer.pLoops) 到達で「最後」。
        // 既存ロジックに合わせ、next の算出を使わず下記で判断してもOK：
        const totSegs = totalSegments(timer.pLoops);
        const isLastSegment = (timer.pIdx + 1 >= totSegs);

        if (isLastSegment) {
          // ★終了は finishAll に一本化（音声ONなら読み上げ / OFFならビープ）
          return finishAll('終了です。お疲れさまでした。');
        }

        // まだ続く場合だけ、区間終了の「小ビープ」を鳴らす
        window.beepSegmentEnd && beepSegmentEnd();

        // 次の区間へ
        timer.pIdx++;
        updatePomoStatus();

        const st = segTotalMs(timer.pIdx, timer.pWorkMin, timer.pBreakMin, timer.pLoops);
        timer.pSegTotal = st;
        timer.pSegEndAt = Date.now() + st;
        timer.pSegRemain = st;
        primeMilestones(timer.pSegRemain, timer.pSegTotal);

        const isBreakNow2 = isBreak(timer.pIdx, timer.pLoops);
        speakOrBeep(isBreakNow2 ? '休憩時間です。' : '作業を開始してください。', { kind:'seg' });
      }


        if (overallRemain <= 0){
          return finishAll('終了です。お疲れさまでした。');
        }

        // ★ 変更点：requestAnimationFrame から setTimeout に変更
        renderTimerId = setTimeout(render, 200);
      }
    }

    function save(){
      try{ localStorage.setItem(TKEY, JSON.stringify({...timer, lastSetMin:+tMin.value||timer.lastSetMin })); }catch(_){}
    }

    function start(){
      if (timer.mode==='normal'){
        const mins = Math.max(0, Math.min(600, +tMin.value || 0));
        if (!timer.running && timer.remain===0){ timer.totalMs=mins*60*1000; timer.remain=timer.totalMs; }
        else if (!timer.running && timer.remain>0 && !timer.totalMs){ timer.totalMs=timer.remain; }
        const base = timer.running ? Math.max(0, timer.endAt - Date.now()) : (timer.remain || mins*60*1000);
        timer.endAt = Date.now() + base; timer.running = true; timer.lastSetMin = mins;
        speakOrBeep('タイマーを開始します。', { kind:'seg' });
        primeMilestones(timer.running ? Math.max(0,timer.endAt-Date.now()) : (timer.remain||0), timer.totalMs);
        clearTimeout(renderTimerId); render(); save(); return;
      }

      // 🍅
      timer.pWorkMin = +pWork.value  || timer.pWorkMin;
      timer.pBreakMin= +pBreak.value || timer.pBreakMin;
      timer.pLoops   = +pLoops.value || timer.pLoops;

      if (!timer.running && timer.remain===0){
        timer.pTotalMs = pomoTotalMs(timer.pWorkMin,timer.pBreakMin,timer.pLoops);
        timer.totalMs  = timer.pTotalMs;
        timer.remain   = timer.pTotalMs;
        timer.pIdx = 0;
        timer.pSegTotal  = segTotalMs(0,timer.pWorkMin,timer.pBreakMin,timer.pLoops);
        timer.pSegRemain = timer.pSegTotal;
        const now = Date.now();
        timer.pSegEndAt     = now + timer.pSegTotal;
        timer.pOverallEndAt = now + timer.pTotalMs;
        primeMilestones(timer.pSegRemain, timer.pSegTotal);
      }else if (!timer.running){
        const now = Date.now();
        timer.pSegEndAt     = now + (timer.pSegRemain||0);
        timer.pOverallEndAt = now + (timer.remain||0);
      }
      timer.running = true;
      clearTimeout(renderTimerId); render(); save();
      ensureEtaTicker();
      const isBreakNow = isBreak(timer.pIdx, timer.pLoops);
      speakOrBeep(isBreakNow ? '休憩時間です。' : '作業を開始してください。', { kind:'seg' });
    }

    function pause(){
      if (!timer.running) return;
      const now = Date.now();
      if (timer.mode==='normal'){
        timer.remain = Math.max(0, timer.endAt - now);
        timer.running=false; clearTimeout(renderTimerId); render(); save(); return;
      }
      timer.pSegRemain = Math.max(0, timer.pSegEndAt - now);
      timer.remain     = Math.max(0, timer.pOverallEndAt - now);
      timer.running=false; clearTimeout(renderTimerId); render(); save();
      ensureEtaTicker();
    }

    function reset(){
      timer.running=false;
      if (timer.mode==='normal'){
        const mins = Math.max(0, +tMin.value || 0);
        timer.totalMs=mins*60*1000; timer.remain=timer.totalMs; timer.endAt=0;
      }else{
        timer.pTotalMs = pomoTotalMs(timer.pWorkMin,timer.pBreakMin,timer.pLoops);
        timer.totalMs  = timer.pTotalMs; timer.remain=timer.pTotalMs;
        timer.pIdx=0; timer.pSegTotal=segTotalMs(0,timer.pWorkMin,timer.pBreakMin,timer.pLoops);
        timer.pSegRemain=timer.pSegTotal; timer.pSegEndAt=0; timer.pOverallEndAt=0;
        primeMilestones(timer.pSegRemain, timer.pSegTotal);
      }
      clearTimeout(renderTimerId); render(); save();
      updateETA(timer.mode, Date.now());
      ensureEtaTicker();
    }

    /* 🍅 utils */
    function pomoTotalMs(workMin, breakMin, loops){
      const w = Math.max(1, +workMin  || 0) * 60 * 1000;
      const b = Math.max(1, +breakMin || 0) * 60 * 1000;
      const L = Math.max(1, +loops    || 0);
      // 合計 = 作業L本 + 休憩(L-1)本
      return w * L + b * (L - 1);
    }
    // そのインデックスが休憩か？（最後の休憩は含めない）
    function isBreak(idx, loops){
      // 0:作業,1:休憩,2:作業,3:休憩,... 最後は作業で終わる（＝最後の休憩は存在しない）
      return (idx % 2 === 1) && (idx < (loops*2 - 1));
    }

    // idx が「どの作業の直後の休憩か」（1始まり）を返す
    function breakAfterWorkNumber(idx){ return (idx + 1) / 2; } // idx=1→1回目の作業後, idx=3→2回目の作業後, ...

    function isLongBreakIdx(idx, loops){
      if (!isBreak(idx, loops)) return false;
      if (!timer.pLongOn) return false;
      const k = breakAfterWorkNumber(idx);               // 直前の作業回数(1,2,3,...)
      const every = Math.max(2, +timer.pLongEvery||4);   // 2以上にクランプ
      // 最後の休憩は存在しない仕様なので、ここで特別扱いは不要
      return (k % every) === 0;
  }

    // セグメント長（作業 or 休憩）
    function segTotalMs(idx, workMin, breakMin, loops){
      if (!isBreak(idx, loops)){
        return Math.max(1, +workMin||0) * 60 * 1000; // 作業
      }
      // 休憩（ロング判定）
      const useLong = isLongBreakIdx(idx, loops);
      const min = useLong ? (+timer.pLongMin||15) : (+breakMin||0);
      return Math.max(1, min) * 60 * 1000;
    }

    // ロングブレイクを加味した合計時間
    function computePomoTotalMs(workMin, breakMin, loops){
      const L = Math.max(1, +loops||1);
      const w = Math.max(1, +workMin||0) * 60 * 1000;

      // 作業 L 回は必ずある
      let total = w * L;

      // 各休憩（L-1 回）を個別に加算（最後の休憩は無し）
      for (let k=1; k<=L-1; k++){
        const idx = 2*k - 1; // k回目の作業後の休憩セグメントの idx
        const useLong = timer.pLongOn && (k % Math.max(2, +timer.pLongEvery||4) === 0);
        const m = (useLong ? +timer.pLongMin : +breakMin);
        total += Math.max(1, m||0) * 60 * 1000;
      }
      return total;
    }

    function totalSegments(loops){ return Math.max(1, +loops||1)*2 - 1; }

    [pWork,pBreak,pLoops,pLongOn,pLongEvery,pLongMin].forEach(inp=>{
      inp?.addEventListener('change', ()=>{
        // 状態を反映（適切にクランプ）
        timer.pWorkMin   = Math.max(1, +pWork.value   || timer.pWorkMin);
        timer.pBreakMin  = Math.max(1, +pBreak.value  || timer.pBreakMin);
        timer.pLoops     = Math.max(1, +pLoops.value  || timer.pLoops);
        timer.pLongOn    = !!pLongOn.checked;
        timer.pLongEvery = Math.max(2, +pLongEvery.value || timer.pLongEvery);
        timer.pLongMin   = Math.max(1, +pLongMin.value   || timer.pLongMin);

        // 停止中はプレビュー更新
        if (timer.mode==='pomo' && !timer.running){
          timer.pTotalMs = computePomoTotalMs(timer.pWorkMin, timer.pBreakMin, timer.pLoops);
          timer.totalMs  = timer.remain = timer.pTotalMs;

          timer.pIdx        = 0;
          timer.pSegTotal   = segTotalMs(0, timer.pWorkMin, timer.pBreakMin, timer.pLoops);
          timer.pSegRemain  = timer.pSegTotal;

          primeMilestones(timer.pSegRemain, timer.pSegTotal);
          drawOuter(timer.remain, timer.totalMs);
          drawInner(timer.pSegRemain, timer.pSegTotal);
          // もし「作業中/休憩中」のピルを出しているならここで更新
          if (typeof updatePomoStatus === 'function') updatePomoStatus();
          // 中央表示（あなたの実装名に合わせて）
          const mainEl = document.getElementById('tTimeMain');
          const subEl  = document.getElementById('tTimeSub');
          if (mainEl) mainEl.textContent = fmt(timer.remain);
          if (subEl)  subEl.textContent  = fmt(timer.pSegRemain);
        }
        save();
      });
    });

    /* 初期表示 */
    if (!timer.running){
      if (timer.mode==='normal'){
        timer.totalMs=(timer.lastSetMin||25)*60*1000; timer.remain=timer.totalMs;
        drawOuter(timer.remain, timer.totalMs);
        if (tMain) tMain.textContent=fmt(timer.remain);
        if (tSub)  tSub.textContent='';
      }else{
        pWork.value=timer.pWorkMin; pBreak.value=timer.pBreakMin; pLoops.value=timer.pLoops;
        timer.pTotalMs=pomoTotalMs(timer.pWorkMin,timer.pBreakMin,timer.pLoops);
        timer.totalMs=timer.remain=timer.pTotalMs;
        timer.pIdx=0; timer.pSegTotal=segTotalMs(0,timer.pWorkMin,timer.pBreakMin,timer.pLoops);
        timer.pSegRemain=timer.pSegTotal;
        drawOuter(timer.remain, timer.totalMs);
        drawInner(timer.pSegRemain, timer.pSegTotal);
        if (tMain) tMain.textContent=fmt(timer.remain);
        if (tSub)  tSub.textContent=fmt(timer.pSegRemain);
        primeMilestones(timer.pSegRemain, timer.pSegTotal);
      }
    }
    render();
    applyModeUI();

    /* ボタン */
    tMin?.addEventListener('change', ()=>{
      timer.lastSetMin=+tMin.value||0;
      if (!timer.running && timer.mode==='normal'){
        timer.totalMs=timer.lastSetMin*60*1000; timer.remain=timer.totalMs;
        primeMilestones(timer.remain, timer.totalMs);
        render();
      }
      save();
    });
    tPresets.forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const m=+btn.getAttribute('data-min')||0;
        tMin.value=m; timer.lastSetMin=m; timer.running=false;
        timer.totalMs=m*60*1000; timer.remain=timer.totalMs; timer.endAt=0;
        primeMilestones(timer.remain, timer.totalMs);
        render(); save();
      });
    });

    // 初期表示
    if (!timer.running){
      if (timer.mode==='normal'){
        timer.totalMs = (timer.lastSetMin||25)*60*1000;
        timer.remain  = timer.totalMs;
        drawOuter(timer.remain, timer.totalMs);
      }else{
        pWork.value  = timer.pWorkMin;
        pBreak.value = timer.pBreakMin;
        pLoops.value = timer.pLoops;
        timer.pTotalMs = pomoTotalMs(timer.pWorkMin,timer.pBreakMin,timer.pLoops);
        timer.totalMs  = timer.pTotalMs; timer.remain = timer.pTotalMs;
        timer.pIdx = 0;
        timer.pSegTotal  = segTotalMs(0,timer.pWorkMin,timer.pBreakMin,timer.pLoops);
        timer.pSegRemain = timer.pSegTotal;
        primeMilestones(timer.pSegRemain, timer.pSegTotal);
      }
    }

const REG_KEY = 'timerRegListV1';

/* === timer 状態に 登録モード用 フィールドを追加 === */
timer = {
  ...timer,
  // 登録モード
  regItems: [],         // [{id,title,min}, ...]
  regIdx: 0,            // いま実行中のインデックス
  regSegTotal: 0,       // 現セグメント総ms
  regSegEndAt: 0,       // 現セグメント終了時刻
  regSegRemain: 0,      // 現セグメント残ms
  regTotalMs: 0,        // 全体総ms
  regOverallEndAt: 0    // 全体終了時刻
};

// 保存データに regItems 等があれば復元
try{
  const saved = JSON.parse(localStorage.getItem(TKEY)||'{}');
  if (Array.isArray(saved.regItems)) timer.regItems = saved.regItems;
  ['regIdx','regSegTotal','regSegEndAt','regSegRemain','regTotalMs','regOverallEndAt']
    .forEach(k=> { if (k in saved) timer[k] = saved[k]; });
}catch(_){}

/* === 登録リストの描画・操作 === */
function uid(){ return Math.random().toString(36).slice(2,9); }

function sumMs(items){
  let total = 0;
  for (const x of items){
    const mm = Math.max(0, +(x?.min || 0));
    total += Math.round(mm * 60 * 1000);   // ★丸める
  }
  return total;
}

// 分入力 → 数字（分）に正規化（空や全角を安全に0扱い）
function valToMinutes(input){
  if (!input) return 0;
  const raw = String(input.value ?? '').trim();
  // 半角以外（全角数字や文字）を除去して数値化
  const num = Number(raw.replace(/[^\d.]/g,''));
  return Number.isFinite(num) ? num : 0;
}

// 次の「min>0」の行インデックス（見つからなければ -1）
function nextNonZeroIndex(items, from){
  for (let i = Math.max(0, (from|0)); i < items.length; i++){
    if ((+items[i].min || 0) > 0) return i;
  }
  return -1;
}

// DOMの現在値（フォーカス中の未確定も含め）を timer.regItems へ同期
function syncRegFromDOM(){
  if (!regListEl) return;
  const rows = regListEl.querySelectorAll('.reg-row');
  timer.regItems = Array.from(rows).map(row => {
    const id = row.dataset.id || uid();
    const tEl = row.querySelector('input[type="text"]');
    const mEl = row.querySelector('input[type="number"]');
    return {
      id,
      title: tEl ? tEl.value : '',
      min: valToMinutes(mEl),
    };
  });
}

// 合計ms（四捨五入で1分=60000ms化）
function sumMs(items){
  return items.reduce((acc, it) => {
    const m = Math.max(0, +it.min || 0);
    return acc + Math.round(m * 60 * 1000);
  }, 0);
}


function renderRegList(){
  if (!regListEl) return;
  const now = Date.now();

  // 常に編集ビューを作る（表示の出し分けは別でやる）
  regListEl.innerHTML = '';

  // 走行中でないので、ETA用の基準は「今」からの見込み
  const baseStart = now;
  let acc = 0;

  timer.regItems.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'reg-row';
    row.dataset.id = it.id;

    const t = document.createElement('input');
    t.type = 'text';
    t.placeholder = '予定名';
    t.value = it.title || '';
    t.addEventListener('input', ()=>{ it.title = t.value; save(); });

    const m = document.createElement('input');
    m.type = 'number';
    m.min = '0'; m.max = '600'; m.step = '1';
    m.value = it.min ?? 0;

    // 置き換え前: const onMinChanged = ()=>{ ... renderRegList(); };
    const onMinChanged = (opts = { light: true, rowEl: null }) => {
      // 1) 該当行の分を反映
      it.min = Math.max(0, +(m.value || 0));

      // 2) 停止中プレビューを最新化（合計・区間・ドーナツ・中央表示）
      timer.regTotalMs = sumMs(timer.regItems);
      timer.remain     = timer.regTotalMs;

      const idx = nextNonZeroIndex(timer.regItems, 0);
      timer.regIdx = Math.max(0, idx >= 0 ? idx : 0);
      const cur = timer.regItems[timer.regIdx] || {min:0};
      const segMs = Math.max(1, Math.round((+cur.min || 0) * 60 * 1000));
      timer.regSegTotal  = segMs;
      timer.regSegRemain = segMs;

      drawOuter(timer.remain, Math.max(1, timer.regTotalMs));
      drawInner(timer.regSegRemain, Math.max(1, timer.regSegTotal));
      if (tMain) tMain.textContent = fmt(timer.remain);
      if (tSub)  tSub.textContent  = fmt(timer.regSegRemain);

      // 3) 中央ETA（全体終了）更新
      const now2 = Date.now();
      setETAByAbs(timer.regTotalMs > 0 ? (now2 + timer.regTotalMs) : 0);

      // 4) 保存
      save();

      if (opts.light) {
        // ★軽量更新：行ごとの ETA を“その場”で更新（全再描画しない）
        updateRowEtasInPlace();
        updateRegOverallETA(now2);
        return;
      }

      // ★確定時のみ：全体を再描画
      renderRegList();
    };

    // 打鍵中は軽量更新（リスト再生成なし）
    m.addEventListener('input',  () => onMinChanged({ light:true,  rowEl: row }));
    // フォーカスアウト or Enter で確定し、1回だけ再描画
    m.addEventListener('change', () => onMinChanged({ light:false, rowEl: row }));
    // Enterで確定（IMEの確定 Enter は number では基本通る）
    m.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        m.blur(); // → change が発火して重い更新が1回だけ走る
      }
    });

    const ops = document.createElement('div');
    ops.className = 'reg-ops';
    const up = document.createElement('button');   up.textContent = '▲';
    const down = document.createElement('button'); down.textContent = '▼';
    const del = document.createElement('button');  del.textContent = '×';

    up.addEventListener('click', ()=>{
      if (i<=0) return;
      const tmp = timer.regItems[i-1]; timer.regItems[i-1]=timer.regItems[i]; timer.regItems[i]=tmp;
      save(); renderRegList();
    });
    down.addEventListener('click', ()=>{
      if (i>=timer.regItems.length-1) return;
      const tmp = timer.regItems[i+1]; timer.regItems[i+1]=timer.regItems[i]; timer.regItems[i]=tmp;
      save(); renderRegList();
    });
    del.addEventListener('click', ()=>{
      timer.regItems.splice(i,1);
      save(); renderRegList();
    });

    ops.append(up,down,del);

    row.append(t,m,ops);

    const eta = document.createElement('div');
    eta.className = 'reg-eta';
    const segMs = Math.max(0, Math.round((+it.min || 0) * 60 * 1000));
    const endAbs = baseStart + acc + segMs;
    eta.textContent = segMs>0 ? `終了見込み ${fmtETA(endAbs)}` : '—';
    row.append(eta);

    regListEl.append(row);
    acc += segMs;
  });

  updateRegOverallETA(now);
}

function updateRowEtasInPlace(){
  if (!regListEl) return;
  const rows = Array.from(regListEl.querySelectorAll('.reg-row'));
  const baseStart = Date.now();
  let acc = 0;
  for (const row of rows){
    const mEl  = row.querySelector('input[type="number"]');
    const etaEl= row.querySelector('.reg-eta');
    const segMs = Math.max(0, Math.round((+(mEl?.value || 0)) * 60 * 1000));
    const endAbs = baseStart + acc + segMs;
    if (etaEl) etaEl.textContent = segMs > 0 ? `終了見込み ${fmtETA(endAbs)}` : '—';
    acc += segMs;
  }
}


// 小ユーティリティ（XSS/記号対策）
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}


function renderRegView(){
  const view = document.getElementById('regView');
  if (!view) return;

  if (!Array.isArray(timer.regItems) || timer.regItems.length === 0){
    view.innerHTML = '';
    return;
  }

  // 基準時刻：停止中は“今”、実行中は“シーケンス開始時刻”
  const now = Date.now();
  const sequenceStart = (timer.mode==='reg' && timer.running)
    ? Math.max(0, (timer.regOverallEndAt || now) - (timer.regTotalMs || 0))
    : now;

  // 累積で各行の終了絶対時刻を出す
  let acc = 0;
  let html = '';
  timer.regItems.forEach((it, idx) => {
    const min = Math.max(0, +it.min || 0);
    const segMs = Math.round(min * 60 * 1000);
    const endAbs = sequenceStart + acc + segMs;  // その行の終了見込み
    const isCur = (idx === timer.regIdx);

    html += `
      <div class="rv-item ${isCur ? 'is-current':''}">
        <div class="rv-title">${it.title ? escapeHtml(it.title) : '(無題)'}</div>
        <div class="rv-right">
          <div class="rv-time">${min ? `${min}分` : ''}</div>
          <div class="rv-eta">${segMs>0 ? `  ${fmtETA(endAbs)}` : ''}</div>
        </div>
      </div>
    `;
    acc += segMs;
  });

  view.innerHTML = html;

  // 上部の「全体終了」も更新
  updateRegOverallETA(now);
}


// --- 入力中（未確定）でも確実に state を最新化 ---
// ★regListEl, timer が見えるスコープに追加
function syncRegFromDOM(){
  if (!regListEl) return;
  const rows = Array.from(regListEl.querySelectorAll('.reg-row'));
  const next = [];
  for (const row of rows){
    const id = row.dataset.id || Math.random().toString(36).slice(2,9);
    const t  = row.querySelector('input[type="text"]');
    const m  = row.querySelector('input[type="number"]');
    const title = t ? String(t.value || '') : '';
    const min   = m ? Math.max(0, +(m.value || 0)) : 0;
    next.push({ id, title, min });
  }
  timer.regItems = next;
}


function nextNonZeroIndex(items, from=0){
  for(let i=from; i<items.length; i++){
    if (Math.max(0, +items[i]?.min || 0) > 0) return i;
  }
  return -1;
}

function updateRegOverallETA(now = Date.now()){
  const total = sumMs(timer.regItems);
  const base = (timer.running && timer.mode==='reg') ? (timer.regOverallEndAt) : (now + total);
  regOverallEtaEl.textContent = total>0 ? `全体終了 ${fmtETA(base)}` : '';
}

function addRegRow(init={title:'', min:0}){
  const item = { id:uid(), title:init.title||'', min:Math.max(0, +init.min||0) };
  const oldTotal = sumMs(timer.regItems);

  timer.regItems.push(item);
  const newTotal = sumMs(timer.regItems);

  // 実行中は全体終了時刻を“差分分だけ”延長して、残り/ETAも更新
  if (timer.mode==='reg' && timer.running){
    const now = Date.now();
    const delta = Math.max(0, newTotal - oldTotal);
    timer.regTotalMs = newTotal;
    timer.totalMs    = newTotal;
    timer.regOverallEndAt = (timer.regOverallEndAt || now) + delta;
    timer.remain     = Math.max(0, timer.regOverallEndAt - now);

    save();
    renderRegView();       // ← 表示ビューを即更新
    updateRegOverallETA(); // ← 上部の「全体終了」を更新
    return;
  }

  // 非実行時は従来通り編集ビューを再描画
  save();
  renderRegList();
}


regAddBtn?.addEventListener('click', ()=> addRegRow({title:'', min:5}));
regClearBtn?.addEventListener('click', ()=>{
  if (!confirm('登録リストを空にしますか？')) return;
  timer.regItems = [];
  timer.regTotalMs = 0;
  if (timer.mode==='reg' && timer.running){
    const now = Date.now();
    timer.regOverallEndAt = now; // 直ちに終了（もしくは pause() でも可）
    timer.remain = 0;
    save(); renderRegView(); updateRegOverallETA();
  }else{
    save(); renderRegList();
  }
});
regExportBtn?.addEventListener('click', ()=>{
  const data = JSON.stringify(timer.regItems, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'registered-timer.json'; a.click();
  URL.revokeObjectURL(url);
});
regImportBtn?.addEventListener('click', ()=> regImportFile?.click());
regImportFile?.addEventListener('change', async (e)=>{
  const f = e.target.files?.[0]; if (!f) return;
  const txt = await f.text();
  try{
    const arr = JSON.parse(txt);
    if (!Array.isArray(arr)) throw 0;
    timer.regItems = arr.map(x=>({ id:uid(), title:String(x.title||''), min:Math.max(0,+x.min||0) }));
    save(); renderRegList();
  }catch(_){ alert('JSONの形式が不正です'); }
  e.target.value = '';
});

  /* === 登録モード：開始/一時停止/リセット === */
// 既存 startReg を丸ごとこの版に置換
function startReg(){
  // ★入力フォーカス中の値も取りこぼさない
  syncRegFromDOM();

  const total = sumMs(timer.regItems);
  if (total <= 0){ alert('リストに時間が設定された項目がありません'); return; }

  const now = Date.now();

  // ★開始位置は必ず 非0分の先頭
  const idx0 = nextNonZeroIndex(timer.regItems, 0);
  if (idx0 < 0){ alert('全ての行の時間が 0 分です'); return; }
  timer.regIdx = idx0;

  const cur = timer.regItems[idx0];
  const segMs = Math.max(1, Math.round((+cur.min || 0) * 60 * 1000));

  timer.regTotalMs = total;
  timer.totalMs    = total;
  timer.remain     = total;          // 新規開始は合計から

  // 区間（内側リング）
  timer.regSegTotal  = segMs;
  timer.regSegRemain = segMs;

  // 絶対終了時刻（未来へ）
  const EPS = 20; // ms
  timer.regSegEndAt     = now + Math.max(EPS, timer.regSegRemain);
  timer.regOverallEndAt = now + Math.max(EPS, timer.remain);

  fired50 = fired25 = fired12 = false;
  primeMilestones(timer.regSegRemain, timer.regSegTotal);

  timer.running = true;
  clearTimeout(renderTimerId);
  applyModeUI();
  render();
  save();
  ensureEtaTicker();
  const cur0 = timer.regItems[timer.regIdx];
  const title0 = cur0 ? (cur0.title || '(無題)') : '';
  speakOrBeep(`${title0} を開始してください。`, { kind:'seg' });
  renderRegList();
}

function pauseReg(){
    const now = Date.now();
    timer.regSegRemain = Math.max(0, timer.regSegEndAt - now);
    timer.remain       = Math.max(0, timer.regOverallEndAt - now);
    timer.running=false;
    clearTimeout(renderTimerId); render(); save(); ensureEtaTicker();
    if (timer.mode==='reg' && !timer.running) renderRegList();
  }

// 既存 resetReg を丸ごと置換
function resetReg(){
  syncRegFromDOM();

  timer.running = false;
  timer.regTotalMs = sumMs(timer.regItems);
  timer.totalMs    = timer.regTotalMs;
  timer.remain     = timer.regTotalMs;

  const idx = nextNonZeroIndex(timer.regItems, 0);
  timer.regIdx = Math.max(0, idx >= 0 ? idx : 0);

  const cur = timer.regItems[timer.regIdx] || {min:0};
  const segMs = Math.max(1, Math.round((+cur.min || 0) * 60 * 1000));
  timer.regSegTotal  = segMs;
  timer.regSegRemain = segMs;

  timer.regSegEndAt = 0;
  timer.regOverallEndAt = 0;

  fired50=fired25=fired12=false;
  primeMilestones(timer.regSegRemain, timer.regSegTotal);

  clearTimeout(renderTimerId);
  render(); save();
  // 停止中プレビューのETA
  setETAByAbs(timer.regTotalMs > 0 ? (Date.now() + timer.regTotalMs) : 0);
  ensureEtaTicker();
  if (timer.mode==='reg' && !timer.running) renderRegList();
}

/* 既存 start/pause/reset を拡張 */
const _start_orig = start; const _pause_orig = pause; const _reset_orig = reset;
start = function(){
  if (timer.mode==='reg'){ startReg(); return; }
  _start_orig();
};
pause = function(){
  if (timer.mode==='reg'){ pauseReg(); return; }
  _pause_orig();
};
reset = function(){
  if (timer.mode==='reg'){ resetReg(); return; }
  _reset_orig();
};

renderRegList(); // 実行⇄停止の切り替えで表示モードを即時反映

// --- ここから追加（start/pause/reset を差し替えた直後に入れる）---
function rebindControl(btnId, handler){
  const btn = document.getElementById(btnId);
  if (!btn) return;
  // 古いリスナーを完全除去（clone置換）
  const clone = btn.cloneNode(true);
  btn.parentNode.replaceChild(clone, btn);
  // ensureAudio → 本来のハンドラの順で
  clone.addEventListener('click', async () => {
    try{ if (window.ensureAudio) await window.ensureAudio(); }catch(_){}
    handler();
  });
}

// 差し替え済みの start/pause/reset を改めて紐付け
rebindControl('tStart', start);
rebindControl('tPause', pause);
rebindControl('tReset', reset);
// --- 追加ここまで ---


/* === 表示レンダラ（既存 render を拡張） === */
const _render_orig = render;
render = function(){
  if (timer.mode !== 'reg'){ _render_orig(); return; }
  if (regListEl) regListEl.style.display = timer.running ? 'none'  : 'grid';
  if (regViewEl) regViewEl.style.display = timer.running ? 'block' : 'none';
  if (timer.running) renderRegView(); else renderRegList();

  const now = Date.now();
  const overallRemain = timer.running ? (timer.regOverallEndAt - now) : timer.remain;
  const segRemain     = timer.running ? (timer.regSegEndAt     - now) : timer.regSegRemain;

  // 中央表示：上=全体残り、下=現セグメント残り
  tMain.textContent = fmt(overallRemain);
  if (tSub) tSub.textContent = fmt(segRemain);
  updateETA('reg', now);

  
const panel = document.getElementById('timerPanel');
if (panel) {
  panel.classList.toggle('is-running', (timer.mode === 'reg' && timer.running));
}

  
  // いまの予定名
  if (currentTaskName){
    const cur = timer.regItems[timer.regIdx];
    currentTaskName.textContent = cur ? `${cur.title || '(無題)'}` : '';
  }

  // リング
  drawOuter(Math.max(0,overallRemain), Math.max(1, timer.regTotalMs||timer.totalMs));
  drawInner(Math.max(0,segRemain),     Math.max(1, timer.regSegTotal||1));

  // フィニッシュ装飾
  const wrap = document.getElementById('tRemainWrap');
  wrap?.classList.toggle('t-finished', overallRemain<=0 && (timer.running || timer.remain===0));

  // ★開始・一時停止ボタンの有効／無効をここで制御
  {
    const startBtn = document.getElementById('tStart');
    const pauseBtn = document.getElementById('tPause');
    if (startBtn) startBtn.disabled = !!timer.running;
    if (pauseBtn) pauseBtn.disabled = !timer.running;
  }

  if (timer.running){
    const r = Math.max(0, segRemain) / Math.max(1, timer.regSegTotal);
    if (!fired50 && r<=0.50){
      const ok = window.announceRemaining && announceRemaining(Math.max(0,segRemain), timer.regSegTotal||1, 0.5);
      if (!ok && window.beepMark) beepMark(0.5);
      fired50 = true;
    }
    if (!fired25 && r<=0.25){
      const ok = window.announceRemaining && announceRemaining(Math.max(0,segRemain), timer.regSegTotal||1, 0.25);
      if (!ok && window.beepMark) beepMark(0.25);
      fired25 = true;
    }
    if (!fired12 && r<=0.12){
      const ok = window.announceRemaining && announceRemaining(Math.max(0,segRemain), timer.regSegTotal||1, 0.12);
      if (!ok && window.beepMark) beepMark(0.12);
      fired12 = true;
    }

    // セグメント（行）終了
    if (segRemain <= 0){
      // 先に「最後かどうか」を判定
      const next = nextNonZeroIndex(timer.regItems, timer.regIdx + 1);
      const isLast = (next < 0);

      if (isLast){
        // ★最後は小ビープなしで一本化
        return finishAll('終了です。お疲れさまでした。');
      }

      // 続く場合のみ、区間終了の小ビープ
      window.beepSegmentEnd && beepSegmentEnd();

      // 次の行へ
      timer.regIdx = next;
      const cur = timer.regItems[timer.regIdx] || {min:0};
      const st  = Math.max(1, Math.round((+cur.min || 0) * 60 * 1000));

      timer.regSegTotal  = st;
      timer.regSegEndAt  = Date.now() + st;
      timer.regSegRemain = st;
      primeMilestones(timer.regSegRemain, timer.regSegTotal);
      renderRegView();

      const curR = timer.regItems[timer.regIdx];
      const titleR = curR ? (curR.title || '(無題)') : '';
      speakOrBeep(`${titleR} を開始してください。`, { kind:'seg' });
    }

      if (overallRemain <= 0){
        return finishAll('終了です。お疲れさまでした。');
      }

    renderTimerId = setTimeout(render, 200);
  }
};

/* === ETA 更新に reg を対応 === */
const _updateETA_orig = updateETA;
updateETA = function(mode, now){
  if (mode !== 'reg'){ _updateETA_orig(mode, now); return; }
  if (!tEta) return;

  if (timer.running && timer.regOverallEndAt){
    setETAByAbs(timer.regOverallEndAt);
  }else{
    // 停止中も常に最新合計で中央ETAを出す
    const total = sumMs(timer.regItems);
    setETAByAbs(total > 0 ? (now + total) : 0);
  }
  updateRegOverallETA(now);
};


/* === 初期表示：登録モードのプレビューも整える === */
(function initRegPreview(){
  if (!Array.isArray(timer.regItems)) timer.regItems = [];
  if (!timer.running){
    timer.regTotalMs = sumMs(timer.regItems);
    timer.totalMs    = (timer.mode==='reg') ? timer.regTotalMs : timer.totalMs;
    if (timer.mode==='reg'){
      timer.remain = timer.regTotalMs;
      const cur = timer.regItems[0] || {min:0};
      timer.regSegTotal  = Math.max(1, (+cur.min||0)*60*1000);
      timer.regSegRemain = timer.regSegTotal;
      drawOuter(timer.remain, Math.max(1,timer.regTotalMs));
      drawInner(timer.regSegRemain, Math.max(1,timer.regSegTotal));
      if (tMain) tMain.textContent=fmt(timer.remain);
      if (tSub)  tSub.textContent=fmt(timer.regSegRemain);
    }
  }
  renderRegList();
})();


  })();

  /* ===== Timer Audio Hardening Patch（既存のまま利用） ===== */
  (() => {
    const panel = document.getElementById('timerPanel');
    if (!panel) return;

    const VOL_KEY='timerVolumeV1', MUTE_KEY='timerMutedV1', PREV_KEY='timerVolBeforeMute';
    window.lastVol = (typeof window.lastVol === 'number') ? window.lastVol : +(localStorage.getItem(VOL_KEY) || 0.9);
    window.muted   = (typeof window.muted   === 'boolean') ? window.muted   : (localStorage.getItem(MUTE_KEY) === '1');
    let lastVolBeforeMute = +(localStorage.getItem(PREV_KEY) || window.lastVol || 0.6);

    let AC = window.AC || null;
    let MASTER = window.MASTER || null;

    function updateMasterGain(){ if (MASTER) MASTER.gain.value = (window.muted || window.lastVol <= 0) ? 0 : window.lastVol; }
    async function ensureAudio(){
      AC = window.AC = window.AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') await AC.resume();
      if (!MASTER){ MASTER = window.MASTER = AC.createGain(); MASTER.connect(AC.destination); updateMasterGain(); }
    }
    window.ensureAudio = ensureAudio;

    const tVol  = document.getElementById('tVol')  || panel.querySelector('input[type="range"]');
    const tMute = document.getElementById('tMute') || panel.querySelector('.btn-audio');

    function applyAudioUI(){
      const isMuted = (window.muted || window.lastVol <= 0);
      if (tMute){
        tMute.classList.toggle('muted', isMuted);
        tMute.textContent = isMuted ? '🔇' : '🔊';
        tMute.setAttribute('aria-pressed', String(!isMuted));
      }
      const controls = panel.querySelector('.t-controls');
      controls?.classList.toggle('muted', isMuted);
      tVol?.classList.toggle('muted', isMuted);
      updateMasterGain();
    }
    function setMuted(v){
      window.muted = !!v;
      if (window.muted){
        lastVolBeforeMute = window.lastVol; try{ localStorage.setItem(PREV_KEY, String(lastVolBeforeMute)); }catch(_){}
      }else if (window.lastVol <= 0){
        window.lastVol = Math.max(0.2, lastVolBeforeMute || 0.6);
        if (tVol) tVol.value = window.lastVol;
        try{ localStorage.setItem(VOL_KEY, String(window.lastVol)); }catch(_){}
      }
      try{ localStorage.setItem(MUTE_KEY, window.muted ? '1' : '0'); }catch(_){}
      ensureAudio().then(applyAudioUI);
    }
    window.setMuted = setMuted;

    if (tVol) tVol.value = window.lastVol;
    ensureAudio().then(applyAudioUI);

    panel.addEventListener('click', async (e)=>{
      if (e.target.closest('#tMute')){ await ensureAudio(); setMuted(!window.muted); }
    });
    panel.addEventListener('input', (e)=>{
      if (e.target.matches('#tVol')){
        window.lastVol = +e.target.value || 0;
        try{ localStorage.setItem(VOL_KEY, String(window.lastVol)); }catch(_){}
        if (window.lastVol <= 0 && !window.muted) setMuted(true);
        else if (window.lastVol > 0 && window.muted) setMuted(false);
        applyAudioUI();
      }
    });
  })();

    /* 1) 基本トーン */
    function tone(freq, when, dur, peak=0.9){
      const AC = window.AC, MASTER = window.MASTER;
      if (!AC || !MASTER) return;
      const osc = AC.createOscillator();
      const g   = AC.createGain();
      osc.type = 'square';              // 大きく聞こえる
      osc.frequency.value = freq;
      osc.connect(g); g.connect(MASTER);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(peak, when + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.start(when); osc.stop(when + dur + 0.05);
    }

    /* 2) 小アラーム（進捗ビープ：2連 “ピピッ” に変更） */
    async function beepMark(level){ // level=0.5 / 0.25 / 0.12
      try{
        if (window.ensureAudio) await window.ensureAudio();
        if (window.muted || (window.lastVol||0) <= 0) return;

        const now = window.AC.currentTime;
        const f = level === 0.5 ? 1100 : level === 0.25 ? 1300 : 1600;

        // 1発目（少し短く軽め）
        tone(f, now + 0.00, 0.12, 0.8);
        // 2発目（間をおいてもう一発）
        tone(f, now + 0.20, 0.14, 0.85);

      }catch(_){}
    }

    /* 3) 完了ビープ（はっきり分かる大アラームに刷新） */
    async function beep(){
      try{
        if (window.ensureAudio) await window.ensureAudio();
        if (window.muted || (window.lastVol||0) <= 0) return;

        const AC = window.AC;
        const now = AC.currentTime;

        // パターン： (短→短→長) を ちょい上昇系で 2セット
        // 1セット目（中央）： 880Hz → 1320Hz → 1760Hz
        playToneEx({ freq: 880,  when: now + 0.00, dur: 0.20, peak: 0.95, wave:'sawtooth', detune: +4, pan:  0.00 });
        playToneEx({ freq:1320,  when: now + 0.25, dur: 0.20, peak: 0.95, wave:'sawtooth', detune: -4, pan:  0.00 });
        playToneEx({ freq:1760,  when: now + 0.50, dur: 0.35, peak: 1.00, wave:'square',   detune:  0, pan:  0.00 });

        // 小休止
        const gap = 0.20;

        // 2セット目（わずかにステレオ広げる）： 880 → 1320 → 1760
        playToneEx({ freq: 880,  when: now + 0.50 + 0.35 + gap + 0.00, dur: 0.20, peak: 0.95, wave:'sawtooth', detune:+6, pan:-0.15 });
        playToneEx({ freq:1320,  when: now + 0.50 + 0.35 + gap + 0.25, dur: 0.20, peak: 0.95, wave:'sawtooth', detune:-6, pan: 0.15 });
        playToneEx({ freq:1760,  when: now + 0.50 + 0.35 + gap + 0.50, dur: 0.45, peak: 1.00, wave:'square',   detune: 0, pan: 0.00 });

        // （任意）端末が対応していれば短いバイブも
        if (typeof navigator !== 'undefined' && navigator.vibrate){
          navigator.vibrate([220, 120, 280]);
        }
      }catch(_){}
    }


    /* 4) 区間終了（ポモドーロ）用の控えめ2連 */
    async function beepSegmentEnd(){
      try{
        if (window.ensureAudio) await window.ensureAudio();
        if (window.muted || (window.lastVol||0) <= 0) return;
        const now = window.AC.currentTime;
        tone(1200, now + 0.00, 0.16, 0.8);
        tone(1400, now + 0.22, 0.18, 0.85);
      }catch(_){}
    }

    // ===== 読み上げ or ビープ共通ユーティリティ =====
    function speakOrBeep(text, { kind='mark' } = {}){
      // 音声ON & 非ミュート & Speechが使えるなら読み上げ
      try {
        if (window.isVoiceOn && window.isVoiceOn() && !window.muted && ('speechSynthesis' in window)) {
          if (window.ensureSpeech) window.ensureSpeech();
          if (window.speakJa && window.speakJa(text, { rate:1, pitch:1, volume:1 })) return; // 読み上げ成功
        }
      } catch(_){}

      // フォールバック：既存ビープ
      if (kind === 'end') { window.stopBeep && stopBeep(); if (!window.muted && (window.lastVol||0)>0) window.beep && beep(); return; }
      if (kind === 'seg') { if (!window.muted && (window.lastVol||0)>0) window.beepSegmentEnd && beepSegmentEnd(); return; }
      // デフォルトの軽いマーク音
      if (!window.muted && (window.lastVol||0)>0) window.beepMark && beepMark(0.5);
    }


    // 複数オシレータで“太い音”を作るユーティリティ
    function playToneEx({ freq=1000, when=0, dur=0.25, peak=0.9, wave='sawtooth', detune=0, pan=0 }) {
      const AC = window.AC, MASTER = window.MASTER;
      if (!AC || !MASTER) return;

      // マスター直下にパンナー＆ゲイン
      const panNode = AC.createStereoPanner ? AC.createStereoPanner() : null;
      const g = AC.createGain();
      if (panNode){ panNode.pan.value = pan; g.connect(panNode); panNode.connect(MASTER); }
      else { g.connect(MASTER); }

      // 2オシレータ（基本＋わずかにデチューン）で太く
      const osc1 = AC.createOscillator();
      const osc2 = AC.createOscillator();

      osc1.type = wave;
      osc2.type = wave;
      osc1.frequency.value = freq;
      osc2.frequency.value = freq;
      try { osc2.detune.value = detune; } catch(_) {}

      osc1.connect(g);
      osc2.connect(g);

      // クリックを避けつつ主張するエンベロープ
      const t0 = when;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.02);     // 速い立ち上がり
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc1.start(t0); osc2.start(t0);
      const tStop = t0 + dur + 0.05;
      osc1.stop(tStop); osc2.stop(tStop);
    }


    /* 5) 停止用（one-shotなので実質何もしない） */
    function stopBeep(){}

      // ドーナツ＆中央表示はクリック透過に強制
  (function(){
    const panel = document.getElementById('timerPanel');
    if (!panel) return;
    panel.querySelectorAll('.t-progress, .t-progress *, .t-remaining')
      .forEach(el => { el.style.pointerEvents = 'none'; el.style.zIndex = 0; });
  })();
  

/* ===== Speech (読み上げ) Helper - UI不在でも動く/複数UI対応版 ===== */
(() => {
  const VOICE_ON_KEY = 'timerVoiceOnV1';

  // 1) トグル候補を順に探す
  function getVoiceToggle(){
    // 推奨id
    let el = document.getElementById('tVoice');
    if (el) return el;

    // data属性（checkbox or button）
    el = document.querySelector('[data-voice-toggle]');
    if (el) return el;

    // タイマーパネル内の予備セレクタ（クラス名をつけていれば拾う）
    el = document.querySelector('#timerPanel .t-voice, .t-voice');
    if (el) return el;

    return null; // UIが無い場合
  }

  // 2) 今の状態を**毎回**DOMから取得（UIが無ければ保存値/グローバルを使用）
  function isVoiceOn(){
    const el = getVoiceToggle();
    if (el){
      if (el.matches('input[type="checkbox"]')) return !!el.checked;
      // ボタン系: aria-pressed / data-on / .active を見る
      const ap = el.getAttribute('aria-pressed');
      if (ap != null) return ap === 'true';
      if ('on' in el.dataset) return el.dataset.on === '1' || el.dataset.on === 'true';
      if (el.classList.contains('active')) return true;
    }
    // UIが無い場合は保存値→window.voiceOn
    const saved = localStorage.getItem(VOICE_ON_KEY);
    if (saved === '1' || saved === '0') return saved === '1';
    return !!window.voiceOn;
  }

  // 3) 状態の書き込み（UIあり/なし両対応）
  function setVoiceOn(v){
    const on = !!v;
    const el = getVoiceToggle();
    if (el){
      if (el.matches('input[type="checkbox"]')) {
        try { el.checked = on; } catch {}
      } else {
        // ボタン等
        el.setAttribute('aria-pressed', on ? 'true' : 'false');
        el.dataset.on = on ? '1' : '0';
        el.classList.toggle('active', on);
        // 表示アイコンを使う場合
        if (!el.dataset.staticIcon){
          el.textContent = on ? '🔊' : '🔇';
        }
      }
    }
    window.voiceOn = on;
    try { localStorage.setItem(VOICE_ON_KEY, on ? '1' : '0'); } catch {}
  }
  window.setVoiceOn = setVoiceOn;
  window.isVoiceOn = isVoiceOn;

  // 4) 初期同期：保存値→UIへ反映（UIなければ window.voiceOn を維持）
  (function initVoiceState(){
    const saved = localStorage.getItem(VOICE_ON_KEY);
    const initial = (saved === '1') ? true : (saved === '0') ? false : !!window.voiceOn;
    setVoiceOn(initial);

    const el = getVoiceToggle();
    if (el){
      // UI種別ごとにイベントを束ねる
      if (el.matches('input[type="checkbox"]')){
        el.addEventListener('change', e => setVoiceOn(!!e.target.checked));
      }else{
        el.addEventListener('click', () => setVoiceOn(!isVoiceOn()));
      }
    }
  })();

  // ====== SpeechSynthesis 準備 ======
  let voices = [];
  let jaVoice = null;

  function chooseJaVoice(){
    jaVoice = null;
    const list = voices || [];
    jaVoice = list.find(v => /ja[-_]?JP/i.test(v.lang)) || list.find(v => /日本語/.test(v.name));
    if (!jaVoice && list.length) jaVoice = list[0];
  }

  async function ensureSpeech(){
    if (!('speechSynthesis' in window)) return false;
    try { window.speechSynthesis.resume(); } catch {}
    voices = window.speechSynthesis.getVoices() || voices;
    chooseJaVoice();
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      voices = window.speechSynthesis.getVoices() || voices;
      chooseJaVoice();
    }, { once:true });
    return true;
  }
  window.ensureSpeech = ensureSpeech;

  function speakJa(text, {rate=1, pitch=1, volume} = {}) {
    if (!('speechSynthesis' in window)) return false;
    try { window.speechSynthesis.cancel(); } catch {}

    const u = new SpeechSynthesisUtterance(text);
    if (jaVoice) u.voice = jaVoice;
    u.lang = (jaVoice?.lang || 'ja-JP');

    // ★ここがポイント：ビープ用のスライダー値(lastVol)をそのまま適用
    //   volume 引数は“相対倍率”として扱い、未指定なら 1。最終音量 = lastVol * volume
    const master = (typeof window.lastVol === 'number') ? window.lastVol : 1;
    const rel    = (typeof volume === 'number') ? volume : 1;
    u.volume = Math.max(0, Math.min(1, master * rel));  // 0.0〜1.0 にクランプ

    u.rate  = rate;
    u.pitch = pitch;

    try { window.speechSynthesis.speak(u); } catch { return false; }
    return true;
  }

  window.speakJa = speakJa;

  // ====== マイルストーン通知：読み上げ→失敗ならビープ ======
  window.announceRemaining = function(remMs, totalMs, level){
    // OFFなら即フォールバック（＝ビープを鳴らす側へ false を返す）
    if (!isVoiceOn()) return false;
    if (window.muted) return false;
    if (!('speechSynthesis' in window)) return false;

    try { ensureSpeech(); } catch {}

    const sec = Math.max(0, Math.round(remMs/1000));
    const min = Math.floor(sec/60);
    const s   = sec % 60;
    const msg = (min > 0) ? `残り ${min} 分です。` : `残り ${s} 秒です。`;

    const ok = speakJa(msg, { rate:1, pitch:1, volume:1 });
    return !!ok;  // true なら読み上げ済み、false ならビープへ
  };
})();

const tVoiceOn = document.getElementById('tVoiceOn');
if (tVoiceOn){
  tVoiceOn.checked = !!window.voiceOn;
  tVoiceOn.addEventListener('change', async (e)=>{
    window.setVoiceOn(e.target.checked);
    if (e.target.checked && window.ensureSpeech) await window.ensureSpeech();
  });
}

  /* === Eフレーム：タブ拡張（TODO/タイマーにチェックリストを追加） === */
(function(){
  const btnTodo = document.getElementById('eTabTodo');
  const btnTimer = document.getElementById('eTabTimer');
  const btnCL   = document.getElementById('eTabChecklist');

  const panelTodo = document.getElementById('todoPanel');
  const panelTimer= document.getElementById('timerPanel');
  const panelCL   = document.getElementById('checklistPanel');

  if (!btnCL || !panelCL) return; // HTMLがまだ入ってなければ何もしない

  function activate(btn){
    // タブのactive
    [btnTodo, btnTimer, btnCL].forEach(b=> b && b.classList.toggle('active', b===btn));
    // パネルの表示
    panelTodo && (panelTodo.style.display = (btn===btnTodo) ? 'grid' : 'none');
    panelTimer && (panelTimer.style.display= (btn===btnTimer)? ''     : 'none');
    panelCL   && (panelCL.style.display   = (btn===btnCL)   ? 'grid' : 'none');
    // チェックリストの初期化
    if (btn===btnCL) CL && CL.initIfNeeded && CL.initIfNeeded();
  }

  btnCL.addEventListener('click', ()=> activate(btnCL));
  // 既存の二つはそのまま（既存リスナーが動作していても最後に整える）
  btnTodo && btnTodo.addEventListener('click', ()=> activate(btnTodo));
  btnTimer&& btnTimer.addEventListener('click',()=> activate(btnTimer));
  if (window.CL && CL.initIfNeeded) CL.initIfNeeded();
})();

  function createChecklistModule(){
  const LS_KEY = 'CHECKLISTS_V1';
  const stateKey = (id)=> `CHECKSTATE_V1_${id}`;

  const panel = document.getElementById('checklistPanel');
  if (!panel) return { initIfNeeded:()=>{} };

  const subTabs = panel.querySelectorAll('.cl-subtab');
  const viewUse = document.getElementById('clViewUse');
  const viewEdit= document.getElementById('clViewEdit');
  const viewList= document.getElementById('clViewList');

  const selList = document.getElementById('clSelect');
  const itemsBox= document.getElementById('clItems');
  const btnReset= document.getElementById('clResetBtn');
  const percTxt = document.getElementById('clPerc');
  const barFill = document.getElementById('clBar');

  const form    = document.getElementById('clForm');
  const titleIn = document.getElementById('clTitle');
  const editIdIn= document.getElementById('clEditingId');
  const edBox   = document.getElementById('clItemsEditor');
  const btnAdd  = document.getElementById('clAddRowBtn');
  const btnCancel = document.getElementById('clCancelEditBtn');

  const tblBody = document.querySelector('#clTable tbody');

  let inited = false;

  function loadLists(){ try{ return JSON.parse(localStorage.getItem(LS_KEY))||[]; }catch{ return []; } }
  function saveLists(a){ localStorage.setItem(LS_KEY, JSON.stringify(a||[])); }
  function loadState(id){ try{ return JSON.parse(localStorage.getItem(stateKey(id)))||{}; }catch{ return {}; } }
  function saveState(id,o){ localStorage.setItem(stateKey(id), JSON.stringify(o||{})); }

  function uid(){ return Math.random().toString(36).slice(2,10); }
  function fmtDate(ts){ const d=new Date(ts||Date.now()); const z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; }
  function setSubView(name){
    subTabs.forEach(b=> b.classList.toggle('active', b.dataset.clview===name));
    viewUse .classList.toggle('active', name==='use');
    viewEdit.classList.toggle('active', name==='edit');
    viewList.classList.toggle('active', name==='list');
  }

  function renderSelect(){
    const lists = loadLists();
    selList.innerHTML = '';
    if (!lists.length){ const o=document.createElement('option'); o.value=''; o.textContent='（未登録）'; selList.appendChild(o); return; }
    lists.forEach(l=>{ const o=document.createElement('option'); o.value=l.id; o.textContent=l.title; selList.appendChild(o); });
    const last = localStorage.getItem('CL_LAST_USED'); if (last && lists.some(x=>x.id===last)) selList.value = last;
  }
  function renderItems(){
    const listId = selList.value;
    localStorage.setItem('CL_LAST_USED', listId||'');
    itemsBox.innerHTML='';
    if (!listId){ updateProgress(0,0); return; }
    const lists = loadLists(); const cur = lists.find(x=>x.id===listId); if(!cur) return;
    const state = loadState(listId);
    (cur.items||[]).forEach(it=>{
      const row = document.createElement('div'); row.className='cl-item';
      const cb  = document.createElement('input'); cb.type='checkbox';

      const state = loadState(listId);
      cb.checked = !!state[it.id];

      // ✅ 初期の見た目
      row.classList.toggle('done', cb.checked);

      cb.addEventListener('change', ()=>{
        const s=loadState(listId);
        s[it.id]=cb.checked; saveState(listId,s);
        row.classList.toggle('done', cb.checked);   // ← 見た目反映
        updateProgressFromCurrent();
      });

      const txt = document.createElement('div'); txt.className='txt'; txt.textContent = it.text||'';
      row.append(cb,txt); itemsBox.appendChild(row);
    });
    updateProgressFromCurrent();
  }
  function updateProgress(done,total){
    const pct = total ? Math.round((done/total)*100) : 0;
    percTxt.textContent = `${pct}% 完了`;
    barFill.style.width = `${pct}%`;

    // 100% 到達時の色替え
    const prog = panel.querySelector('.cl-progress');
    if (prog) prog.classList.toggle('complete', pct===100);
  }
  function updateProgressFromCurrent(){
    const listId=selList.value; if(!listId){ updateProgress(0,0); return; }
    const lists=loadLists(); const cur=lists.find(x=>x.id===listId)||{};
    const st=loadState(listId); const total=(cur.items||[]).length; const done=(cur.items||[]).filter(it=>st[it.id]).length;
    updateProgress(done,total);
  }
  function resetChecks(){
    const id=selList.value; if(!id) return;
    if(!confirm('このリストのチェック状態をリセットします。よろしいですか？')) return;
    saveState(id,{}); renderItems();
  }

  function clearEditor(){ editIdIn.value=''; titleIn.value=''; edBox.innerHTML=''; addRow(''); addRow(''); }
  function addRow(text,itemId){
    const row=document.createElement('div'); row.className='item-row'; row.dataset.itemId=itemId||uid();
    row.innerHTML=`
      <input type="text" placeholder="項目名" value="${text?String(text).replace(/"/g,'&quot;'):''}" />
      <div>
        <button type="button" class="mini" data-act="up">▲</button>
        <button type="button" class="mini" data-act="down">▼</button>
        <button type="button" class="mini" data-act="del">✕</button>
      </div>`;
    // ↑ ↓ × のイベントは従来通り…

    const inp = row.querySelector('input[type="text"]');

    // ⏎で次へ / 最後なら行追加してフォーカス
    inp.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){
        e.preventDefault(); // フォーム送信を止める
        const nextRow = row.nextElementSibling;
        if (nextRow){
          const nextInp = nextRow.querySelector('input[type="text"]');
          if(nextInp){ nextInp.focus(); nextInp.select(); }
        } else {
          addRow('');
          const newInp = edBox.lastElementChild.querySelector('input[type="text"]');
          if(newInp){ newInp.focus(); }
        }
      }
    });

    edBox.appendChild(row);
  }

  function startCreate(){ clearEditor(); setSubView('edit'); }
  function startEdit(listId){
    const lists=loadLists(); const cur=lists.find(x=>x.id===listId); if(!cur) return;
    editIdIn.value=cur.id; titleIn.value=cur.title||''; edBox.innerHTML=''; (cur.items||[]).forEach(it=>addRow(it.text,it.id));
    if(edBox.children.length===0) addRow(''); setSubView('edit');
  }
  function submitForm(e){
    e.preventDefault();
    const title=titleIn.value.trim(); if(!title){ alert('タイトルを入力してください'); return; }
    const items=Array.from(edBox.querySelectorAll('.item-row')).map(r=>({ id:r.dataset.itemId||uid(), text:r.querySelector('input').value.trim() })).filter(x=>x.text);
    if(!items.length){ alert('少なくとも1つの項目を入力してください'); return; }

    const lists=loadLists(); const editId=editIdIn.value;
    if(editId){ const i=lists.findIndex(x=>x.id===editId); if(i>=0){ lists[i]={...lists[i], title, items, updatedAt:Date.now()}; saveLists(lists); } }
    else{ lists.push({ id:uid(), title, items, updatedAt:Date.now() }); saveLists(lists); }

    renderListTable(); renderSelect(); setSubView('list');
  }
  function renderListTable(){
    const lists=loadLists(); tblBody.innerHTML='';
    lists.forEach(l=>{
      const tr=document.createElement('tr');
        tr.innerHTML = `
          <td>${l.title||''}</td>
          <td class="td-actions" style="text-align:right;">
            <button class="mini" data-act="edit">編集</button>
            <button class="mini delete" data-act="delete">削除</button>
          </td>
        `;
      tr.querySelector('[data-act="edit"]').addEventListener('click', ()=> startEdit(l.id));
      tr.querySelector('[data-act="delete"]').addEventListener('click', ()=>{
        if(!confirm('本当に削除しますか？この操作は元に戻せません。')) return;
        const arr=loadLists().filter(x=>x.id!==l.id); saveLists(arr);
        localStorage.removeItem(stateKey(l.id));
        renderListTable(); renderSelect();
        if(selList.value===l.id){ selList.value=''; renderItems(); }
      });
      tblBody.appendChild(tr);
    });
  }

  function initEvents(){
    subTabs.forEach(b=> b.addEventListener('click', ()=>{
      const v=b.dataset.clview; setSubView(v);
      if(v==='use'){ renderSelect(); renderItems(); }
      if(v==='list'){ renderListTable(); }
      if(v==='edit'){ startCreate(); }
    }));
    selList.addEventListener('change', renderItems);
    btnReset.addEventListener('click', resetChecks);
    btnAdd.addEventListener('click', ()=> addRow(''));
    btnCancel.addEventListener('click', ()=> setSubView('list'));
    form.addEventListener('submit', submitForm);

    // ▼▼ ここから追加：ミニボタン（▲/▼/✕）の委譲イベント ▼▼
      edBox.addEventListener('click', (e)=>{
        const btn = e.target.closest('.mini');
        if (!btn) return;
        const act = btn.dataset.act;
        const row = btn.closest('.item-row');
        if (!row) return;

        if (act === 'up') {
          const prev = row.previousElementSibling;
          if (prev) edBox.insertBefore(row, prev);
        } else if (act === 'down') {
          const next = row.nextElementSibling;
          if (next) edBox.insertBefore(next, row);
        } else if (act === 'del') {
          row.remove();
        }
      });
      // ▲▲ ここまで追加 ▲▲

  }
  function firstShow(){ setSubView('use'); renderSelect(); renderItems(); }

  function initIfNeeded(){ if(inited) return; initEvents(); firstShow(); inited=true; }
  return { initIfNeeded };
}
const CL = createChecklistModule();