/* ====== タイムスケジュール：データ層 ======
    localStorage 形式：
    schedulesV1 = {
      "2025-09-14": [
          { id:"...", title:"制作", start:"09:30", end:"11:00", color:"#2b6cb0" },
          ...
      ],
      ...
    }
  */
  const SKEY = 'schedulesV1';
  let TM_editingId = null;   // 編集中の親タスクID
  let TM_isSub     = false;  // サブタスク編集中フラグ
  let TM_subId     = '';     // 編集中のサブID

  function loadSchedules(){
    try{ return JSON.parse(localStorage.getItem(SKEY)) || {}; }catch{ return {}; }
  }
  function saveSchedules(obj){
    localStorage.setItem(SKEY, JSON.stringify(obj||{}));
  }
  function upsertEvent(dateStr, ev){
    const all = loadSchedules();
    all[dateStr] = all[dateStr] || [];
    const i = all[dateStr].findIndex(x => x.id == ev.id); // ★修正済み
    if(i>=0) all[dateStr][i] = ev; else all[dateStr].push(ev);
    saveSchedules(all);
  }
  function deleteEvent(dateStr, id){
    const all = loadSchedules();
    if(!all[dateStr]) return;
    all[dateStr] = all[dateStr].filter(x => x.id != id); // ★修正済み
    saveSchedules(all);
  }

  /* ====== タイムライン描画 ====== */
  (function(){
    const grid = document.getElementById('tlGrid');
    const dateInput = document.getElementById('tlDate');
    const openBtn = document.getElementById('openScheduleEditor');
    const btnPrev = document.getElementById('tlPrev');
    const btnNext = document.getElementById('tlNext');

    // ローカル（PCのタイムゾーン）で今日を作る
    function localToday(){
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,'0');
      const day = String(d.getDate()).padStart(2,'0');
      return `${y}-${m}-${day}`;
    }
    const todayStr = localToday();
    dateInput.value = todayStr;

    // 背景の時間目盛を生成（0〜23）
    function buildHours(){
      grid.innerHTML = '';
      for(let h=0; h<24; h++){
        const row = document.createElement('div');
        row.className = 't-hour';
        const lab = document.createElement('div');
        lab.className = 'label';
        lab.textContent = String(h).padStart(2,'0') + ':00';
        row.appendChild(lab);
        grid.appendChild(row);
      }
    }

    function hmToMinutes(hm){ const [h,m] = hm.split(':').map(Number); return (h||0)*60 + (m||0); }

    // CSS変数から1時間の高さ(px)を取得
    function getHourHeight(){
      const v = getComputedStyle(document.documentElement).getPropertyValue('--tl-hour');
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 56;
    }

    function getTopPadPx(){
      const grid = document.getElementById('tlGrid');
      if (!grid) return 0;
      const v = getComputedStyle(grid).getPropertyValue('--tl-top-pad') || '0';
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    }

    // Dカレンダーから指定日の予定を抽出
    function collectDCalSegmentsForDate(dateStr){
      const OUT = [];
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem('D_CAL_EVENTS_V1') || '[]') || []; } catch{}

      if (!Array.isArray(arr)) return OUT;
      const [yy,mm,dd] = dateStr.split('-').map(n=>parseInt(n,10));
      const dayStart = new Date(yy,(mm||1)-1,(dd||1),0,0,0,0);
      const dayEnd   = new Date(yy,(mm||1)-1,(dd||1),23,59,59,999);

      arr.forEach(ev=>{
        const st = new Date(ev.start);
        const en = new Date(ev.end);
        if (isNaN(st) || isNaN(en)) return;
        if (ev.allDay === true) return;
        if (!(st <= dayEnd && en >= dayStart)) return;

        const segStart = new Date(Math.max(st, dayStart));
        const segEnd   = new Date(Math.min(en, dayEnd));
        const toHM = d => String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');

        OUT.push({
          id: `dcal::${ev.id}::${dateStr}`,
          title: ev.title || '(無題)',
          start: toHM(segStart),
          end:   toHM(segEnd),
          color: '#99cbe1',
          icon:  '📅',
          _source: 'dcal',
          _origId: String(ev.id || '')
        });
      });

      return OUT;
    }

    // ★ 予定の描画ロジック（修正済み）
    function renderEvents(dateStr){
      [...grid.querySelectorAll('.t-event, .now-line, .now-dot')].forEach(n=>n.remove());

      const all       = loadSchedules();
      const listSelf  = all[dateStr] || [];
      const listDcal  = collectDCalSegmentsForDate(dateStr);
      const listRaw   = [...listSelf, ...listDcal];

      const hourHeight= getHourHeight();
      const toMin = (hm)=>{ const [h,m]=String(hm||'0:00').split(':').map(Number); return (h||0)*60+(m||0); };
      
      const list = listRaw
      .map((ev,i)=>{
        const s = toMin(ev.start);
        let   e = toMin(ev.end || ev.start);
        if (e <= s) e += 24*60;
        return { ...ev, _i: i, _start: s, _end: e };
      })
      .sort((a,b)=> a._start - b._start || a._end - b._end);

      let active = []; 
      let clusterMaxDepth = -1;

      list.forEach((ev) => {
        // 重なり判定
        const stillActive = active.filter(a => a.end > ev._start);
        
        if (stillActive.length === 0) {
          active = []; 
          clusterMaxDepth = 0;
        } else {
          clusterMaxDepth++;
          if (clusterMaxDepth > 5) clusterMaxDepth = 5; 
        }

        const depth = clusterMaxDepth;
        active.push({ end: ev._end });

        const dayMin = 24 * 60;
        const startM = Math.max(0, Math.min(ev._start, dayMin));
        const endM   = Math.max(0, Math.min(ev._end,   dayMin));
        const top = getTopPadPx() + (startM/60) * hourHeight;
        const ht  = Math.max(16, ((endM - startM)/60) * hourHeight);

        // ★ 横幅と位置の動的計算（横スクロール防止＆右寄せ）
        const BASE_LEFT = 55;    // 時刻ラベルの幅（CSSと一致させる）
        const RIGHT_MARGIN = 6;  // 右端の隙間
        const LEFT_STEP = 24;    // 1段ごとのずらし幅

        const left = BASE_LEFT + (depth * LEFT_STEP);

        const div = document.createElement('div');
        div.className = 't-event' + (ev._source === 'dcal' ? ' is-dcal' : '');
        div.style.top     = `${top}px`;
        div.style.height  = `${ht}px`;
        div.style.left    = `${left}px`;
        div.style.width   = `calc(100% - ${left + RIGHT_MARGIN}px)`; // 横スクロール防止
        div.style.zIndex  = String(100 + depth);
        div.style.background = ev.color || '#2b6cb0';

        div.innerHTML = `
          <span class="ev-title">
            ${ev.icon ? `<span class="ev-ico">${escapeHtml(ev.icon)}</span>` : ``}
            ${escapeHtml(ev.title||'(無題)')}
          </span>
          <span class="ev-time">${ev.start} – ${ev.end}</span>
        `;

        div.addEventListener('click', (e)=>{
          e.stopPropagation();
          if (ev._source === 'dcal') {
            openDCalendarEditor(ev._origId, dateStr);
          } else {
            window.openEditorModal(dateStr, ev.id);
          }
        });

        grid.appendChild(div);
      });

      window.renderAll = renderAll;
      window.scrollTimelineTo = scrollTimelineTo;

      // 現在時刻ライン
      const d=new Date();
      const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (dateStr === todayStr){
        const now  = new Date();
        const mins = now.getHours()*60 + now.getMinutes();
        const y    =  getTopPadPx() + (mins/60) * hourHeight;

        const line = document.createElement('div');
        line.className = 'now-line';
        line.style.top = `${y}px`;

        const dot = document.createElement('div');
        dot.className = 'now-dot';
        dot.style.top = `${y - 4}px`;

        grid.appendChild(line);
        grid.appendChild(dot);
      }
    }

    const TL_TAIL = 30;

    function ensureGridHeight(grid){
      const hourH = getHourHeight();
      const TL_TOP = getTopPadPx();
      const total = hourH * 24 + TL_TAIL + TL_TOP;
      grid.style.minHeight = total + 'px';
      grid.style.height    = total + 'px';
    }

    function ymdFromDate(d){
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,'0');
      const day = String(d.getDate()).padStart(2,'0');
      return `${y}-${m}-${day}`;
    }

    function shiftDay(delta){
      const baseStr = (document.getElementById('tlDate')?.value) || todayStr;
      const [yy,mm,dd] = baseStr.split('-').map(n=>parseInt(n,10));
      const base = new Date(yy, (mm||1)-1, dd||1);
      base.setDate(base.getDate() + delta);
      const nextStr = ymdFromDate(base);

      dateInput.value = nextStr;
      if (typeof renderAll === 'function') renderAll();
      if (typeof scrollTimelineTo === 'function') scrollTimelineTo(nextStr);
    }

    function renderAll(){
      buildHours();
      renderEvents(dateInput.value);
      ensureGridHeight(grid);
      requestAnimationFrame(()=> ensureGridHeight(grid));
    }

    function scrollTimelineTo(dateStr){
      const scroller = document.querySelector('#bPanelSchedule .timeline-body');
      if (!scroller) return;

      function getHourHeight(){
        const v = getComputedStyle(document.documentElement).getPropertyValue('--tl-hour');
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 56;
      }
      const hourHeight = getHourHeight();

      const go = (mins, marginRate) => {
        const y =  getTopPadPx() + (mins/60) * hourHeight;
        requestAnimationFrame(()=>{
          requestAnimationFrame(()=>{
            scroller.scrollTop = Math.max(0, y - scroller.clientHeight * marginRate);
          });
        });
      };

      const d=new Date();
      const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

      if (dateStr === todayStr){
        const now = new Date();
        const mins = now.getHours()*60 + now.getMinutes();
        go(mins, 0.35);
        return;
      }

      let all={}; try{ all=JSON.parse(localStorage.getItem('schedulesV1'))||{} }catch{}
      const list = (all[dateStr] || []).slice().sort((a,b)=>a.start.localeCompare(b.start));
      let mins = 8*60;
      if (list.length){
        const [h,m] = list[0].start.split(':').map(Number);
        mins = (h||0)*60 + (m||0);
      }
      go(mins, 0.2);
    }
    window.renderAll = renderAll;
    window.scrollTimelineTo = scrollTimelineTo;

    dateInput.addEventListener('change', ()=>{
      renderAll();
      requestAnimationFrame(()=>{
        scrollTimelineTo(document.getElementById('tlDate').value);
      });
      scrollTimelineTo(dateInput.value);
    });

    btnPrev && btnPrev.addEventListener('click', ()=> shiftDay(-1));
    btnNext && btnNext.addEventListener('click', ()=> shiftDay(+1));

    openBtn.addEventListener('click', ()=> {
      const pf  = document.getElementById('pageFrame');
      const cse = document.getElementById('cseFrame');
      if (cse) cse.style.display = 'none';
      if (pf){
        pf.style.display = 'block';
        pf.src = './schedule.html#' + (dateInput.value || todayStr);
      }
    });

    window.addEventListener('storage', (e)=>{
      if (e.key === SKEY) renderAll();
      if (e.key === 'D_CAL_EVENTS_V1') renderAll();
    });

    renderAll();
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        window.scrollTimelineTo?.(dateInput.value);
      });
    });
    setTimeout(()=>{ window.scrollTimelineTo?.(document.getElementById('tlDate').value); }, 0);
    scrollTimelineTo(dateInput.value);

    setInterval(()=>{
      if (dateInput.value === todayStr) renderAll();
    }, 60*1000);

    function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  })();

