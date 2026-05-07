/* ================== Eフレーム：TODO（サブありはサブのみ／サブなしは親のまま） ================== */
  const TODO_KEY = 'todosV1';
  const BACKLOG_KEY = 'D_BACKLOG_V1'; // ★ 追加

// ---- サブタスクの状態から親タスクの done / doneAt を一括で整える ----
function recalcAllParentDoneFromSubs(todos){
  if (!Array.isArray(todos)) return;

  const todayStr = (typeof ymdLocal === 'function')
    ? ymdLocal(new Date())
    : new Date().toISOString().slice(0,10); // フォールバック

  todos.forEach(task => {
    if (!task || !Array.isArray(task.subtasks) || task.subtasks.length === 0) {
      // サブタスクが1つもないタスクはそのまま触らない
      return;
    }

    const subs = task.subtasks;

    // id -> サブタスク本体
    const byId = new Map();
    subs.forEach(s => {
      if (!s || !s.id) return;
      byId.set(String(s.id), s);
    });

    // parentKey(''=親タスク) -> その直下の子サブタスク配列
    const childrenMap = new Map();
    subs.forEach(s => {
      if (!s) return;
      let pid = (typeof s.parentSubId === 'string') ? s.parentSubId : '';
      // 親IDが存在しない / 不正なら、親タスク直下扱いにする
      if (pid && !byId.has(pid)) pid = '';
      const key = String(pid);
      if (!childrenMap.has(key)) childrenMap.set(key, []);
      childrenMap.get(key).push(s);
    });

    // key: ''（親タスク） or サブタスクID -> 「そのノードが完了かどうか」
    const effectiveDone = new Map();

    function computeDone(key){
      if (effectiveDone.has(key)) return effectiveDone.get(key);

      const children = childrenMap.get(key) || [];

      if (children.length === 0) {
        if (!key) {
          const v = !!task.done;
          effectiveDone.set(key, v);
          return v;
        }
        const leaf = byId.get(key);
        const v = !!(leaf && leaf.done);
        effectiveDone.set(key, v);
        return v;
      }

      let allChildrenDone = true;
      for (const child of children) {
        const cd = computeDone(String(child.id));
        if (!cd) allChildrenDone = false;
      }

      if (key) {
        const me = byId.get(key);
        if (me) {
          if (allChildrenDone) {
            if (!me.done) {
              me.done = true;
              me.doneAt = me.doneAt || todayStr;
            }
          } else {
            if (me.done) {
              me.done = false;
              me.doneAt = '';
            }
          }
        }
      }

      effectiveDone.set(key, allChildrenDone);
      return allChildrenDone;
    }

    const rootDone = computeDone('');

    const rootChildren = childrenMap.get('') || [];
    if (rootChildren.length > 0) {
      if (rootDone) {
        if (!task.done) {
          task.done = true;
          task.doneAt = task.doneAt || todayStr;
        }
      } else {
        if (task.done) {
          task.done = false;
          task.doneAt = '';
        }
      }
    }
  });
}

function hasChildSubtasks(task, subId){
  if (!task || !Array.isArray(task.subtasks)) return false;

  if (!subId) {
    return task.subtasks.some(s => s && !s.parentSubId);
  }
  const pid = String(subId);
  return task.subtasks.some(s => s && String(s.parentSubId || '') === pid);
}


function loadTodos(){ try{ const v=JSON.parse(localStorage.getItem(TODO_KEY)); return Array.isArray(v)?v:[] }catch{ return [] } }

function saveTodos(list){
  const base = Array.isArray(list) ? list : [];
  const next = (typeof beforeSaveTodos === 'function')
    ? beforeSaveTodos(base)
    : base;

  recalcAllParentDoneFromSubs(next);

  localStorage.setItem(TODO_KEY, JSON.stringify(next));
  try {
    const payload = exportTodosForCalendar(next); 
    window.parent.postMessage({ type: 'D_TODO_SYNC', todos: payload }, '*');
  } catch (e) {
    console.warn('D_TODO_SYNC postMessage failed:', e);
  }
}

function updateParentDoneFromSubs(task){
  if (!task || !Array.isArray(task.subtasks)) return;

  const subs = task.subtasks;
  if (!subs.length) return;

  const allDone = subs.every(s => s && s.done === true);

  if (allDone){
    if (!task.done){
      task.done = true;
      task.doneAt = typeof ymdLocal === 'function'
        ? ymdLocal(new Date())
        : new Date().toISOString().slice(0,10);
    }
  } else {
    if (task.done){
      task.done = false;
      task.doneAt = '';
    }
  }
}


function exportTodosForCalendar(list){
  const out = [];

  const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
  const toEndOfDay = ymd => `${ymd}T23:59`;
  const toStartOfDay = ymd => `${ymd}T00:00`; 

  (Array.isArray(list) ? list : []).forEach(t => {
    const pid   = String(t.id || '');
    const ptitle= String((t.title || '').trim() || '(無題)');

    const pushItem = (id, titleText, startDate, dueDate) => {
      let start = startDate || '';
      let end   = '';

      if (startDate && dueDate) {
        const s = String(startDate).trim();
        const d = String(dueDate).trim();
        start = isYmd(s) ? toStartOfDay(s) : s;
        end   = isYmd(d) ? toEndOfDay(d)   : d;
      }
      else if (startDate && !dueDate) {
        start = String(startDate).trim(); 
      } else if (!startDate && dueDate) {
        const d = String(dueDate).trim();
        end = isYmd(d) ? toEndOfDay(d) : d;
      }

      out.push({
        id: String(id),
        title: String(titleText || '(無題)'),
        start,            
        end,              
        due: dueDate || '' 
      });
    };

    if (Array.isArray(t.subtasks) && t.subtasks.length){
      t.subtasks.forEach(s => {
        if (!s || s.done) return; 
        const sid   = `${pid}::${s.id ?? Math.random().toString(36).slice(2)}`;
        const st    = (s.startDate || t.startDate || '').trim();
        const due   = (s.dueDate   || t.dueDate   || '').trim();
        const label = (s.title || '').trim() || '(無題)';
        pushItem(sid, label, st, due);
      });
    } else {
      if (t.done) return;
      const st  = (t.startDate || '').trim();
      const due = (t.dueDate   || '').trim();
      pushItem(pid, ptitle, st, due);
    }
  });

  return out;
}

