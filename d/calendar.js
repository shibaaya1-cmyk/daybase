// ---- ローカル日付ユーティリティ（JST基準）【最上部に配置】----
(function(){
  // すでに定義済みでも上書きしてOK（安全な同義関数）
  window.ymdLocal = function(d){
    return [
      d.getFullYear(),
      String(d.getMonth()+1).padStart(2,'0'),
      String(d.getDate()).padStart(2,'0')
    ].join('-');
  };
  window.isSameLocalDate = function(a,b){
    return a.getFullYear()===b.getFullYear()
        && a.getMonth()===b.getMonth()
        && a.getDate()===b.getDate();
  };
  // 既存の sameDay をローカル同日判定に統一
  window.sameDay = window.isSameLocalDate;
})();


// ---- ローカル日付ユーティリティ（JST基準） ----
function ymdLocal(d){
  return [
    d.getFullYear(),
    String(d.getMonth()+1).padStart(2,'0'),
    String(d.getDate()).padStart(2,'0')
  ].join('-');
}

// ローカル同日判定
function isSameLocalDate(a,b){
  return a.getFullYear()===b.getFullYear()
      && a.getMonth()===b.getMonth()
      && a.getDate()===b.getDate();
}

function sameDay(a,b){ return isSameLocalDate(a,b); }

// ==== 祝日：グローバルマップ（YYYY-MM-DD -> 名称） ====
if (typeof HOLIDAYS_JP === 'undefined') {
  var HOLIDAYS_JP = {};
}
let __holidayLoading = false;

// === 週の終日イベントをレーンに詰めて配置し、行数をCSSに反映 ===
// container: 終日欄のDOM（.allday-strip）
// weekStart: 週の開始日（Date: 00:00）
// events: [{ id, title, start: Date|string, end: Date|string, allDay?:true }]
function layoutAllDayWeek(container, weekStart, events){
  if (!container) return;
  const ws = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()); ws.setHours(0,0,0,0);
  const we = new Date(ws); we.setDate(we.getDate()+7); // 週末境界（exclusive）

  // 文字列→Date & all-day正規化（YYYY-MM-DD or T付きどちらでもOK）
  const toDate = (v, end=false) => {
    if (!v) return null;
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    if (!m) return null;
    const d = new Date(+m[1], +m[2]-1, +m[3]);
    d.setHours(0,0,0,0);
    if (end) d.setDate(d.getDate() + 1); // [start, end) で扱うため end は翌日に寄せる
    return d;
  };

  // 週にかかる“終日”イベントを [colStart, colEnd) に切り出す
  const intervals = [];
  (events||[]).forEach(ev=>{
    const s = toDate(ev.start,false);
    const e = toDate(ev.end  ,true ); // exclusive
    if (!s && !e) return;
    // 片側が欠けている場合の補正
    const ss = s ? new Date(s) : new Date(ws);
    const ee = e ? new Date(e) : new Date(ss); ee.setDate(ee.getDate()+1);

    // 週に重なる部分を抽出
    const startClamped = ss < ws ? new Date(ws) : ss;
    const endClamped   = ee > we ? new Date(we) : ee;
    if (startClamped >= endClamped) return; // かからない

    const colStart = Math.floor((startClamped - ws) / 86400000); // 0..6
    const colEnd   = Math.ceil ((endClamped   - ws) / 86400000); // 1..7
    intervals.push({
      id: String(ev.id||''),
      title: String(ev.title||'(無題)'),
      colStart, colEnd,     // [start,end)
      span: Math.max(1, colEnd - colStart)
    });
  });

  // 区間グラフをレーン詰め（最小の非衝突レーンへ割当て）
  intervals.sort((a,b)=> (a.colStart - b.colStart) || (b.span - a.span));
  const lanes = []; // each lane: lastEnd
  intervals.forEach(iv=>{
    let lane = 0;
    while (lane < lanes.length && lanes[lane] > iv.colStart) lane++;
    lanes[lane] = iv.colEnd;
    iv.lane = lane;
  });

  // 行数をCSSへ反映（見切れ防止）
  const rows = Math.max(1, lanes.length);
  container.style.setProperty('--allday-rows', rows);

  // 既存の子ノードをクリアして再描画（必要なら append だけに変えてOK）
  container.querySelectorAll('.allday-chip').forEach(n=>n.remove());

  // DOM配置
  const frag = document.createDocumentFragment();
  intervals.forEach(iv=>{
    const chip = document.createElement('div');
    chip.className = 'allday-chip';
    chip.style.setProperty('--lane', iv.lane);
    chip.style.setProperty('--start-col', iv.colStart);
    chip.style.setProperty('--span-cols', iv.span);
    chip.textContent = iv.title;
    // クリックで詳細や編集に飛ばすならここでイベント付与
    frag.appendChild(chip);
  });
  container.appendChild(frag);
}