// タイムライン編集モーダル
window.openEditorModal = function(dateStr, eventId){
  let all = {};
  try { all = JSON.parse(localStorage.getItem('schedulesV1')) || {}; } catch {}
  const list = all[dateStr] || [];
  const ev = list.find(x => x.id == eventId); // ★修正済み
  if (!ev) return;

  const modal   = document.getElementById('tlEditModal');
  const overlay = document.getElementById('tlEditOverlay');
  if (!modal || !overlay) return;

  const f = {
    title:  modal.querySelector('#mTitle'),
    start:  modal.querySelector('#mStart'),
    end:    modal.querySelector('#mEnd'),
    dur:    modal.querySelector('#mDur'),
    color:  modal.querySelector('#mColor'),
    icon:   modal.querySelector('#mIcon'),
    save:   modal.querySelector('#mSave'),
    delete: modal.querySelector('#mDelete'),
    cancel: modal.querySelector('#mCancel'),
  };

  if (f.title) f.title.value = ev.title || '';
  if (f.start) f.start.value = ev.start || '';
  if (f.end)   f.end.value   = ev.end   || '';
  if (f.dur)   f.dur.value   = '';
  if (f.color) f.color.value = ev.color || '#2b6cb0';
  if (f.icon)  f.icon.value  = ev.icon  || '';
  buildColorChoices(modal);
  syncSelectedColor(modal, f.color ? f.color.value : '#2b6cb0');
  if (f.color){
    f.color.addEventListener('input', ()=>{
      syncSelectedColor(modal, f.color.value);
    }, { once:false });
  }

  modal.dataset.date = dateStr;
  modal.dataset.id   = eventId;

  function resetClick(el, handler){
    if (!el) return;
    const cln = el.cloneNode(true);
    el.parentNode.replaceChild(cln, el);
    cln.addEventListener('click', handler);
  }

  // 保存（★修正済み）
  resetClick(f.save, () => {
    const d  = modal.dataset.date;
    const id = modal.dataset.id;

    let all = {};
    try { all = JSON.parse(localStorage.getItem('schedulesV1')) || {}; } catch {}
    const arr = all[d] || [];
    const idx = arr.findIndex(x => x.id == id);
    if (idx < 0) return;

    const title = f.title?.value?.trim() || '(無題)';
    const start = f.start?.value || '';
    let   end   = f.end?.value || '';
    const dur   = (f.dur?.value || '').trim();

    if (start && !end && dur){
      const min = (function parseDur(s){
        if (!s) return NaN;
        const t = String(s).trim();
        if (/^\d+$/.test(t)) return parseInt(t,10);
        const m = t.match(/^(\d{1,2}):(\d{1,2})$/);
        if (m) return parseInt(m[1],10)*60 + parseInt(m[2],10);
        return NaN;
      })(dur);
      if (Number.isFinite(min) && min>0){
        const [hh,mm] = start.split(':').map(n=>parseInt(n||'0',10));
        const sm = hh*60 + mm;
        const em = sm + min;
        const eh = Math.floor(em/60)%24, eM = em%60;
        end = String(eh).padStart(2,'0') + ':' + String(eM).padStart(2,'0');
      }
    }
    if (!start || !end){ alert('開始/終了を入力してください'); return; }

    const color = f.color?.value || arr[idx].color || '#2b6cb0';
    const icon  = f.icon?.value  || arr[idx].icon  || '';

    arr[idx] = { ...arr[idx], title, start, end, color, icon };
    all[d] = arr;
    localStorage.setItem('schedulesV1', JSON.stringify(all));

    if (typeof window.renderAll === 'function') window.renderAll();
    window.closeEditorModal();
  });

  // 削除（★修正済み）
  resetClick(f.delete, () => {
    if (!confirm('この予定を削除しますか？')) return;

    const d  = modal.dataset.date;
    const id = modal.dataset.id;
    let all = {};
    try { all = JSON.parse(localStorage.getItem('schedulesV1')) || {}; } catch {}
    all[d] = (all[d] || []).filter(x => x.id != id);
    localStorage.setItem('schedulesV1', JSON.stringify(all));

    if (typeof window.renderAll === 'function') window.renderAll();
    window.closeEditorModal();
  });

  // キャンセル
  resetClick(f.cancel, window.closeEditorModal);

  overlay.style.display = 'block';
  modal.style.display   = 'block';
  f.title?.focus?.();
};