/* 日付ヘルパ */
function dstr(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}` }
function parseYMD(s){ if(!s) return null; const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!m) return null; const d=new Date(+m[1],+m[2]-1,+m[3]); return isNaN(d)?null:d }
function addDaysStr(s,n){ const d=parseYMD(s)||new Date(); d.setDate(d.getDate()+n); return dstr(d) }
function todayStr(){ return dstr(new Date()) }
function toYmd(v){
  if (!v) return '';
  if (v instanceof Date) {
    const y=v.getFullYear(), m=String(v.getMonth()+1).padStart(2,'0'), d=String(v.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  const m = String(v).match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function recomputeParentFromSubs(task){
  if (!task || !Array.isArray(task.subtasks) || task.subtasks.length===0) return task;
  const starts = task.subtasks.map(s=>toYmd(s.startDate)).filter(Boolean).sort();
  const dues   = task.subtasks.map(s=>toYmd(s.dueDate)).filter(Boolean).sort();
  task.startDate = starts[0] || '';
  task.dueDate   = dues.length ? dues[dues.length-1] : '';
  const allDone  = task.subtasks.length>0 && task.subtasks.every(s=>s.done===true);
  task.done = allDone;
  return task;
}

function setDoneAt(obj, checked, viewDate){
  if (!obj) return;
  if (checked){
    if (!obj.doneAt) obj.doneAt = viewDate;
  }else{
    obj.doneAt = '';
  }
}
function currentTodoViewDate(){
  const input = document.getElementById('todoDate2') || document.getElementById('todoDate');
  return input?.value || todayStr();
}

function buildItemsForDate(dateStr){
  const all = loadTodos();
  const out = [];

  for (const t of all){
    const subs = Array.isArray(t?.subtasks) ? t.subtasks : [];

    if (subs.length > 0){
      for (const s of subs){
        if (!s || s.done) continue;
        const st = toYmd(s.startDate);
        if (st && st > dateStr) continue;
        out.push({
          type: 'sub',
          parentId:  t.id,
          parentTitle: String(t.title||'').trim() || '(無題)',
          subId:    s.id,
          title:    String(s.title||'').trim() || '(無題)',
          startDate: toYmd(s.startDate) || '',
          dueDate:   toYmd(s.dueDate)   || '',
          icon:      t.icon || '',
          memo:      t.memo || ''
        });
      }
    }else{
      if (t && !t.done){
        const st = toYmd(t.startDate);
        if (!st || st <= dateStr){
          out.push({
            type: 'parent',
            parentId: t.id,
            title:    String(t.title||'').trim() || '(無題)',
            startDate: toYmd(t.startDate) || '',
            dueDate:   toYmd(t.dueDate)   || '',
            icon:      t.icon || '',
            memo:      t.memo || ''
          });
        }
      }
    }
  }
  return out;
}

function sortItems(list){
  return list.slice().sort((a,b)=>{
    const ad=a.dueDate||'9999-12-31', bd=b.dueDate||'9999-12-31';
    if (ad!==bd) return ad<bd?-1:1;
    const as=a.startDate||'9999-12-31', bs=b.startDate||'9999-12-31';
    if (as!==bs) return as<bs?-1:1;
    return (a.title||'').localeCompare(b.title||'');
  });
}

(function(){
  const loops = new WeakMap();

  function startLoop(vp){
    const norm = normalizeMarqueeDOM(vp);
    if (!norm) return;
    const { track, copyW } = norm;

    const viewportW = Math.round(vp.clientWidth);
    if (copyW <= viewportW){
      track.style.transform = 'translate3d(0px,0,0)';
      const prev = loops.get(vp); prev?.stop?.(); loops.delete(vp);
      return;
    }

    const speedPxPerSec = 60;
    const pauseMs = 4000;
    const endX = -copyW; 

    let x = 0;
    let rafId = 0, tPause1 = 0, tPause2 = 0;

    const setX = (px)=>{ track.style.transform = `translate3d(${Math.round(px)}px,0,0)`; };

    function scrollLoop(){
      let last = performance.now();
      rafId = requestAnimationFrame(function tick(now){
        const dt = (now - last) / 1000;
        last = now;
        x -= speedPxPerSec * dt;

        if (x <= endX){
          x = endX;
          setX(x);
          cancelAnimationFrame(rafId); rafId = 0;

          tPause2 = setTimeout(()=>{
            x = 0;
            setX(x);
            tPause1 = setTimeout(()=>{
              scrollLoop(); 
            }, pauseMs);
          }, pauseMs);
          return;
        }

        setX(x);
        rafId = requestAnimationFrame(tick);
      });
    }

    const prev = loops.get(vp); prev?.stop?.();

    setX(0);
    tPause1 = setTimeout(()=>{ scrollLoop(); }, pauseMs);

    loops.set(vp, {
      stop(){
        if (rafId) cancelAnimationFrame(rafId);
        clearTimeout(tPause1); clearTimeout(tPause2);
      }
    });
  }

  function stopLoop(vp){
    const h = loops.get(vp);
    h?.stop?.();
    loops.delete(vp);
  }

  window.initMarquees = function(root){
    (root || document).querySelectorAll('.js-marquee').forEach(startLoop);
  };
  window.stopMarquees = function(root){
    (root || document).querySelectorAll('.js-marquee').forEach(stopLoop);
  };

  let rTimer = 0;
  window.addEventListener('resize', ()=>{
    clearTimeout(rTimer);
    rTimer = setTimeout(()=>{
      stopMarquees(document);
      initMarquees(document);
    }, 120);
  });

  if (document.fonts && document.fonts.ready){
    document.fonts.ready.then(()=> {
      stopMarquees(document);
      initMarquees(document);
    });
  }
})();

function buildLeafSubItemsForDate(dateStr){
  const all = loadTodos();
  const out = [];

  const started = (s)=> !s || s <= dateStr;

  for (const t of all){
    const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
    if (!subs.length) continue;

    const byId = {};
    subs.forEach(s => {
      if (s.id) byId[s.id] = s;
    });

    const parentIds = new Set(
      subs.filter(s => s.parentSubId).map(s => s.parentSubId)
    );

    const leafSubs = subs.filter(s => !parentIds.has(s.id));

    for (const s of leafSubs){
      if (!s) continue;

      const done   = !!s.done;
      const doneAt = toYmd(s.doneAt);
      const st     = toYmd(s.startDate || t.startDate);

      const isShown = done
        ? (doneAt === dateStr)          
        : (!st || st <= dateStr);       
      if (!isShown) continue;

      const leafTitleRaw  = (s.title || '').trim();
      let leafTitleSafe   = leafTitleRaw || '';

      const chainTitles = [];
      let cur = s;
      while (cur){
        const tt = (cur.title || '').trim();
        chainTitles.push(tt || '(無題)');
        if (!cur.parentSubId) break;
        cur = byId[cur.parentSubId];
        if (!cur) break;
      }
      chainTitles.reverse();   

      const rootTitle = (t.title || '').trim() || '(無題)';

      if (!leafTitleSafe){
        leafTitleSafe = chainTitles[chainTitles.length - 1] || '(無題)';
      }

      const parentPathParts = [rootTitle, ...chainTitles.slice(0, -1)];
      const parentPath = parentPathParts.join('_');

      out.push({
        type: 'sub',
        parentId: t.id,
        subId: s.id,
        parentTitle: parentPath,                 
        title: leafTitleSafe,                    
        startDate: toYmd(s.startDate || t.startDate) || '',
        dueDate:   toYmd(s.dueDate   || t.dueDate)   || '',
        done,
        doneAt: doneAt || '',
        icon: t.icon || '',
        memo: t.memo || ''
      });
    }
  }

  return out;
}

function renderTodoListFor(dateStr){
  const wrap = document.getElementById('todoList');

  const prevScrollTop = wrap.scrollTop;
  if (!wrap) return;

  const all = loadTodos();
  const rows = [];
  const started = (s)=> !s || s <= dateStr;

  // ========== ① サブタスクを持たない親タスク（単独TODO） ==========
  for (const t of all){
    const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
    const hasSubs = subs.length > 0;

    if (!hasSubs){
      const isShown = t.done
        ? (toYmd(t.doneAt) === dateStr)            
        : started(t.startDate);                    

      if (!isShown) continue;

      rows.push({
        type: 'parent',
        parentId: t.id,
        subId: '',
        parentTitle: '',
        title: t.title || '(無題)',               
        startDate: t.startDate || '',
        dueDate:   t.dueDate   || '',
        done: !!t.done,
        icon: t.icon || '',
        memo: t.memo || '',
        _isBacklog: false
      });
    }
  }

  // ========== ② サブタスクありのタスク → 葉サブだけ列挙 ==========
  for (const t of all){
    const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
    if (!subs.length) continue;

    const byId = {};
    subs.forEach(s => {
      if (s.id) byId[s.id] = s;
    });

    const parentIds = new Set(
      subs.filter(s => s.parentSubId).map(s => s.parentSubId)
    );

    const leafSubs = subs.filter(s => !parentIds.has(s.id));

    for (const s of leafSubs){
      if (!s) continue;

      const done   = !!s.done;
      const doneAt = toYmd(s.doneAt);
      const st     = toYmd(s.startDate || t.startDate);

      const isShown = done
        ? (doneAt === dateStr)          
        : (!st || st <= dateStr);       

      if (!isShown) continue;

      const leafTitleRaw  = (s.title || '').trim();
      let leafTitleSafe   = leafTitleRaw;

      const chainTitles = [];
      let cur = s;
      while (cur){
        const tt = (cur.title || '').trim();
        chainTitles.push(tt || '(無題)');
        if (!cur.parentSubId) break;
        cur = byId[cur.parentSubId];
        if (!cur) break;
      }
      chainTitles.reverse();   

      const rootTitle = (t.title || '').trim() || '(無題)';

      if (!leafTitleSafe){
        leafTitleSafe = chainTitles[chainTitles.length - 1] || '(無題)';
      }

      const parentPathParts = [rootTitle, ...chainTitles.slice(0, -1)];
      const parentPath = parentPathParts.join('_');

      rows.push({
        type: 'sub',
        parentId: t.id,
        subId: s.id,
        parentTitle: parentPath,                      
        title: leafTitleSafe,                         
        startDate: toYmd(s.startDate || t.startDate) || '',
        dueDate:   toYmd(s.dueDate   || t.dueDate)   || '',
        done,
        icon: t.icon || '',
        memo: t.memo || '',
        _isBacklog: false
      });
    }
  }

  // ========== ②.5 目標・課題（D_BACKLOG_V1）からの連携 ==========
  try {
    const backlogData = JSON.parse(localStorage.getItem(BACKLOG_KEY) || '{"issues":[]}');
    const syncIssues = backlogData.issues.filter(i => i.syncTodo);
    
    const backlogRoots = syncIssues.filter(i => {
      if (!i.parentId) return true;
      const parent = syncIssues.find(p => p.id === i.parentId);
      return !parent;
    });

    function processBacklog(issue, chainTitles) {
      const children = syncIssues.filter(i => i.parentId === issue.id);
      
      if (children.length > 0) {
        children.forEach(c => processBacklog(c, [...chainTitles, issue.title]));
      } else {
        const done = (issue.status === 'done' || issue.status === 'omit');
        const st = issue.startDate || '';
        // 完了していない、かつ開始日が今日以前（未来ではない）
        const isShown = done ? false : (!st || st <= dateStr);
        
        if (isShown) {
          const parentPath = chainTitles.length > 0 ? '[課題] ' + chainTitles.join('_') : '[課題]';
          
          rows.push({
            type: 'sub', 
            parentId: issue.id,
            subId: issue.id,
            parentTitle: parentPath,
            title: issue.title,
            startDate: issue.startDate || '',
            dueDate: issue.dueDate || '',
            done: done,
            icon: '🎯',
            memo: issue.description || '',
            _isBacklog: true
          });
        }
      }
    }
    
    backlogRoots.forEach(r => processBacklog(r, []));
  } catch(e) {}


  // ========== ③ 並べ替え：未完→完了、〆切→開始→タイトル ==========
  rows.sort((a,b)=>{
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ad = a.dueDate || '9999-12-31';
    const bd = b.dueDate || '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    const as = a.startDate || '9999-12-31';
    const bs = b.startDate || '9999-12-31';
    if (as !== bs) return as < bs ? -1 : 1;
    return (a.title||'').localeCompare(b.title||'');
  });

    // ==== ここで最終的に「親_子_孫… / 末端タスク名」を強制的に再計算して上書きする ====
  (function fixSubTitlesFromRealData(){
    const all = loadTodos();

    rows.forEach(r => {
      if (r.type !== 'sub' || r._isBacklog) return;   // 親タスク行やBacklog由来はそのまま

      const task = all.find(t => t.id === r.parentId);
      if (!task || !Array.isArray(task.subtasks)) return;

      const subs = task.subtasks;
      const byId = {};
      subs.forEach(s => { if (s.id) byId[s.id] = s; });

      const leaf = byId[r.subId];
      if (!leaf) return;

      const leafTitleRaw = (leaf.title || '').trim();
      let leafTitleSafe  = leafTitleRaw;

      const chainTitles = [];
      let cur = leaf;
      while (cur){
        const tt = (cur.title || '').trim();
        chainTitles.push(tt || '(無題)');
        if (!cur.parentSubId) break;
        cur = byId[cur.parentSubId];
        if (!cur) break;
      }
      chainTitles.reverse(); 

      const rootTitle = (task.title || '').trim() || '(無題)';

      if (!leafTitleSafe){
        leafTitleSafe = chainTitles[chainTitles.length - 1] || '(無題)';
      }

      const parentPathParts = [rootTitle, ...chainTitles.slice(0, -1)];
      const parentPath = parentPathParts.join('_');

      r.parentTitle = parentPath;
      r.title       = leafTitleSafe;
    });
  })();


      if (!rows.length){
        wrap.innerHTML = `<div style="color:#666;font-size:12px;padding:8px;">この日に対応するTODOはありません</div>`;
      }else{
        const esc = (s)=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
        wrap.innerHTML = rows.map(r => {

          const today = (typeof todayStr === 'function')
            ? todayStr()
            : new Date().toISOString().slice(0,10);

          const dueClass = r.dueDate
            ? (r.dueDate < today ? 'due-overdue' : (r.dueDate === today ? 'due-today' : ''))
            : '';

          const parentPathText = (r.parentTitle || '').trim();

          const parentHint =
            (r.type === 'sub' && parentPathText)
              ? `
                <div class="todo-parent-hint marquee-viewport one-line js-marquee"
                    data-title="${esc(parentPathText)}">
                  <span class="marquee-track">
                    <span class="marquee-copy">${esc(parentPathText)}</span>
                  </span>
                </div>`
              : '';


          const titleLine = `
            <div class="todo-title-line" style="display:flex;align-items:center;gap:6px">
              <span class="todo-ico">${r.icon ? esc(r.icon) : ''}</span>
              <span class="todo-title-text" style="flex:1;min-width:0;">
                ${esc(r.title)}
              </span>
            </div>`;

          const dueLine = r.dueDate ? `<div class="todo-due-line ${dueClass}">〆: ${esc(r.dueDate)}</div>` : '';

          return `
            <div class="todo-row ${r.done ? 'todo-done' : ''}"
                data-type="${r.type}"
                data-parent-id="${esc(r.parentId)}"
                data-sub-id="${esc(r.subId || '')}"
                data-is-backlog="${r._isBacklog ? 'true' : 'false'}"
                style="display:grid;grid-template-columns:22px 1fr 30px;align-items:start;gap:8px;padding:8px 10px;border-bottom:1px solid #e8e8e8;background:#fff;">
              <input type="checkbox" class="todo-check" ${r.done ? 'checked' : ''} title="完了"
                    style="justify-self:center;width:16px;height:16px;">
              <div class="todo-main" style="cursor:pointer">
                ${parentHint}
                ${titleLine}
                ${dueLine}
              </div>
              <button class="todo-btn todo-tomorrow" title="明日へ"
                      style="justify-self:center;width:28px;height:28px;line-height:28px;padding:0;border:1px solid #d0d0d0;border-radius:6px;background:#fff;cursor:pointer;">🔜</button>
            </div>`;
        }).join('');

        initMarquees(wrap);

        wrap.querySelectorAll('.todo-row').forEach(row=>{
          const checked = !!row.querySelector('.todo-check')?.checked;
          applyDoneStyles(row, checked);
        });
      }

      wrap.scrollTop = prevScrollTop;

      wrap.onclick = (e)=>{
        const row = e.target.closest('.todo-row');
        if (!row) return;

        // ✔ 完了トグル
        if (e.target.closest('.todo-check')) {
          const checkbox = e.target;
          const checked  = checkbox.checked === true;
          const viewDate = currentTodoViewDate();
          
          const isBacklog = row.dataset.isBacklog === 'true';
          const pid = row.dataset.parentId;

          // ★ 目標・課題(Backlog) のステータス更新
          if (isBacklog) {
            let backlogData = {issues:[]};
            try { backlogData = JSON.parse(localStorage.getItem(BACKLOG_KEY) || '{"issues":[]}'); } catch(e){}
            const issue = backlogData.issues.find(i => i.id === pid);
            
            if (issue) {
              issue.status = checked ? 'done' : 'todo';
              
              // ローカル用のステータス・日付再計算関数
              function updateBacklogParentsLocal(issues, parentId) {
                if (!parentId) return;
                const parent = issues.find(i => i.id === parentId);
                if (!parent) return;
                const children = issues.filter(i => i.parentId === parentId);
                if (children.length > 0) {
                  let minStart = null, maxDue = null;
                  let hasStart = false, hasDue = false;
                  children.forEach(c => {
                    if (c.startDate) { hasStart = true; if (!minStart || c.startDate < minStart) minStart = c.startDate; }
                    if (c.dueDate) { hasDue = true; if (!maxDue || c.dueDate > maxDue) maxDue = c.dueDate; }
                  });
                  if (hasStart) parent.startDate = minStart;
                  if (hasDue) parent.dueDate = maxDue;

                  const hasDoing = children.some(c => c.status === 'doing');
                  const hasReview = children.some(c => c.status === 'review');
                  const hasDone = children.some(c => c.status === 'done');
                  const hasTodo = children.some(c => c.status === 'todo');
                  const allOmit = children.every(c => c.status === 'omit');
                  if (allOmit) { parent.status = 'omit'; }
                  else if (!hasTodo && !hasDoing && !hasReview) { parent.status = 'done'; }
                  else if (hasDoing || hasReview || hasDone) { parent.status = 'doing'; }
                  else { parent.status = 'todo'; }
                }
                if (parent.parentId) updateBacklogParentsLocal(issues, parent.parentId);
              }
              
              updateBacklogParentsLocal(backlogData.issues, issue.parentId);
              localStorage.setItem(BACKLOG_KEY, JSON.stringify(backlogData));
              applyDoneStyles(row, checked);
              
              // 少し待ってから再描画（すぐ消えると操作感が悪いので）
              setTimeout(()=>renderTodoListFor(viewDate), 300);
              try { window.parent.postMessage({ type:'todo:saved' }, '*'); } catch(e){}
            }
            return;
          }


          const isSub = !!row.dataset.subId;
          const sid   = row.dataset.subId || null;

          const all = loadTodos();
          const parent = all.find(x => x.id === pid);
          if (!parent) return;

          // ==== サブタスク行のチェック処理 ====
          if (isSub && sid){
            if (typeof hasChildSubtasks === 'function' && hasChildSubtasks(parent, sid)) {
              const orig = !!((parent.subtasks || []).find(ss => ss.id === sid)?.done);
              checkbox.checked = orig;
              applyDoneStyles(row, orig);
              alert('このタスクには下位のサブタスクがあるため、直接「完了」を切り替えできません。\n下位のサブタスクをすべて完了にしてください。');
              return;
            }

            const s = (parent.subtasks || []).find(ss => ss.id === sid);
            if (!s) return;

            s.done = checked;
            s.doneAt = checked ? (s.doneAt || viewDate) : '';

            if (typeof recomputeParentFromSubs === 'function') {
              recomputeParentFromSubs(parent);
            } else {
              const subs = Array.isArray(parent.subtasks) ? parent.subtasks : [];
              const starts = subs.map(x => (x.startDate || '').slice(0,10)).filter(Boolean).sort();
              const dues   = subs.map(x => (x.dueDate   || '').slice(0,10)).filter(Boolean).sort();
              parent.startDate = starts[0] || '';
              parent.dueDate   = dues.length ? dues[dues.length-1] : '';
              const allDone = subs.length>0 && subs.every(x => x.done === true);
              parent.done   = allDone;
              parent.doneAt = allDone ? (parent.doneAt || viewDate) : '';
            }

            saveTodos(all);
            applyDoneStyles(row, checked);
            return;
          }

          // ==== 親タスク行 ====
          const hasSubs = Array.isArray(parent.subtasks) && parent.subtasks.length > 0;
          if (hasSubs){
            checkbox.checked = !!parent.done;
            applyDoneStyles(row, parent.done);
            alert('このタスクにはサブタスクがあるため、親タスクを直接「完了」にできません。\nサブタスク側で完了を管理してください。');
            return;
          }

          parent.done   = checked;
          parent.doneAt = checked ? viewDate : '';
          saveTodos(all);
          applyDoneStyles(row, checked);
          return;
        }

        // 🔜 明日へ
        if (e.target.closest('.todo-tomorrow')) {
          const viewDate = currentTodoViewDate();
          const isBacklog = row.dataset.isBacklog === 'true';
          const pid   = row.dataset.parentId;
          const base = parseYMD(viewDate) || new Date();
          const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
          const nextStr = toYmd(next);

          if (isBacklog) {
            let backlogData = {issues:[]};
            try { backlogData = JSON.parse(localStorage.getItem(BACKLOG_KEY) || '{"issues":[]}'); } catch(e){}
            const issue = backlogData.issues.find(i => i.id === pid);
            if (issue) {
               issue.startDate = nextStr;
               localStorage.setItem(BACKLOG_KEY, JSON.stringify(backlogData));
               renderTodoListFor(viewDate);
               try { window.parent.postMessage({ type:'todo:saved' }, '*'); } catch(e){}
            }
            return;
          }

          const isSub = !!row.dataset.subId;
          const sid   = row.dataset.subId || null;
          const all = loadTodos();
          const parent = all.find(x => x.id === pid);
          if (!parent) return;

          if (isSub && sid){
            const s = (parent.subtasks || []).find(ss => ss.id === sid);
            if (!s) return;
            s.startDate = nextStr;
          }else{
            parent.startDate = nextStr;
          }

          saveTodos(all);
          renderTodoListFor(viewDate);
          return;
        }

        // 本文クリック → モーダル編集（目標・課題はタブ移動）
        const isBacklog = row.dataset.isBacklog === 'true';
        if (isBacklog) {
           try { window.parent.postMessage({ type: 'D_SWITCH_TAB', tab: 'goals' }, '*'); } catch(e){}
        } else {
           openTodoModal(row.dataset.parentId, row.dataset.subId || '');
        }
      };

    }


  function applyDoneStyles(row, done){
  const titleEl = row.querySelector(
    '.todo-title-text, .todo-title, .title, .text, .label, .todo-main > .todo-title-line span:last-child'
  );
  if (titleEl){
    titleEl.style.textDecoration = done ? 'line-through' : '';
    titleEl.style.color = done ? '#888' : '';
  }

  const dueEl = row.querySelector('.todo-due-line, .due, .meta');
  if (dueEl){
    dueEl.style.color = done ? '#aaa' : '';
  }

  row.classList.toggle('todo-done', done);
}

function setupMarquees(root){
const els = Array.from(root.querySelectorAll('.js-marquee'));
els.forEach(vp => {
const info = normalizeMarqueeDOM(vp); 
if (!info) return;
const { needsScroll } = info;
if (needsScroll) {
vp.classList.add('is-marquee');
} else {
vp.classList.remove('is-marquee');
}
});
}


function normalizeMarqueeDOM(vp){
const track = vp.querySelector('.marquee-track');
if (!track) return null;


let copies = Array.from(track.querySelectorAll('.marquee-copy'));
if (copies.length === 0) return null;


track.style.display = 'flex';
track.style.flexWrap = 'nowrap';
track.style.gap = '0';
track.style.margin = '0';
track.style.padding = '0';
track.style.willChange = 'auto';
track.style.transition = 'none';


copies.forEach(el=>{
el.style.flex = '0 0 auto';
el.style.display = 'block';
el.style.margin = '0';
el.style.whiteSpace = 'nowrap';
el.style.boxSizing = 'border-box';
});


const first = copies[0];
let copyW = Math.round(first.getBoundingClientRect().width);
const vpW = Math.round(vp.getBoundingClientRect().width);


const needsScroll = copyW > (vpW + 2);


if (needsScroll) {
first.insertAdjacentText('beforeend', ' ');
if (copies.length === 1) {
track.appendChild(first.cloneNode(true));
copies = Array.from(track.querySelectorAll('.marquee-copy'));
}
copyW = Math.round(first.getBoundingClientRect().width);
track.style.width = (copyW * 2) + 'px';
} else {
if (copies.length > 1) {
for (let i = copies.length - 1; i >= 1; i--) {
copies[i].remove();
}
}
track.style.width = copyW + 'px';
track.style.transform = 'translate3d(0px,0,0)';
}


return { track, copyW, vpW, needsScroll };
}



function $id(id){ return document.getElementById(id); }

const TM = {
  overlay:null, modal:null, title:null, start:null, due:null, icon:null, memo:null, done:null,
  save:null, del:null, cancel:null,
  _bound:false
};

function ensureTodoModalRefs(){
  if (TM.modal && TM.title) return true;
  TM.overlay = $id('todoModalOverlay');
  TM.modal   = $id('todoModal');
  TM.title   = $id('tmTitle');
  TM.start   = $id('tmStart');
  TM.due     = $id('tmDue');
  TM.icon    = $id('tmIcon');
  TM.memo    = $id('tmMemo');
  TM.done    = $id('tmDone');
  TM.save    = $id('tmSave');
  TM.del     = $id('tmDelete');
  TM.cancel  = $id('tmCancel');

  const ok = !!(TM.overlay && TM.modal && TM.title && TM.save && TM.del && TM.cancel);
  if (!ok) return false;

  if (!TM._bound){
    TM.save.addEventListener('click', onTmSave);
    TM.del.addEventListener('click', onTmDelete);
    TM.cancel.addEventListener('click', closeTodoModal);
    TM.overlay.addEventListener('click', closeTodoModal);
    window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeTodoModal(); });
    TM._bound = true;
  }
  return true;
}

function openTodoModal(parentId, subId=''){
  if (!ensureTodoModalRefs()){
    console.warn('TODOモーダルのDOMが見つかりません');
    return;
  }
  const all = loadTodos();
  const t = all.find(x=>x.id===parentId);
  if (!t) return;

  TM_editingId = parentId;
  TM_isSub     = !!subId;
  TM_subId     = subId || '';

  if (TM_isSub){
    const s = Array.isArray(t.subtasks) ? t.subtasks.find(v=>v.id===subId) : null;
    if (!s) return;
    TM.title.value = s.title || '';
    TM.start.value = s.startDate || '';
    TM.due.value   = s.dueDate   || '';
    TM.icon.value  = t.icon      || '';
    TM.memo.value  = t.memo      || '';
    TM.done.checked= !!s.done;
    const hint = TM.modal.querySelector('.tm-parent-hint');
    if (hint) { hint.textContent = `親：${t.title || '(無題)'}`; hint.style.display = ''; }
  }else{
    TM.title.value = t.title || '';
    TM.start.value = t.startDate || '';
    TM.due.value   = t.dueDate   || '';
    TM.icon.value  = t.icon      || '';
    TM.memo.value  = t.memo      || '';
    TM.done.checked= !!t.done;
    const hint = TM.modal.querySelector('.tm-parent-hint');
    if (hint) hint.style.display = 'none';
  }

  TM.overlay.style.display = 'block';
  TM.modal.style.display   = 'block';
  TM.title.focus();
}

function closeTodoModal(){
  if (!ensureTodoModalRefs()) return;
  TM.modal.style.display   = 'none';
  TM.overlay.style.display = 'none';
  TM_editingId = null;
  TM_isSub     = false;
  TM_subId     = '';
}

function onTmSave(){
  if (!ensureTodoModalRefs()) return;

  const all = loadTodos();
  const i = all.findIndex(x => x.id === TM_editingId);
  if (i < 0) { closeTodoModal(); return; }

  const viewDate = currentTodoViewDate();
  const t = all[i];

  if (TM_isSub) {
    const s = Array.isArray(t.subtasks) ? t.subtasks.find(v => v.id === TM_subId) : null;
    if (!s) { closeTodoModal(); return; }

    const wasSubDone = !!s.done;

    const hasChildren = (typeof hasChildSubtasks === 'function')
      ? hasChildSubtasks(t, s.id)
      : false;

    s.title     = (TM.title.value || '').trim() || '(無題)';
    s.startDate = TM.start.value || '';
    s.dueDate   = TM.due.value   || '';

    if (hasChildren) {
      TM.done.checked = wasSubDone; 
      s.done          = wasSubDone;
    } else {
      s.done = !!TM.done.checked;

      if (!wasSubDone && s.done) s.doneAt = viewDate;
      if (!s.done) s.doneAt = '';
    }

    t.icon = TM.icon.value || '';
    t.memo = TM.memo.value || '';

    if (typeof recomputeParentFromSubs === 'function') {
      recomputeParentFromSubs(t);
    } else {
      const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
      const starts = subs.map(x => (x.startDate || '')).filter(Boolean).sort();
      const dues   = subs.map(x => (x.dueDate   || '')).filter(Boolean).sort();
      t.startDate  = starts[0] || '';
      t.dueDate    = dues.length ? dues[dues.length-1] : '';
      t.done       = subs.length>0 && subs.every(x => x.done === true);
      t.doneAt     = t.done ? (t.doneAt || viewDate) : '';
    }

  } else {
    const hasSubs = Array.isArray(t.subtasks) && t.subtasks.length > 0;
    const wasDone = !!t.done;
    const nowDone = !!TM.done.checked;

    t.title     = (TM.title.value||'').trim() || '(無題)';
    t.startDate = TM.start.value || '';
    t.dueDate   = TM.due.value   || '';
    t.icon      = TM.icon.value  || '';
    t.memo      = TM.memo.value  || '';

    if (hasSubs) {
      TM.done.checked = wasDone; 
    } else {
      t.done   = nowDone;
      t.doneAt = nowDone ? (wasDone ? (t.doneAt || viewDate) : viewDate) : '';

      if (Array.isArray(t.subtasks)) {
        t.subtasks.forEach(s => s.done = nowDone);
      }
    }

    all[i] = t;
  }

  saveTodos(all);               
  closeTodoModal();

  const input = document.getElementById('todoDate2') || document.getElementById('todoDate');
  renderTodoListFor(input?.value || viewDate);
}



function onTmDelete(){
  if (!ensureTodoModalRefs()) return;
  if (!TM_editingId) return;

  const all = loadTodos();
  const i = all.findIndex(x=>x.id===TM_editingId);
  if (i < 0) { closeTodoModal(); return; }

  if (TM_isSub){
    if (!confirm('このサブタスクを削除しますか？')) return;
    const t = all[i];
    if (Array.isArray(t.subtasks)){
      t.subtasks = t.subtasks.filter(s => s.id !== TM_subId);
      const starts = t.subtasks.map(x => (x.startDate||'')).filter(Boolean).sort();
      const dues   = t.subtasks.map(x => (x.dueDate||'')).filter(Boolean).sort();
      t.startDate  = starts[0] || '';
      t.dueDate    = dues.length ? dues[dues.length-1] : '';
      t.done       = t.subtasks.length>0 && t.subtasks.every(x=>x.done===true);
      t.doneAt     = t.done ? (t.doneAt || (document.getElementById('todoDate2')?.value || document.getElementById('todoDate')?.value || '')) : '';
    }
  }else{
    if (!confirm('このTODOを削除しますか？')) return;
    all.splice(i, 1);
  }

  saveTodos(all);
  closeTodoModal();
  if (typeof renderTodoListFor === 'function'){
    const input = document.getElementById('todoDate2') || document.getElementById('todoDate');
    renderTodoListFor(input?.value || todayStr());
  }
}

/* 日付ナビ・初期化 */
(function initETodo(){
  const dateInput = document.getElementById('todoDate2') || document.getElementById('todoDate');
  const prevBtn   = document.getElementById('todoPrev2') || document.getElementById('todoPrev');
  const nextBtn   = document.getElementById('todoNext2') || document.getElementById('todoNext');
  const editBtn   = document.getElementById('openTodoEditor2') || document.getElementById('openTodoEditor');

  if (!dateInput) return;

  dateInput.value = todayStr();
  renderTodoListFor(dateInput.value);

  prevBtn?.addEventListener('click', ()=>{ dateInput.value = addDaysStr(dateInput.value, -1); renderTodoListFor(dateInput.value); });
  nextBtn?.addEventListener('click', ()=>{ dateInput.value = addDaysStr(dateInput.value, 1);  renderTodoListFor(dateInput.value); });
  dateInput.addEventListener('change', ()=> renderTodoListFor(dateInput.value));

  editBtn?.addEventListener('click', ()=>{
    const pf = document.getElementById('pageFrame');
    const cse= document.getElementById('cseFrame');
    if (cse) cse.style.display='none';
    if (pf){
      pf.style.display='block';
      pf.src = './todo.html#' + encodeURIComponent(dateInput.value);
    }else{
      window.open('./todo.html#' + encodeURIComponent(dateInput.value), '_blank');
    }
  });

  // ★ Eフレーム側でも Backlog のデータ変更を監視して同期する
  window.addEventListener('storage', (e)=>{ 
    if (e.key === TODO_KEY || e.key === BACKLOG_KEY) {
      renderTodoListFor(dateInput.value); 
    }
  });
})();

/* 受け渡し：schedule.html 等からの todo:request に、混在アイテムを返す */
(function(){
  function collectItems(dateStr){
    return sortItems(buildItemsForDate(dateStr)).map(x=>{
      if (x.type==='sub') return {
        type:'sub', title:x.title, parentTitle:x.parentTitle, parentId:x.parentId, subId:x.subId, startDate:x.startDate, dueDate:x.dueDate
      };
      return {
        type:'parent', title:x.title, parentId:x.parentId, startDate:x.startDate, dueDate:x.dueDate
      };
    });
  }

  window.addEventListener('message', (e)=>{
    const d = e.data;
    if (!d || d.type !== 'todo:request') return;
    const date = d.date || todayStr();
    const items = collectItems(date);
    try{ e.source?.postMessage({ type:'todo:response', date, items }, '*'); }catch(_){}
  });

  window.addEventListener('storage', (e)=>{
    if (e.key !== 'todoReqV1') return;
    let req=null; try{ req=JSON.parse(e.newValue||'null'); }catch(_){}
    if (!req || !req.date) return;
    const items = collectItems(req.date);
    try{ localStorage.setItem('todoRespV1', JSON.stringify({ date:req.date, items, at: Date.now() })); }catch(_){}
  });
})();

/* エスケープ */
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) }



// dframe.html を読み込む本体iframe（完全移行時は #dFrame を1本に）
const d = document.getElementById('dFrame') || document.getElementById('pageFrame');

// DにURLを開かせる（旧：pageFrame.src = "https://..." の置換先）
function D_OPEN_URL(url){
  try { d.contentWindow.postMessage({ type:'D_OPEN_URL', url }, '*'); } catch {}
}

// Dのタブを切り替える
function D_SWITCH_TAB(tab){
  try { d.contentWindow.postMessage({ type:'D_SWITCH_TAB', tab }, '*'); } catch {}
}

window.addEventListener('message', (ev) => {
  const data = ev.data || {};
  if (data.type === 'D_TODO_SYNC' && Array.isArray(data.todos)) {
    const d = document.getElementById('dFrame');
    if (d && d.contentWindow) {
      try { d.contentWindow.postMessage(data, '*'); } catch(e){ console.warn('Relay failed:', e); }
    }
  }
});

window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'todo:saved') {
    if (typeof renderTodoListFor === 'function') {
      const dateInput = document.getElementById('todoDate2') || document.getElementById('todoDate');
      if(dateInput) renderTodoListFor(dateInput.value);
    }
  }
});