// 公開API（公式CSV*）→ 失敗時は規則ベース生成
// * https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv （CORSの事情で失敗する場合あり）
async function ensureHolidays(year){
  if (__holidayLoading) return;
  const y = year || (new Date()).getFullYear();
  // すでにその年が入っていればスキップ
  if (Object.keys(HOLIDAYS_JP).some(k => k.startsWith(String(y)))) return;

  __holidayLoading = true;
  try{
    // 1) 内閣府CSVを試す
    // 例: "国民の祝日,2025/01/01\n元日,2025/01/01\n..."
    const controller = new AbortController();
    const t = setTimeout(()=>controller.abort(), 4000);
    const res = await fetch('https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error('csv fetch failed');
    const txt = await res.text();

    // 年で絞って取り込む
    const lines = txt.split(/\r?\n/).slice(1); // ヘッダ除去
    for (const line of lines){
      if (!line) continue;
      const [name,dateJP] = line.split(',');
      if (!name || !dateJP) continue;
      // "YYYY/M/D" または "YYYY/MM/DD"
      const m = dateJP.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (!m) continue;
      const yy = +m[1], mm = +m[2], dd = +m[3];
      if (yy !== y) continue; // 当年のみ取り込む（必要に応じて±1年など拡張）
      const d = new Date(yy, mm-1, dd, 0,0,0,0);
      HOLIDAYS_JP[ ymdLocal(d) ] = name.trim();
    }
  }catch(_){
    // 2) 規則ベースで当年の祝日を生成（振替・国民の休日も対応）
    Object.assign(HOLIDAYS_JP, genJapaneseHolidaysForYear(y));
  }finally{
    __holidayLoading = false;
    // 祝日が入ったので再描画（描画関数名が render() の想定）
    try{ if (typeof render === 'function') render(); }catch{}
  }
}

// ===== 規則ベース生成（2000年以降を想定：一部の特例は別途追加可能）=====
function genJapaneseHolidaysForYear(year){
  const map = {};
  const D = (y,m,d)=> new Date(y,m-1,d,0,0,0,0);
  const put = (d,name)=> map[ ymdLocal(d) ] = name;

  // 固定日
  put(D(year,1,1),   '元日');
  put(D(year,2,11),  '建国記念の日');
  put(D(year,4,29),  '昭和の日');
  put(D(year,5,3),   '憲法記念日');
  put(D(year,5,4),   'みどりの日');
  put(D(year,5,5),   'こどもの日');
  put(D(year,11,3),  '文化の日');
  put(D(year,11,23), '勤労感謝の日');
  // 天皇誕生日（2019以降 2/23）
  if (year >= 2020) put(D(year,2,23), '天皇誕生日');

  // ハッピーマンデー
  put(nthMonday(year,1, 2), '成人の日');      // 1月第2月曜
  put(nthMonday(year,7, 3), '海の日');        // 7月第3月曜
  put(nthMonday(year,9, 3), '敬老の日');      // 9月第3月曜
  put(nthMonday(year,10,2), 'スポーツの日');  // 10月第2月曜

  // 春分・秋分（近似式）
  put( vernalEquinox(year), '春分の日' );
  put( autumnalEquinox(year), '秋分の日' );

  // 振替休日（祝日が日曜に当たる→翌平日）
  addSubstituteHolidays(map);

  // 国民の休日（祝日に挟まれた平日）
  addCitizensHoliday(map);

  return map;

  function nthMonday(y, m, nth){
    const d = new Date(y, m-1, 1);
    const w = d.getDay(); // 0=日..6=土
    // 月初から「最初の月曜」までの差
    const delta = (1 - w + 7) % 7;
    const day = 1 + delta + (nth-1)*7;
    return new Date(y, m-1, day, 0,0,0,0);
  }
  function vernalEquinox(y){
    // 国立天文台近似式（2000-2099）
    const day = Math.floor(20.8431 + 0.242194*(y-1980)) - Math.floor((y-1980)/4);
    return D(y,3,day);
    // 厳密さが必要ならテーブル化も可
  }
  function autumnalEquinox(y){
    const day = Math.floor(23.2488 + 0.242194*(y-1980)) - Math.floor((y-1980)/4);
    return D(y,9,day);
  }
  function addSubstituteHolidays(tbl){
    // 祝日が日曜なら、翌日以降の最初の平日を「振替休日」に
    const keys = Object.keys(tbl).sort();
    keys.forEach(k=>{
      const [yy,mm,dd] = k.split('-').map(n=>+n);
      const d = new Date(yy,mm-1,dd);
      if (d.getDay() === 0){ // 日曜
        let i = 1;
        while (true){
          const cand = new Date(yy,mm-1,dd+i);
          const kc = ymdLocal(cand);
          if (!tbl[kc] && cand.getDay() !== 0){ // 祝日でなく日曜でもない
            tbl[kc] = '振替休日';
            break;
          }
          i++;
          if (i>7) break;
        }
      }
    });
  }
  
  function addCitizensHoliday(tbl){
    // 祝日-平日-祝日 の「平日」を国民の休日に（5/4は固定祝日に昇格済みなので基本スキップでOK）
    const byDate = Object.keys(tbl).sort().map(k => ({ k, d: toDate(k) }));
    for (let i=0;i<byDate.length-1;i++){
      const a = byDate[i], b = byDate[i+1];
      const gap = (toDate(b.k) - toDate(a.k)) / 86400000;
      if (gap === 2){ // 1日空き
        const mid = new Date(a.d.getFullYear(), a.d.getMonth(), a.d.getDate()+1);
        if (mid.getDay() !== 0){ // 日曜は置き換え済みのケースもあるので、平日だけ付与
          const key = ymdLocal(mid);
          if (!tbl[key]) tbl[key] = '国民の休日';
        }
      }
    }
    function toDate(ymd){
      const [y,m,d] = ymd.split('-').map(n=>+n);
      return new Date(y,m-1,d,0,0,0,0);
    }
  }
}

// ローカル（JST）基準で "YYYY-MM-DD" を作る
function ymdLocal(d){
  return [
    d.getFullYear(),
    String(d.getMonth()+1).padStart(2,'0'),
    String(d.getDate()).padStart(2,'0')
  ].join('-');
}

// ローカル日付で照合（UTCは使わない）
function holidayNameJP(d){
  return HOLIDAYS_JP[ ymdLocal(d) ] || '';
}

window.addEventListener('error', (e) => {
  try { window.parent.postMessage({ type:'D_CAL_ERR', message: e.message }, '*'); } catch {}
});

// 起動時に当年の祝日をロード（完了後に自動で再描画されます）
ensureHolidays((new Date()).getFullYear());

// Eフレームの todosV1 から「親ID→サブ期間(Date)の配列」マップを作る
// Eフレームの todosV1 から「親ID→（直下のサブタスク期間）の配列」マップを作る
// ※ 孫タスク・ひ孫タスクなど parentSubId を持つものはカレンダー表示の対象外にする
function buildTodoSubsMap(){
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem('todosV1') || '[]') || [];
  } catch(_) {}

  const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
  const toStart = ymd => new Date(+ymd.slice(0,4), +ymd.slice(5,7)-1, +ymd.slice(8,10), 0,0,0,0);
  const toEnd   = ymd => new Date(+ymd.slice(0,4), +ymd.slice(5,7)-1, +ymd.slice(8,10),23,59,0,0);

  const map = new Map();

  list.forEach(t => {
    const pid  = String(t?.id || '');
    const subs = Array.isArray(t?.subtasks) ? t.subtasks : [];
    const segs = [];

    subs.forEach(s => {
      if (!s || s.done) return; // 完了サブタスクは除外

      // ★ ここがポイント：
      // parentSubId を持っている = 何かのサブタスクの「子」
      // つまり「孫タスク以降」なのでカレンダーには出さない
      if (s.parentSubId && String(s.parentSubId).trim() !== '') return;

      const stRaw = (s.startDate || t.startDate || '').trim();
      const duRaw = (s.dueDate   || t.dueDate   || '').trim();

      let st = null, en = null;

      if (stRaw && duRaw){
        st = isYmd(stRaw) ? toStart(stRaw) : new Date(stRaw);
        en = isYmd(duRaw) ? toEnd(duRaw)   : new Date(duRaw);
      } else if (stRaw){
        st = isYmd(stRaw) ? toStart(stRaw) : new Date(stRaw);
        en = new Date(st.getTime() + 60*60*1000); // 開始のみ→+1h
      } else if (duRaw){
        const d = isYmd(duRaw) ? toStart(duRaw) : new Date(duRaw);
        st = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9,0,0,0);   // 9–18帯
        en = new Date(d.getFullYear(), d.getMonth(), d.getDate(),18,0,0,0);
      }

      if (st && en){
        segs.push({
          start: st,
          end  : en,
          title: String(s.title || '(無題)')
        });
      }
    });

    if (segs.length){
      map.set(pid, segs);
    }
  });

  return map;
}


window.addEventListener('message', (ev) => {
  const data = ev.data || {};
  if (data.type === 'D_TODO_SYNC' && Array.isArray(data.todos)) {
    // 受け取った配列をキャッシュして即再描画
    window.__D_TODO_CACHE = data.todos;
    render();
  }
});

if (window.__D_CAL_BOOT_OK) { 
  // 既に初期化済みなら何もしない
  try { window.parent.postMessage({ type:'D_CAL_READY' }, '*'); } catch {}
  // ここで return するか、以下の本体を実行しないようにする
}
// ガードON
window.__D_CAL_BOOT_OK = true;

// 先頭あたりでURLパラメータを読む
const usp = new URLSearchParams(location.search);
const scale = parseFloat(usp.get('scale') || '1');
if (!isNaN(scale) && scale > 0) {
  document.documentElement.style.setProperty('--scale', String(scale));
}