const PALETTE = ['#4e79a7','#76b7b2','#59a14f','#edc948','#f28e2b','#e15759','#b07aa1','#9c755f','#bab0ab','#86b0e5'];
function isHexColor(s){ return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(String(s||'')); }

function buildColorChoices(modal){
  const wrap = modal.querySelector('#mColorChoices');
  if (!wrap || wrap.dataset.built === '1') return;

  wrap.innerHTML = '';
  PALETTE.forEach(col=>{
    const cell = document.createElement('div');
    cell.className = 'swatch';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', `色 ${col}`);
    btn.style.setProperty('--swatch-color', col);
    btn.dataset.color = col;

    btn.addEventListener('click', ()=>{
      const inp = modal.querySelector('#mColor');
      if (inp){ inp.value = col; inp.dispatchEvent(new Event('input', {bubbles:true})); }
      syncSelectedColor(modal, col);
    });

    cell.appendChild(btn);
    wrap.appendChild(cell);
  });

  wrap.dataset.built = '1';
}

function syncSelectedColor(modal, color){
  const wrap = modal.querySelector('#mColorChoices');
  const pv   = modal.querySelector('#mColorPreview');
  if (pv){
    const valid = isHexColor(color) ? color : '#2b6cb0';
    pv.style.background = valid;
  }
  if (!wrap) return;
  const btns = wrap.querySelectorAll('button[data-color]');
  btns.forEach(b => b.classList.remove('is-selected'));
  const hit = [...btns].find(b => String(b.dataset.color).toLowerCase() === String(color).toLowerCase());
  if (hit){ hit.classList.add('is-selected'); }
}