(function(){
  // 要素取得
  const mount = document.getElementById('mount');
  const label = document.getElementById('label');
  const viewBtns = Array.from(document.querySelectorAll('.seg .btn'));
  const addBtn = document.getElementById('addBtn');
  const showLocal = document.getElementById('showLocal');
  const showTodo  = document.getElementById('showTodo');
  const dlg = document.getElementById('dlg');
  const form = document.getElementById('form');
  const allDayChk = document.getElementById('allDay'); // 無ければ null のままでOK
  const delBtn = document.getElementById('delBtn');

  // ストレージキー
  const KEY_EVENTS = 'D_CAL_EVENTS_V1';
  const KEY_FLAGS  = 'D_CAL_SOURCE_FLAGS_V1';
  const TODO_KEY   = 'todosV1'; // Eフレーム想定

  // 状態
  let current = startOfMonth(new Date());
  let view = 'month'; // 'year' | 'month' | 'week'
  let events = loadJSON(KEY_EVENTS, []).map(deser);
  let flags  = Object.assign({local:true,todo:true}, loadJSON(KEY_FLAGS, {}));
  showLocal.checked = !!flags.local;
  showTodo.checked  = !!flags.todo;

  // ------------- ユーティリティ -------------
  function loadJSON(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d }catch{ return d } }
  function saveJSON(k, v){ localStorage.setItem(k, JSON.stringify(v)) }
  function deser(ev){ return {...ev, start:new Date(ev.start), end:new Date(ev.end)} }
  function ymd(d){ return d.toISOString().slice(0,10) }
  function startOfMonth(d){ const t=new Date(d); t.setDate(1); t.setHours(0,0,0,0); return t }
  function endOfMonth(d){ const t=new Date(d); t.setMonth(t.getMonth()+1,0); t.setHours(23,59,59,999); return t }
  function startOfWeek(d){ const t=new Date(d); const dow=(t.getDay()+6)%7; t.setDate(t.getDate()-dow); t.setHours(0,0,0,0); return t } // 月始まり
  function fmtRange(a,b){
    const p = (x)=> `${x.getMonth()+1}/${x.getDate()} ${String(x.getHours()).padStart(2,'0')}:${String(x.getMinutes()).padStart(2,'0')}`;
    return `${p(a)} - ${p(b)}`
  }
  // 例: 2025/10/03–10/06（年がまたがる/年が違う場合は両方に年を付ける）
  function fmtRangeDateOnly(a, b){
    const y = d => d.getFullYear();
    const m = d => String(d.getMonth()+1).padStart(2,'0');
    const d2= d => String(d.getDate()).padStart(2,'0');

    const ya = y(a), yb = y(b);
    const sa = `${ya}/${m(a)}/${d2(a)}`;
    const sbSameYear = `${m(b)}/${d2(b)}`;
    const sbFull     = `${yb}/${m(b)}/${d2(b)}`;

    return (ya === yb) ? `${sa}–${sbSameYear}` : `${sa}–${sbFull}`;
  }
  function uid(){ return Math.random().toString(36).slice(2,10) }
  function overlaps(a1,a2,b1,b2){ return a1<b2 && a2>b1 }
  function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
  function toLocalDT(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${y}-${m}-${day}T${hh}:${mm}`;
  }
  function fromLocalDT(s){
    // 安全に分解してローカルコンストラクタで生成（タイムゾーン補正しない）
    const [date, time] = String(s).split('T');
    const [yy, mm, dd] = (date || '').split('-').map(n => parseInt(n,10));
    const [HH, MM]     = (time || '00:00').split(':').map(n => parseInt(n,10));
    if (Number.isFinite(yy) && Number.isFinite(mm) && Number.isFinite(dd)) {
      return new Date(yy, (mm-1), dd, (Number.isFinite(HH)?HH:0), (Number.isFinite(MM)?MM:0), 0, 0);
    }
    // フォールバック
    return new Date(s);
  }
  function escapeHTML(s){ return String(s??'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])) }

// ------------- TODO取り込み（厳格アダプタ：誤検出を防ぐ） -------------
function readTodosAsEvents(rangeStart, rangeEnd){
  const OUT = [];

  // 1) postMessage で受け取ったキャッシュを優先（D_TODO_SYNC）
  if (Array.isArray(window.__D_TODO_CACHE)) {
    normalizeArray(window.__D_TODO_CACHE, OUT, rangeStart, rangeEnd, 'todo', '__D_TODO_CACHE');
  }

  // 2) localStorage の「明示ホワイトリスト」だけを見る
  const TODO_KEYS_WHITELIST = ['todosV1']; // 必要なら他の“明示的な TODO 保存キー”を追記
  const EXCLUDE_KEYS = new Set(['D_CAL_EVENTS_V1', 'D_CAL_SOURCE_FLAGS_V1']);

  TODO_KEYS_WHITELIST.forEach(k => {
    if (EXCLUDE_KEYS.has(k)) return;
    const val = safeParse(localStorage.getItem(k));
    if (Array.isArray(val)) {
      normalizeArray(val, OUT, rangeStart, rangeEnd, 'todo', k);
    } else if (val && typeof val === 'object') {
      Object.values(val).forEach(v => { if (Array.isArray(v)) normalizeArray(v, OUT, rangeStart, rangeEnd, 'todo', k); });
    }
  });

  return OUT;

  // ---- helpers ----
  function safeParse(s){ try{ return JSON.parse(s); }catch{ return null; } }

  function normalizeArray(arr, out, rs, re, source='todo', keyName=''){
    arr.forEach(item => {
      if (!maybeTodo(item, keyName)) return;

      // 完了フラグが明示的に true なら除外
      const done = truthy(item.completed || item.done || item.isDone || item.checked || item.完了);
      if (done === true) return;

      const title = firstNonEmpty(
        item.title, item.name, item.text, item.label, item.タイトル, item.件名, item.内容, item.todo
      ) || '（無題）';

      // E側キーに合わせた素直な項目名
      const sRaw = firstNonEmpty(item.start, item.startDate, item.from, item.開始, item.begin);
      const eRaw = firstNonEmpty(item.end,   item.endDate,   item.to,   item.終了, item.finish);
      const dRaw = firstNonEmpty(item.due,   item.deadline,  item.期限, item.limit, item.dueDate);

      let start = null, end = null;
      const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
      const toStartOfDay = (ymd) => new Date(+ymd.slice(0,4), +ymd.slice(5,7)-1, +ymd.slice(8,10), 0, 0, 0, 0);
      const toEndOfDay   = (ymd) => new Date(+ymd.slice(0,4), +ymd.slice(5,7)-1, +ymd.slice(8,10), 23,59, 0, 0);

      if (sRaw && dRaw) {
        start = isYmd(sRaw) ? toStartOfDay(sRaw) : parseMaybeDate(sRaw);
        const due = isYmd(dRaw) ? toEndOfDay(dRaw) : parseMaybeDate(dRaw);
        end = eRaw ? (parseMaybeDate(eRaw) || due) : due;
      } else {
        start = parseMaybeDate(sRaw);
        end   = parseMaybeDate(eRaw);
      }

      if (!start && !end && dRaw){
        const d = isYmd(dRaw) ? toStartOfDay(dRaw) : (parseMaybeDate(dRaw) || new Date());
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0, 0);
        end   = new Date(d.getFullYear(), d.getMonth(), d.getDate(),18, 0, 0, 0);
      }
      if (start && !end) end   = new Date(start.getTime() + 60*60*1000);
      if (!start && end) start = new Date(end.getTime()   - 60*60*1000);
      if (!start || !end) return;
      if (!(start <= re && end >= rs)) return;

      console.debug('[D_CAL readTodosAsEvents]', {from:keyName, title, start, end});

      out.push({
        id: String(item.id || item.key || item.uuid || hashKey(keyName, title, start, end, dRaw)),
        title: String(title),
        start, end, source
      });
    });
  }

  function maybeTodo(obj, keyName=''){
    if (!obj || typeof obj !== 'object') return false;

    // ❶ Dカレンダーのイベントっぽい形は除外（source:'local' など）
    if (obj.source === 'local' && obj.start && obj.end) return false;
    // ❷ 明らかにカレンダー・イベント配列（id/title/start/end のみ等）も弾く
    const k = Object.keys(obj);
    const looksCalendarEvent =
      k.includes('start') && k.includes('end') && k.includes('title') &&
      !k.some(x => ['due','dueDate','deadline','期限','limit','completed','done','isDone','checked','subtasks','memo','メモ'].includes(x));
    if (looksCalendarEvent) return false;

    // ❸ TODO らしさの判定を強める
    const hasTitle = ['title','name','text','label','タイトル','件名','内容','todo'].some(p => p in obj);
    const hasTodoish =
      ['due','dueDate','deadline','期限','limit','completed','done','isDone','checked','subtasks','メモ','memo'].some(p => p in obj);
    // キー名が todo 系（whitelist 経由）なら多少ゆるめでもOK
    const keyIsTodoish = /todo/i.test(keyName);

    return hasTitle && (hasTodoish || keyIsTodoish);
  }

  function firstNonEmpty(...vals){
    for (const v of vals) { if (v !== undefined && v !== null && String(v).trim() !== '') return v; }
    return null;
  }

  function parseMaybeDate(v){
    if (!v) return null;
    if (v instanceof Date) return v;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
      const [y,m,d] = String(v).split('-').map(n=>parseInt(n,10));
      return new Date(y, m-1, d, 0, 0, 0, 0);
    }
    const t = new Date(v);
    return isNaN(t.getTime()) ? null : t;
  }

  function truthy(v){
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase();
    return ['1','true','yes','y','on','済','完','done','checked'].some(x => s.includes(x));
  }

  function hashKey(keyName, title, s, e, due){
    const base = `${keyName}|${title}|${s?.toISOString()}|${e?.toISOString()}|${due||''}`;
    let h = 0; for (let i=0;i<base.length;i++){ h = ((h<<5)-h) + base.charCodeAt(i); h |= 0; }
    return `todo:${h}`;
  }
}


  // ------------- 描画 -------------
  function render(){
    saveJSON(KEY_FLAGS, {local:showLocal.checked, todo:showTodo.checked});
    if (view==='month') renderMonth();
    else if (view==='week') renderWeek();
    else renderYear();
  }

function renderMonth(){
  const gridStart = startOfWeek(startOfMonth(current));
  const weeks = 6; // 6週表示固定
  label.textContent = `${current.getFullYear()}年 ${current.getMonth()+1}月`;

  // ★ 当月範囲（当月外は灰色＆予定非表示にするためのクリップ用）
  const monthStart = new Date(current.getFullYear(), current.getMonth(), 1, 0,0,0,0);
  const monthEnd   = new Date(current.getFullYear(), current.getMonth()+1, 0, 23,59,59,999);

  // 予定を収集
  const todoEv  = showTodo.checked  ? readTodosAsEvents(gridStart, new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate()+weeks*7-1, 23,59,59,999)) : [];
  const localEv = showLocal.checked ? events.filter(ev => ev.start<=monthEnd && ev.end>=monthStart) : [];
  const all = [...localEv.map(e=>({...e,cls:'local'})), ...todoEv.map(e=>({...e,cls:'todo'}))];

  // 1) まず42セルを描画（当月外は .out 付与、セル内イベントは当月内のみ）
  const cellsHTML = [];
  for (let i=0;i<weeks*7;i++){
    const d = new Date(gridStart); d.setDate(d.getDate()+i);
    const inMonth = (d.getMonth()===current.getMonth());
    const today   = isSameLocalDate(d, new Date());
    let hName = ''; try { hName = holidayNameJP(d) || ''; } catch(_){}
    const dow = d.getDay();
    const cls = [
      (dow===6?'sat':''), (dow===0?'sun':''), (hName?'holiday':''), (today?'today':''), (!inMonth?'out':'')
    ].filter(Boolean).join(' ');

    // 単日イベントは当月内のみ表示
    const cellEv = inMonth ? all.filter(ev =>
      isSameLocalDate(ev.start,d) && isSameLocalDate(ev.end,d) && !ev.allDay
    ) : [];


    cellsHTML.push(`
      <div class="cell ${cls}" data-date="${d.toISOString()}" ${hName?`title="${hName}"`:''}>
        <div class="date" style="opacity:${inMonth?1:0.6}">${d.getDate()}</div>
        ${cellEv.map(ev =>
          `<div class="event ${ev.cls}" data-id="${ev.id}"
             title="${escapeHTML(ev.title)}\n${fmtRangeDateOnly ? fmtRangeDateOnly(ev.start,ev.end) : fmtRange(ev.start,ev.end)}">${escapeHTML(ev.title)}</div>`
        ).join('')}
      </div>
    `);
  }

  // DOM反映（バー用のオーバーレイを重ねる）
  mount.innerHTML = `
    <div class="month-head">${['月','火','水','木','金','土','日'].map(x=>`<div>${x}</div>`).join('')}</div>
    <div class="month-wrap">
      <div class="month-body">${cellsHTML.join('')}</div>
      <div class="month-bars"></div>
    </div>
  `;

  // 2) 横断バー（日跨ぎ）の描画（週・月の両方でクリップ）
  const barsHost = mount.querySelector('.month-bars');
  const weekLaneCounts = new Array(weeks).fill(0); // 各週の使用レーン数
  const subsMap = (typeof buildTodoSubsMap === 'function') ? buildTodoSubsMap() : new Map();

  for (let w=0; w<weeks; w++){
    const weekStart = new Date(gridStart); weekStart.setDate(weekStart.getDate()+w*7);
    const weekEnd   = new Date(weekStart); weekEnd.setDate(weekEnd.getDate()+6); weekEnd.setHours(23,59,59,999);

    // 当該週にかかる“日跨ぎのみ”をセグメント化（週＆月の両方でクリップ）
    const segs = [];
    all.forEach(ev=>{
      // 週とも月とも交差しなければ除外
      if (ev.start > weekEnd || ev.end < weekStart) return;
      if (ev.start > monthEnd || ev.end < monthStart) return;
      if (!ev.allDay && sameDay(ev.start, ev.end)) return; // 終日でない単日はセルに任せる

      const sClip = dayClamp(new Date(Math.max(ev.start, weekStart, monthStart)));
      const eClip = dayClamp(new Date(Math.min(ev.end,   weekEnd,   monthEnd)));
      if (sClip > eClip) return;

      const sIdx = Math.max(0, Math.floor((sClip - dayClamp(weekStart))/86400000));
      const eIdx = Math.min(6, Math.floor((eClip - dayClamp(weekStart))/86400000));
      segs.push({ id:ev.id, title:ev.title, cls:ev.cls, sIdx, eIdx, start:ev.start, end:ev.end });
    });

    // レーン割り当て（重ならないように上から詰める）
    const laneEnds = [];
    const placed = [];
    segs.sort((a,b)=> a.sIdx - b.sIdx || a.eIdx - b.eIdx);
    segs.forEach(seg=>{
      let lane = 0;
      while (lane < laneEnds.length && !(laneEnds[lane] < seg.sIdx)) lane++;
      if (lane >= laneEnds.length) laneEnds.push(-1);
      laneEnds[lane] = seg.eIdx;
      placed.push({ ...seg, lane });
    });

    // バーDOMを追加（gridの行=週、列=開始/終了、topでレーン段差）
    placed.forEach(seg=>{
      const el = document.createElement('div');
      el.className = `bar ${seg.cls}`;
      el.dataset.id = seg.id;

      // テキストは ::before で描くので中身を書かない
      // el.textContent = seg.title;

      // タイトルは日付のみの表記に（fmtRangeDateOnly が無ければ fmtRange にフォールバック）
      el.title = `${seg.title}\n${fmtRangeDateOnly ? fmtRangeDateOnly(seg.start, seg.end) : fmtRange(seg.start, seg.end)}`;
      el.style.gridRow = `${w+1} / ${w+2}`;
      el.style.gridColumn = `${seg.sIdx+1} / ${seg.eIdx+2}`;
      el.style.top = `calc(var(--laneH) * ${seg.lane})`;
      barsHost.appendChild(el);

      // ★ 親バー内にサブタスク帯を重ねる（行は増やさない）
      try {
        const subs = subsMap.get(String((seg.id || '').split('::')[0])) || [];
        if (subs.length){
          const spanDays = (seg.eIdx - seg.sIdx + 1);
          const track = document.createElement('div');
          track.className = 'subs';
          el.appendChild(track);

          subs.forEach(sub=>{
            // 今週＆当月にクリップしてから親バーに合わせる
            const s = dayClamp(new Date(Math.max(sub.start, weekStart, monthStart)));
            const e = dayClamp(new Date(Math.min(sub.end,   weekEnd,   monthEnd)));
            if (s > e) return;

            const idxOf = (d)=> Math.floor((dayClamp(d) - dayClamp(weekStart)) / 86400000);
            let subS = idxOf(s), subE = idxOf(e);
            subS = Math.max(subS, seg.sIdx);
            subE = Math.min(subE, seg.eIdx);
            if (subS > subE) return;

            const relLeftPct  = ((subS - seg.sIdx) / spanDays) * 100;
            const relWidthPct = ((subE - subS + 1) / spanDays) * 100;

            const ss = document.createElement('span');
            ss.className = 'subseg';
            ss.style.left  = relLeftPct + '%';
            ss.style.width = `calc(${relWidthPct}% - 4px)`;
            ss.title = `サブ: ${sub.title}`;
            track.appendChild(ss);
          });
        }
      } catch(_) {}
    });

    weekLaneCounts[w] = laneEnds.length;
  }

  // 3) 週ごとのレーン数を42セルへ反映（上余白を確保して被り防止）
  const cellEls = mount.querySelectorAll('.month-body .cell');
  for (let w=0; w<weeks; w++){
    const used = weekLaneCounts[w] || 0;
    for (let d=0; d<7; d++){
      const idx = w*7 + d;
      const cell = cellEls[idx];
      if (cell) cell.style.setProperty('--lanes', String(used));
    }
  }

  // クリック系ハンドラ
  mount.querySelectorAll('.cell').forEach(el=>{
    el.addEventListener('dblclick', () => openModalNew(new Date(el.dataset.date)));
  });
  mount.querySelectorAll('.event.local').forEach(el=>{
    el.addEventListener('click', () => openModalEdit(el.dataset.id));
  });
  mount.querySelectorAll('.month-bars .bar').forEach(el=>{
    el.addEventListener('click', () => openModalEdit(el.dataset.id));
  });

  // 補助
  function dayClamp(d){ const t=new Date(d); t.setHours(0,0,0,0); return t; }
}

function renderWeek(){
  const start = startOfWeek(current);
  const end   = new Date(start); end.setDate(end.getDate()+6); end.setHours(23,59,59,999);
  label.textContent = `${start.getFullYear()}年 ${start.getMonth()+1}/${start.getDate()}週`;

  const todoEv = showTodo.checked ? readTodosAsEvents(start, end) : [];
  const localEv= showLocal.checked? events.filter(ev => ev.start<=end && ev.end>=start) : [];
  const all = [...localEv.map(e=>({...e,cls:'local'})), ...todoEv.map(e=>({...e,cls:'todo'}))];

  // === 週ヘッダー（各日の見出し） ===
  const dowJP = ['日','月','火','水','木','金','土'];
  let head = `<div class="week-head"><div class="spacer"></div>`;
  for (let d = 0; d < 7; d++) {
    const day = new Date(start); day.setDate(day.getDate() + d); day.setHours(0,0,0,0);
    let hName = null; try { hName = holidayNameJP(day); } catch(_) {}
    const dow = day.getDay();
    const isToday = isSameLocalDate(day, new Date());

    // 👇 先に cls を作ってから today を付与する
    let cls = [
      (dow === 6 ? 'sat' : ''),
      (dow === 0 ? 'sun' : ''),
      (hName ? 'holiday' : '')
    ].filter(Boolean).join(' ');
    if (isToday) cls += ' today';

    const dateStr = `${day.getMonth() + 1}/${day.getDate()}`;
    const dowStr  = `${dowJP[dow]}${hName ? '・祝' : ''}`;

    head += `<div class="day ${cls}" ${hName ? `title="${hName}"` : ''}>
      <span class="date">${dateStr}</span><span class="dow">(${dowStr})</span>
    </div>`;
  }
  head += `</div>`;

  // === 「終日」横断バー（週をまたぐ/日付をまたぐ予定のみ） ===
  // 週内にかかっていて、かつ sameDay(start,end) ではないものを対象
  const segs = [];
  all.forEach(ev=>{
    // 終日指定 or 日付跨ぎ を終日欄へ
if (!(ev.allDay || !sameDay(ev.start, ev.end))) return; // ← 条件を反転させて早期 return

    if (!ev.allDay && sameDay(ev.start, ev.end)) return; // 終日でない単日 → 下の時間帯へ
    const sIdx = Math.max(0, Math.floor((clampDay(ev.start) - clampDay(start))/86400000));
    const eIdx = Math.min(6, Math.floor((clampDay(ev.end)   - clampDay(start))/86400000));
    segs.push({ id:ev.id, title:ev.title, cls:ev.cls, sIdx, eIdx, start:ev.start, end:ev.end });
  });
  // レーン割り当て（重なりを上から詰める）
  const laneEnds = [];
  const placedAL = [];
  segs.sort((a,b)=> a.sIdx - b.sIdx || a.eIdx - b.eIdx);
  segs.forEach(seg=>{
    let lane = 0;
    while (lane < laneEnds.length && !(laneEnds[lane] < seg.sIdx)) lane++;
    if (lane >= laneEnds.length) laneEnds.push(-1);
    laneEnds[lane] = seg.eIdx;
    placedAL.push({ ...seg, lane });
  });
  const alLaneCount = laneEnds.length;

  // === 時間帯グリッド（重なり幅計算つき） ===
  // 日付跨ぎではない予定を日別に集計し、カラム分割（衝突解決）
  const dayLayouts = Array.from({length:7}, ()=>({ list:[], layout:{} }));
  for(let d=0; d<7; d++){
    const dayStart = new Date(start); dayStart.setDate(dayStart.getDate()+d); dayStart.setHours(0,0,0,0);
    const dayEnd   = new Date(dayStart); dayEnd.setHours(23,59,59,999);
    // この日の時間帯にかかる“非・日付跨ぎ”予定
    const dayEvs = all
      .filter(ev => sameDay(ev.start, ev.end) && !ev.allDay) // 同日内かつ終日ではない
      .filter(ev => overlaps(ev.start, ev.end, dayStart, dayEnd))
      .map(ev => ({
        id: ev.id, title: ev.title, cls: ev.cls,
        // この日の範囲にクリップ（安全）
        start: new Date(Math.max(ev.start, dayStart)),
        end:   new Date(Math.min(ev.end,   dayEnd))
      }))
      .sort((a,b)=> a.start - b.start || a.end - b.end);

    // 衝突解決：最小カラム割当
    const colsEnd = [];               // 各カラムの現在の終端
    const layoutMap = {};             // id -> {col, cols}
    dayEvs.forEach(ev=>{
      let col = 0;
      while (col < colsEnd.length && !(colsEnd[col] <= ev.start)) col++;
      if (col >= colsEnd.length) colsEnd.push(new Date(0));
      colsEnd[col] = ev.end;
      layoutMap[ev.id] = { col, cols: null };  // cols は後で確定
    });
    const totalCols = colsEnd.length || 1;
    Object.keys(layoutMap).forEach(id => layoutMap[id].cols = totalCols);

    dayLayouts[d] = { list: dayEvs, layout: layoutMap };
  }

  // === ボディ：時間×7日のグリッド ===
  let body = `<div class="week">`;
  for (let h = 0; h < 24; h++) {
    body += `<div class="time">${String(h).padStart(2, '0')}:00</div>`;
    for (let d = 0; d < 7; d++) {
      const day = new Date(start); day.setDate(day.getDate() + d); day.setHours(0,0,0,0);
      const slotStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 0);
      // const slotEnd   = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h + 1, 0); // ← もう使わない

      const list = dayLayouts[d].list;
      const lay  = dayLayouts[d].layout;

      // ★ この時間に“開始”した予定だけを描画（= 1予定1ラベル）
      const starters = list.filter(ev => {
        const sh = ev.start.getHours();
        return sh === h; // その日の h 時台に開始
      });

      const isTodayCol = isSameLocalDate(day, new Date());
      body += `<div class="slot ${isTodayCol ? 'today' : ''}" data-date="${day.toISOString()}" data-hour="${h}">` +

        starters.map(ev => {
          // ここで base は“開始した時間”の0分（= slotStart）なので topPct は 0〜100 の間
          const base = slotStart;
          const topPct = Math.max(0, (ev.start - base) / 3600000) * 100; // 分単位の開始位置
          const durHr  = Math.max(0.25, (ev.end - ev.start) / 3600000); // 全長（1h超なら100%を超えてOK）
          const height = durHr * 100;

          const { col, cols } = lay[ev.id] || { col: 0, cols: 1 };
          const leftPct  = (100 / cols) * col;
          const widthPct = (100 / cols);

          return `<div class="block ${ev.cls}" data-id="${ev.id}"
                    style="top:${topPct}%;height:${height}%;left:${leftPct}%;width:calc(${widthPct}% - 6px);right:auto;position:absolute;"
                    title="${escapeHTML(ev.title)}\n${fmtRange(ev.start, ev.end)}">${escapeHTML(ev.title)}</div>`;
        }).join('') +
      `</div>`;
    }
  }
  body += `</div>`;

  // === 終日バーDOM ===
  let allday = `<div class="week-allday" style="--alLanes:${alLaneCount}">` +
                 `<div class="label">終日</div>` +
                 `<div class="tracks"><div class="grid">`;
placedAL.forEach(seg=>{
  allday += `<div class="bar ${seg.cls}" data-id="${seg.id}"
    style="grid-column:${seg.sIdx+1} / ${seg.eIdx+2};
           top: calc((var(--alLaneH) + var(--alLaneGap)) * ${seg.lane});"
    title="${escapeHTML(seg.title)}\n${fmtRangeDateOnly(seg.start,seg.end)}"></div>`;
});
  allday += `</div></div></div>`;

  // === まとめて描画（ヘッダ → 終日 → ボディ） ===
  mount.innerHTML = head + allday + body;

  // ★ 週終日バーにサブ帯を重ねる
  try {
    const allDayBars = mount.querySelectorAll('.week-allday .bar');
    const weekStart = start;  // renderWeek() 冒頭の start（週頭）
    const weekEnd   = new Date(weekStart); weekEnd.setDate(weekEnd.getDate()+6); weekEnd.setHours(23,59,59,999);

    const subsMapW = buildTodoSubsMap();

    allDayBars.forEach(el=>{
      const pid = String((el.dataset.id || '').split('::')[0] || el.dataset.id || '');
      const subs = subsMapW.get(pid) || [];
      if (!subs.length) return;

      const colStart = parseInt(el.style.gridColumn.split('/')[0], 10) - 1; // 0..6
      const colEnd   = parseInt(el.style.gridColumn.split('/')[1], 10) - 2; // 0..6
      const spanDays = (colEnd - colStart + 1);

      const track = document.createElement('div');
      track.className = 'subs';
      el.appendChild(track);

      subs.forEach(sub=>{
        const s = new Date(Math.max(sub.start, weekStart));
        const e = new Date(Math.min(sub.end,   weekEnd));
        if (s > e) return;
        const idxOf = (d)=> Math.floor((new Date(d.getFullYear(),d.getMonth(),d.getDate()) - new Date(weekStart.getFullYear(),weekStart.getMonth(),weekStart.getDate())) / 86400000);
        let subS = idxOf(s), subE = idxOf(e);
        subS = Math.max(subS, colStart);
        subE = Math.min(subE, colEnd);
        if (subS > subE) return;

        const relLeftPct = ((subS - colStart) / spanDays) * 100;
        const relWidthPct= ((subE - subS + 1) / spanDays) * 100;

        const ss = document.createElement('span');
        ss.className = 'subseg';
        ss.style.left  = relLeftPct + '%';
        ss.style.width = `calc(${relWidthPct}% - 4px)`;
        ss.title = `サブ: ${sub.title}`;
        track.appendChild(ss);
      });
    });
  } catch(_) {}

  // イベント操作（新規/編集）
  mount.querySelectorAll('.slot').forEach(el=>{
    el.addEventListener('dblclick', () => {
      const day = new Date(el.dataset.date);
      const hour = +el.dataset.hour || 0;
      day.setHours(hour,0,0,0);
      openModalNew(day);
    });
  });
  // 編集
  mount.querySelectorAll('.week-allday .bar, .week .block.local').forEach(el=>{
    el.addEventListener('click', () => openModalEdit(el.dataset.id));
  });

  // 補助
  function clampDay(d){ const t=new Date(d); t.setHours(0,0,0,0); return t; }
}

  // 「＋ 予定を追加」→ 今表示中の基準日時で新規モーダルを開く
  addBtn.addEventListener('click', () => {
    // 月ビューなら月初の9:00、週ビューなら現在週の9:00、年ビューなら今日の9:00 などお好みで
    const seed = new Date(current);
    seed.setHours(9,0,0,0);
    openModalNew(seed);
  });

  // d: Date（その日の0:00/23:59はこの中で取ります）
  // 年カレンダーのパッチ判定（その日: 00:00–23:59）
  function hasTodoOnDay(d){
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0);
    const dayEnd   = new Date(d.getFullYear(), d.getMonth(), d.getDate(),23,59,59,999);

    let todos = [];
    try { todos = JSON.parse(localStorage.getItem('todosV1')||'[]') || []; } catch {}
    if (!Array.isArray(todos)) return false;

    const toDate = (v, end=false)=>{
      if(!v) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))){
        const [y,m,da] = v.split('-').map(n=>+n);
        return new Date(y, m-1, da, end?23:0, end?59:0, end?59:0, end?999:0);
      }
      const t = new Date(v);
      return isNaN(t) ? null : t;
    };

    for (const t of todos){
      // ✅ 親が完了ならパッチ対象外
      if (t && (t.done === true)) continue;

      const s = toDate(t?.startDate, false);
      const e = toDate(t?.dueDate  , true);   // 期日は日末まで含める

      // 親期間がその日にかかっている？
      if (s && e && s <= dayEnd && e >= dayStart) return true;
      if (!s && e && (e >= dayStart && e <= dayEnd)) return true;
      if (s && !e && (s >= dayStart && s <= dayEnd)) return true;

      // サブタスク（未完のみカウント）
      if (Array.isArray(t?.subtasks)){
        for (const sb of t.subtasks){
          if (!sb || sb.done === true) continue;
          const ss = toDate(sb.startDate, false);
          const ee = toDate(sb.dueDate  , true);
          if (ss && ee && ss <= dayEnd && ee >= dayStart) return true;
          if (!ss && ee && (ee >= dayStart && ee <= dayEnd)) return true;
          if (ss && !ee && (ss >= dayStart && ss <= dayEnd)) return true;
        }
      }
    }
    return false;
  }

// Dカレンダー（ローカル予定）がその日に1件でもあるか
function hasLocalOnDay(day) {
  const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0,0,0,0);
  const e = new Date(day.getFullYear(), day.getMonth(), day.getDate(),23,59,59,999);

  // 1) まずメモリの events（存在＆非空なら）
  let arr = (typeof events !== 'undefined' && Array.isArray(events) && events.length) ? events : null;

  // 2) 無ければストレージ直読（Dカレンダーの保存先）
  if (!arr) {
    try { arr = JSON.parse(localStorage.getItem('D_CAL_EVENTS_V1') || '[]') || []; }
    catch (_) { arr = []; }
  }

  for (const ev of arr) {
    const st = (ev.start instanceof Date) ? ev.start : new Date(ev.start);
    const en = (ev.end   instanceof Date) ? ev.end   : new Date(ev.end);
    if (!isNaN(st) && !isNaN(en) && st <= e && en >= s) return true;
  }
  return false;
}

// TODO（未完のみ）がその日に1件でもあるか
function hasTodoOnDay(day) {
  const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0,0,0,0);
  const e = new Date(day.getFullYear(), day.getMonth(), day.getDate(),23,59,59,999);

  if (!(showTodo?.checked)) return false;

  // readTodosAsEvents は “完了済みを除外” してイベント化している前提
  try {
    const evs = readTodosAsEvents(s, e);
    return Array.isArray(evs) && evs.length > 0;
  } catch {
    // フォールバック直読（安全側）
    try {
      const list = JSON.parse(localStorage.getItem('todosV1') || '[]') || [];
      return list.some(t => {
        if (t && (t.done === true)) return false;               // 完了は除外
        const st = t.startDate ? new Date(t.startDate) : null;
        const du = t.dueDate   ? new Date(t.dueDate)   : null;
        // 期間がある：日跨ぎ含め交差判定
        if (st && du) return st <= e && du >= s;
        // 期日だけ：その日にヒット
        if (!st && du) return du >= s && du <= e;
        // 開始だけ：その日を含むように扱うならここを true に
        return false;
      });
    } catch { return false; }
  }
}



function hasTodoOnDay(day) {
  const s = new Date(day); s.setHours(0,0,0,0);
  const e = new Date(day); e.setHours(23,59,59,999);

  let todos = [];
  try { todos = JSON.parse(localStorage.getItem('todosV1')||'[]') || []; } catch {}

  const isYmd = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
  const toStart = ymd => new Date(+ymd.slice(0,4), +ymd.slice(5,7)-1, +ymd.slice(8,10), 0,0,0,0);
  const toEnd   = ymd => new Date(+ymd.slice(0,4), +ymd.slice(5,7)-1, +ymd.slice(8,10),23,59,59,999);

  // 「完了」は除外。サブがあればサブを優先。サブが無い親だけの場合のみ親の期間で判定。
  for (const t of todos) {
    if (t?.done === true) continue;

    const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
    let hit = false;

    if (subs.length > 0) {
      // サブのどれかが “その日と交差” していれば点
      for (const sb of subs) {
        if (sb?.done === true) continue;
        const ss = sb.startDate ? (isYmd(sb.startDate) ? toStart(sb.startDate) : new Date(sb.startDate)) : null;
        const ee = sb.dueDate   ? (isYmd(sb.dueDate)   ? toEnd  (sb.dueDate)   : new Date(sb.dueDate))   : null;

        // 片側のみの時は “その日1時間” の擬似区間に寄せる（年カレンダーの点用途なので十分）
        let a = ss, b = ee;
        if (a && !b) b = new Date(a.getTime() + 60*60*1000);
        if (!a && b) a = new Date(b.getTime() - 60*60*1000);
        if (!a || !b) continue;

        if (a <= e && b >= s) { hit = true; break; }
      }
      if (hit) return true;
      // サブがある時は、親の広い期間では“点を付けない”（サブで粒度を出す）
      continue;
    }

    // サブが無い親：親の start/due で判定（dueのみ／startのみも軽く補完）
    const s1 = t.startDate ? (isYmd(t.startDate) ? toStart(t.startDate) : new Date(t.startDate)) : null;
    const e1 = t.dueDate   ? (isYmd(t.dueDate)   ? toEnd  (t.dueDate)   : new Date(t.dueDate))   : null;

    let a = s1, b = e1;
    if (a && !b) b = new Date(a.getTime() + 60*60*1000);
    if (!a && b) a = new Date(b.getTime() - 60*60*1000);
    if (!a || !b) continue;

    if (a <= e && b >= s) return true;
  }
  return false;
}


function renderYear(){
  label.textContent = `${current.getFullYear()}年`;
  let html = `<div class="year">`;

  // ★ 曜日ヘッダー（月曜始まり）
  const dowHTML = `
    <div class="m-dow">
      <div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div><div>日</div>
    </div>
  `;

  for(let m=0; m<12; m++){
    const first = new Date(current.getFullYear(), m, 1);
    const start = startOfWeek(first); 

    const days = [];
    for(let i=0;i<42;i++){
      const d = new Date(start); d.setDate(d.getDate()+i);
      const inMonth = (d.getMonth() === m);         
      const dow = d.getDay();

      let hName = ''; try { hName = holidayNameJP(d) || ''; } catch(_) {}

      const cls = [
        (dow===6 ? 'sat' : ''),
        (dow===0 ? 'sun' : ''),
        (hName   ? 'holiday' : ''),
        (ymdLocal(d) === ymdLocal(new Date()) ? 'today' : ''),
        (!inMonth ? 'out' : '')                 
      ].filter(Boolean).join(' ');

      let dotHTML = '';
      if (inMonth){
        const hasLocal = (showLocal?.checked) && hasLocalOnDay(d); 
        const hasTodo  = (showTodo?.checked)  && hasTodoOnDay(d);  

        if (hasLocal || hasTodo){
          const pieces = [];
          if (hasLocal) pieces.push(`<span class="dot dot-local" title="カレンダー予定あり"></span>`);
          if (hasTodo)  pieces.push(`<span class="dot dot-todo"  title="TODO予定あり"></span>`);
          dotHTML = `<div class="dots">${pieces.join('')}</div>`;
        }
      }

      // ★ 日付の数字を埋め込む
      days.push(
        `<div class="${cls}" ${hName ? `title="${hName}"` : ''}>
           <span class="d-num">${d.getDate()}</span>
           ${dotHTML}
         </div>`
      );
    }

    html += `
      <div class="mini">
        <div class="mh">${m+1}月</div>
        ${dowHTML}
        <div class="mb">${days.join('')}</div>
      </div>`;
  }

  html += `</div>`;
  mount.innerHTML = html;
}

  function collectForDay(d){
    const s = new Date(d); s.setHours(0,0,0,0);
    const e = new Date(d); e.setHours(23,59,59,999);
    const todoEv = showTodo.checked ? readTodosAsEvents(s, e) : [];
    const localEv= showLocal.checked? events.filter(ev => ev.start<=e && ev.end>=s) : [];
    return [...localEv.map(e=>({ ...e, source:'local'})), ...todoEv];
  }

  // ------------- モーダル -------------
  function openModalNew(seed){
    dlg.showModal();
    form.reset();
    form.id.value = '';
    document.getElementById('dlgTitle').textContent = '予定を追加';
    delBtn.style.display = 'none';

    const start = seed ? new Date(seed) : new Date();
    const end = new Date(start.getTime() + 60*60*1000);
    form.start.value = toLocalDT(start);
    form.end.value   = toLocalDT(end);

    // ← これを安全に
    if (allDayChk) allDayChk.checked = false;
  }

  function openModalEdit(id){
    const ev = events.find(x=>x.id===id);
    if (!ev) return;
    dlg.showModal();
    form.reset();
    form.id.value = ev.id;
    form.title.value = ev.title || '';
    form.start.value = toLocalDT(ev.start);
    form.end.value   = toLocalDT(ev.end);
    form.note.value  = ev.note || '';
    document.getElementById('dlgTitle').textContent = '予定を編集';
    delBtn.style.display = 'inline-block';

    // ← これも安全に
    if (allDayChk) allDayChk.checked = !!ev.allDay;
  }

    // ★ ここに追記（openModalEditの直後）
    window.addEventListener('message', (ev)=>{
      const data = ev.data || {};
      if (data.type === 'D_CAL_OPEN_EDIT' && data.id){
        try { openModalEdit(String(data.id)); } catch(_) {}
      }
      if (data.type === 'D_CAL_GOTO_DATE' && data.ymd){
        const [yy,mm,dd] = String(data.ymd).split('-').map(n=>parseInt(n,10));
        if (Number.isFinite(yy) && Number.isFinite(mm) && Number.isFinite(dd)){
          current = new Date(yy, mm-1, dd, 0,0,0,0);
          render();
        }
      }
    });

  form.addEventListener('close', ()=>{ /* noop */ });
  form.addEventListener('submit', (e)=> e.preventDefault());
form.addEventListener('click', (e)=>{
  // ★ 追加：必ず押下された button を特定
  const btn = e.target.closest('button');
  if (!btn) return;
  const v = btn.value;

  if (v==='cancel'){ dlg.close(); return; }
  if (v==='delete'){
    const id = form.id.value;
    if (id){ events = events.filter(ev=>ev.id!==id); saveJSON(KEY_EVENTS, events); render(); }
    dlg.close(); return;
  }
if (v === 'ok') {
  // クリック元ボタン（子要素クリックでもOK）
  const btn = e.target.closest('button');
  if (!btn) return;

  const id    = form.id.value || uid();
  const title = (form.title.value || '').trim() || '無題';
  const note  = (form.note.value  || '').trim();

  // ローカル日時入力 -> Date
  const fromLocalDT = (s)=>{
    const [date,time=''] = String(s||'').split('T');
    const m = date && date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return new Date(NaN);
    const [_,yy,mm,dd] = m;
    if (!time) return new Date(+yy, +mm-1, +dd, 0,0,0,0);
    const [HH='00',MM='00'] = time.split(':');
    return new Date(+yy, +mm-1, +dd, +HH, +MM, 0, 0);
  };

  let startDt = fromLocalDT(form.start.value);
  let endDt   = fromLocalDT(form.end.value);

  // 「終日」チェック対応
  const allDayChk = document.getElementById('allDay');
  const isAllDay  = !!(allDayChk && allDayChk.checked);

  if (isAllDay) {
    const pickDate = (s)=>{
      const [date] = String(s||'').split('T');
      const m = date && date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return new Date(); // 未入力は今日
      return new Date(+m[1], +m[2]-1, +m[3], 0,0,0,0);
    };
    const sd = form.start.value ? pickDate(form.start.value) : new Date();
    const ed = form.end.value   ? pickDate(form.end.value)   : sd;

    startDt = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate(), 0,0,0,0);
    endDt   = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), 23,59,59,999);
  }

  // 妥当性チェック
  if (!(startDt instanceof Date) || isNaN(startDt)) { alert('開始日時が正しくありません。'); return; }
  if (!(endDt   instanceof Date) || isNaN(endDt))   { alert('終了日時が正しくありません。'); return; }
  if (!(startDt < endDt)) { alert('終了は開始より後にしてください。'); return; }

  // 保存
  const payload = { id, source:'local', title, start:startDt, end:endDt, note, allDay:isAllDay };
  const i = events.findIndex(x => x.id === id);
  if (i >= 0) events[i] = payload; else events.push(payload);
  saveJSON(KEY_EVENTS, events);

  dlg.close();
  render();
}


});



  // ------------- ナビ / 切替 -------------
  document.getElementById('prevBtn').addEventListener('click', ()=>{
    if (view==='year'){ current.setFullYear(current.getFullYear()-1); }
    else if (view==='month'){ current.setMonth(current.getMonth()-1); }
    else { current.setDate(current.getDate()-7); }
    render();
  });
  document.getElementById('todayBtn').addEventListener('click', ()=>{ current = new Date(); render(); });
  document.getElementById('nextBtn').addEventListener('click', ()=>{
    if (view==='year'){ current.setFullYear(current.getFullYear()+1); }
    else if (view==='month'){ current.setMonth(current.getMonth()+1); }
    else { current.setDate(current.getDate()+7); }
    render();
  });
  viewBtns.forEach(b=>{
    b.addEventListener('click', ()=>{
      viewBtns.forEach(x=>x.setAttribute('aria-pressed','false'));
      b.setAttribute('aria-pressed','true');
      view = b.dataset.view; render();
    });
  });
  showLocal.addEventListener('change', render);
  showTodo.addEventListener('change', render);

  // ------------- TODOの変更を監視（Eで更新→Dに反映） -------------
  window.addEventListener('storage', (ev)=>{
    if (ev.key === TODO_KEY) render();
  });

  // 初回描画
  render();
})();

 try { window.parent.postMessage({ type:'D_CAL_READY' }, '*'); } catch {}

 