window.closeEditorModal = function(){
  const modal   = document.getElementById('tlEditModal');
  const overlay = document.getElementById('tlEditOverlay');
  if (modal)   modal.style.display = 'none';
  if (overlay) overlay.style.display = 'none';
};

function openDCalendarEditor(dcalId, dateStr){
  const pf = document.getElementById('pageFrame');
  const DCAL_URL = './d/calendar.html';   
  if (!pf) { alert('カレンダーフレームが見つかりません'); return; }

  const cse = document.getElementById('cseFrame');
  if (cse) cse.style.display = 'none';
  pf.style.display = 'block';

  const needsNav = !pf.src || !/calendar\.html/.test(pf.src);
  if (needsNav) pf.src = DCAL_URL;

  const send = ()=> {
    try {
      pf.contentWindow?.postMessage({ type:'D_CAL_OPEN_EDIT', id: dcalId }, '*');
    } catch {}
  };

  setTimeout(send, 150);
  function onReady(ev){
    if (ev.data && ev.data.type === 'D_CAL_READY'){
      send();
      window.removeEventListener('message', onReady);
    }
  }
  window.addEventListener('message', onReady);

  try {
    pf.contentWindow?.postMessage({ type:'D_CAL_GOTO_DATE', ymd: dateStr }, '*');
  } catch {}
}


/* ===== スケジュール通知 ===== */
(function(){
  const PREF_KEY = 'scheduleNotifyV1';
  const FIRED_KEY = 'scheduleNotifyFiredV1';
  const btnToggle = document.getElementById('notifyToggle');
  const inLead    = document.getElementById('notifyLead');
  let prefs = { enabled: true, leadMin: 5 };
  try{
    const v = JSON.parse(localStorage.getItem(PREF_KEY)||'{}');
    if (v && typeof v==='object') prefs = { ...prefs, ...v };
  }catch(_){}
  inLead.value = String(prefs.leadMin || 5);
  applyToggleUI();

  let watchId = 0;
  startWatcher();

  btnToggle?.addEventListener('click', async ()=>{
    prefs.enabled = !prefs.enabled;
    if (prefs.enabled){
      const ok = await ensurePermission();
      if (!ok){ prefs.enabled = false; alert('通知が許可されていません'); }
    }
    savePrefs(); applyToggleUI();
  });

  inLead?.addEventListener('change', ()=>{
    const v = Math.max(0, Math.min(120, parseInt(inLead.value || '0', 10) || 0));
    prefs.leadMin = v;
    inLead.value = String(v);
    savePrefs();
  });

  async function ensurePermission(){
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied')  return false;
    try{
      const res = await Notification.requestPermission();
      return res === 'granted';
    }catch(_){ return false; }
  }

  function applyToggleUI(){
    if (!btnToggle) return;
    btnToggle.textContent = prefs.enabled ? '🔔' : '🔕';
    btnToggle.setAttribute('aria-pressed', String(!!prefs.enabled));
    btnToggle.classList.toggle('primary', !!prefs.enabled);
    btnToggle.classList.toggle('muted',   !prefs.enabled);
    btnToggle.title = prefs.enabled ? '通知 ON（クリックでOFF）' : '通知 OFF（クリックでON）';
  }

  function savePrefs(){
    try{ localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }catch(_){}
  }

  function startWatcher(){
    clearInterval(watchId);
    checkAndNotify();
    watchId = setInterval(checkAndNotify, 15 * 1000);
  }

  function todayYmdLocal(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd= String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }

  function hmToMinutes(hm){
    const [h,m] = String(hm||'0:00').split(':').map(Number);
    return (h||0)*60 + (m||0);
  }

  function loadFired(dateStr){
    let mapAll={}; try{ mapAll=JSON.parse(localStorage.getItem(FIRED_KEY)||'{}'); }catch(_){}
    return mapAll[dateStr] || {};
  }
  function saveFired(dateStr, m){
    let mapAll={}; try{ mapAll=JSON.parse(localStorage.getItem(FIRED_KEY)||'{}'); }catch(_){}
    mapAll[dateStr] = m;
    try{ localStorage.setItem(FIRED_KEY, JSON.stringify(mapAll)); }catch(_){}
  }

  async function checkAndNotify(){
    if (!prefs.enabled) return;
    const ok = await ensurePermission();
    if (!ok) { prefs.enabled=false; savePrefs(); applyToggleUI(); return; }

    const ymd = todayYmdLocal();
    const all = (function(){
      try{ return JSON.parse(localStorage.getItem('schedulesV1'))||{} }catch(_){ return {}; }
    })();
    const list = Array.isArray(all[ymd]) ? all[ymd] : [];
    if (!list.length) return;

    const now = new Date();
    const nowMin = now.getHours()*60 + now.getMinutes();
    const firedMap = loadFired(ymd);
    const MARGIN_SEC = 20;
    const lead = (prefs.leadMin|0);

    for (const ev of list){
      if (!ev || !ev.id || !ev.start) continue;
      const startM = hmToMinutes(ev.start);
      const diffMin = startM - nowMin;

      if (diffMin === lead || Math.abs(diffMin - lead) < (MARGIN_SEC/60)){
        const key = `${ev.id}@${ev.start}`;
        if (firedMap[key]) continue;

        const title = ev.title || '(無題)';
        const body  = `まもなく ${ev.start} 開始（${lead}分前）`;
        const tag   = `sched-${ymd}-${key}`;
        fireNotice({ title, body, tag });
        firedMap[key] = 1;
      }
    }
    saveFired(ymd, firedMap);
  }

    function playNotifyChime() {
      const hasTimerAudio = (typeof window.ensureAudio === 'function');
      const useTimerAC = hasTimerAudio && window.AC && window.MASTER;

      async function withAC(run){
        if (hasTimerAudio) {
          try { await window.ensureAudio(); } catch(_) {}
          return run(window.AC, window.MASTER);
        } else {
          const AC = new (window.AudioContext || window.webkitAudioContext)();
          const MASTER = AC.createGain(); MASTER.connect(AC.destination);
          MASTER.gain.value = 0.9;
          const res = run(AC, MASTER);
          setTimeout(()=>{ try{ AC.close(); }catch(_){}} , 800);
          return res;
        }
      }

      withAC((AC, MASTER) => {
        const now = AC.currentTime;
        function bell(freq, t0, dur, gain=0.9){
          const g  = AC.createGain(); g.connect(MASTER);
          const o1 = AC.createOscillator(); o1.type='triangle'; o1.frequency.value=freq; o1.connect(g);
          const o2 = AC.createOscillator(); o2.type='sine';     o2.frequency.value=freq*2; o2.connect(g);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.linearRampToValueAtTime(gain, t0 + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
          o1.start(t0); o2.start(t0);
          o1.stop(t0 + dur + 0.05); o2.stop(t0 + dur + 0.05);
        }
        bell(988, now + 0.00, 0.40, 0.85);
        bell(523, now + 0.25, 0.55, 1.00);

        const noise = AC.createBufferSource();
        const buf = AC.createBuffer(1, AC.sampleRate * 0.12, AC.sampleRate);
        const data = buf.getChannelData(0);
        for (let i=0;i<data.length;i++){ data[i] = (Math.random()*2-1) * (1 - i/data.length); }
        noise.buffer = buf;
        const nGain = AC.createGain(); nGain.gain.value = 0.15;
        noise.connect(nGain); nGain.connect(MASTER);
        noise.start(now);
        noise.stop(now + 0.12);
      });
    }

    function fireNotice({ title, body, tag }, test=false){
      try{
        if ('Notification' in window && Notification.permission === 'granted'){
          const n = new Notification(title, { body, tag, renotify: false });
        }
        playNotifyChime();
        if (!test && navigator.vibrate) navigator.vibrate([120, 80, 160]);
      }catch(_){}
    }
  })();