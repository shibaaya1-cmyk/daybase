(function(){
  // ===== State =====
  var routeMode = (localStorage.getItem('mm_route_mode') || 'bezier'); // 'bezier' or 'ortho'
  var nodes = new Map();           // id -> {id,x,y,w,h,text,color,parentIds:Set,childIds:Set}
  var edges = [];                  // {id, from,to}
  var selectedIds = new Set();
  var selectedEdgeIds = new Set(); // ★エッジ選択
  var lastSelectedId = null;
  var scale = 1, tx = 0, ty = 0;   // viewport pan/zoom
  var dragging = null;              // {ids:[...], offsets:Map(id=>{dx,dy})}
  var drawingEdge = null;           // ★ {fromId, pathEl}
  var panning = null;              // {startX,startY, tx0, ty0}
  var selecting = null;            // {sx,sy}
  var connectMode = { active:false, from:null };
  var editingId = null, isComposing = false;
  var swallowKey = null;           // 直前のキーをグローバルで無効化
  var history = { stack: [], redo: [], max: 80, mute: false };
 var currentName = ''; // ★ 現在編集中の保存名（上書き対象）


  var els = {
    nodes: document.getElementById('nodes'),
    edges: document.getElementById('edges'),
    viewport: document.getElementById('viewport'),
    svg: document.getElementById('svgRoot'),
    stageWrap: document.getElementById('stageWrap'),
    exportCanvas: document.getElementById('exportCanvas'),
    mini: document.getElementById('mini'),
    autosaveBadge: document.getElementById('autosaveBadge'),
    selRect: document.getElementById('selRect'),
    infoBtn: document.getElementById('infoBtn'),
    infoPanel: document.getElementById('infoPanel')
  };

  // ===== Utils =====
  function uid(){ return 'n'+Math.random().toString(36).slice(2,9); }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function setToArray(s){ var arr=[]; s.forEach(function(v){arr.push(v);}); return arr; }
  function setCaretToEnd(el){
    try{
      var range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false); // 末尾へ
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }catch(_){}
  }

  // ---- Nodes/IDs の互換ヘルパー（将来の実装変更に強く）----
  function NODES_GET(id){ return nodes.get(id); }
  function FIRST_PARENT_ID(n){ if(!n) return null; if(n.parentIds && n.parentIds.size){ for (const v of n.parentIds) return v; } return null; }
  function CHILDREN_ARRAY(n){ if(!n || !n.childIds) return []; return Array.from(n.childIds); }
  function SELECTED_ONE_ID(){ if(!selectedIds || !selectedIds.size) return null; for (const v of selectedIds) return v; }

  function applyViewport(){
    els.viewport.setAttribute('transform', 'translate(' + tx + ',' + ty + ') scale(' + scale + ')');
    updateMinimap();
    var zr = document.getElementById('zoomReset');
    if (zr) zr.textContent = Math.round(scale*100)+'%';
  }
  function stageToWorld(cx, cy){
    var pt = els.svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    var m = els.viewport.getScreenCTM(); var inv = m.inverse();
    var p = pt.matrixTransform(inv);
    return {x:p.x, y:p.y};
  }

  // a: ノード, bOrPoint: ノード or {x,y}（仮想ポイント）
  // routeMode: 'bezier' | 'ortho'（グローバル）
  function connectorPath(a, bOrPoint){
    var ax = a.x + a.w/2, ay = a.y + a.h/2;
    var bx, by, bw=0, bh=0, isPoint=false;
    if (typeof bOrPoint.x === 'number' && typeof bOrPoint.y === 'number' && bOrPoint.w == null){
      isPoint = true; bx = bOrPoint.x; by = bOrPoint.y;
    }else{
      bx = bOrPoint.x + bOrPoint.w/2;
      by = bOrPoint.y + bOrPoint.h/2;
      bw = bOrPoint.w||0; bh = bOrPoint.h||0;
    }

    var dx = bx - ax, dy = by - ay;
    var horizontal = Math.abs(dx) >= Math.abs(dy);

    // 出発点／到達点（矩形の辺上の接点）
    var sx, sy, tx, ty;
    if (horizontal){
      sx = (dx>=0) ? (a.x + a.w) : a.x;
      sy = a.y + a.h/2;
      if (isPoint){ tx = bx; ty = by; }
      else{ tx = (dx>=0) ? bOrPoint.x : (bOrPoint.x + bOrPoint.w); ty = bOrPoint.y + bOrPoint.h/2; }
    }else{
      sx = a.x + a.w/2;
      sy = (dy>=0) ? (a.y + a.h) : a.y;
      if (isPoint){ tx = bx; ty = by; }
      else{ tx = bOrPoint.x + bOrPoint.w/2; ty = (dy>=0) ? bOrPoint.y : (bOrPoint.y + bOrPoint.h); }
    }

    if (routeMode === 'bezier'){
      // 既存の滑らかパス
      if (horizontal){
        var c1x = sx + dx*0.5, c1y = sy;
        var c2x = tx - dx*0.5, c2y = ty;
        return 'M '+sx+' '+sy+' C '+c1x+' '+c1y+', '+c2x+' '+c2y+', '+tx+' '+ty;
      }else{
        var c1x = sx, c1y = sy + dy*0.5;
        var c2x = tx, c2y = ty - dy*0.5;
        return 'M '+sx+' '+sy+' C '+c1x+' '+c1y+', '+c2x+' '+c2y+', '+tx+' '+ty;
      }
    }

    // 直交ルーティング（L字／コの字、角は少し丸める）
    var r = 10; // 角の丸め半径
    // 経由点を作る（最短マンハッタン。基本はL字、遮蔽物ロジックは簡易）
    var pts = [{x:sx,y:sy}];

    if (horizontal){
      // 横優位：まず中間Xまで行き、そこから縦に折れて到着
      var midX = sx + Math.sign(dx) * Math.max(20, Math.min(Math.abs(dx)*0.5, 60));
      pts.push({x: midX, y: sy});
      pts.push({x: midX, y: ty});
    }else{
      // 縦優位
      var midY = sy + Math.sign(dy) * Math.max(20, Math.min(Math.abs(dy)*0.5, 60));
      pts.push({x: sx, y: midY});
      pts.push({x: tx, y: midY});
    }
    pts.push({x: tx, y: ty});

    // 角をQで丸めるパスに変換
    function roundedPath(points, radius){
      if (points.length < 2){
        var p = points[0]; return 'M '+p.x+' '+p.y;
      }
      var d = 'M '+points[0].x+' '+points[0].y;
      for (var i=1;i<points.length-1;i++){
        var p0 = points[i-1], p1 = points[i], p2 = points[i+1];
        var v1x = p1.x - p0.x, v1y = p1.y - p0.y;
        var v2x = p2.x - p1.x, v2y = p2.y - p1.y;
        // v1, v2 は直交のはず。手前/先の頂点を radius だけ削る
        var len1 = Math.max(Math.abs(v1x)+Math.abs(v1y), 1);
        var len2 = Math.max(Math.abs(v2x)+Math.abs(v2y), 1);
        var pA = { x: p1.x - Math.sign(v1x||v1y)*radius*(v1x?1:0), y: p1.y - Math.sign(v1y||v1x)*radius*(v1y?1:0) };
        var pB = { x: p1.x + Math.sign(v2x||v2y)*radius*(v2x?1:0), y: p1.y + Math.sign(v2y||v2x)*radius*(v2y?1:0) };
        // 直線でpAまで
        d += ' L '+pA.x+' '+pA.y;
        // pA→pB を二次ベジェで丸める（制御点は交点 p1）
        d += ' Q '+p1.x+' '+p1.y+', '+pB.x+' '+pB.y;
      }
      // 最後の直線
      var last = points[points.length-1];
      d += ' L '+last.x+' '+last.y;
      return d;
    }

    return roundedPath(pts, r);
  }


  // === 新規子ノードの初期配置（親の“逆側”へ） ===
  function initialChildPositionOpposite(baseNode){
    var NEW_W = 140, NEW_H = 40;
    var GAP   = 120;   // 親⇔子の基本距離（整列の gapX と同じくらい）
    var PAD   = 12;    // ずらし用の間隔

    // 親がいなければデフォルト（右側）
    var pId = FIRST_PARENT_ID(baseNode);
    if(!pId){
      return {
        x: Math.round(baseNode.x + baseNode.w + GAP),
        y: Math.round(baseNode.y + (baseNode.h - NEW_H)/2),
        w: NEW_W, h: NEW_H
      };
    }
    var parent = NODES_GET(pId);
    if(!parent){
      return {
        x: Math.round(baseNode.x + baseNode.w + GAP),
        y: Math.round(baseNode.y + (baseNode.h - NEW_H)/2),
        w: NEW_W, h: NEW_H
      };
    }

    // 親→基準ノードのベクトル（どの軸が優位か）
    var bx = baseNode.x + baseNode.w/2, by = baseNode.y + baseNode.h/2;
    var px = parent.x   + parent.w/2,   py = parent.y   + parent.h/2;
    var dx = bx - px, dy = by - py;
    var horizontal = Math.abs(dx) >= Math.abs(dy);

    // 既存の子を調べて、同じ側に置くときはずらして重なり回避
    var sameSideCount = 0;
    var ch = [];
    CHILDREN_ARRAY(baseNode).forEach(function(cid){ var n=NODES_GET(cid); if(n) ch.push(n); });

    var x, y;
    if(horizontal){
      // 親が左（dx>0）= 逆側は右、親が右（dx<0）= 逆側は左
      if(dx>0){
        sameSideCount = ch.filter(function(n){ return (n.x + n.w/2) >= bx; }).length;
        x = Math.round(baseNode.x + baseNode.w + GAP);
        y = Math.round(by - NEW_H/2 + sameSideCount * (NEW_H + PAD));
      }else{
        sameSideCount = ch.filter(function(n){ return (n.x + n.w/2) < bx; }).length;
        x = Math.round(baseNode.x - GAP - NEW_W);
        y = Math.round(by - NEW_H/2 + sameSideCount * (NEW_H + PAD));
      }
    }else{
      // 親が上（dy>0）= 逆側は下、親が下（dy<0）= 逆側は上
      if(dy>0){
        sameSideCount = ch.filter(function(n){ return (n.y + n.h/2) >= by; }).length;
        x = Math.round(bx - NEW_W/2 + sameSideCount * (NEW_W + PAD));
        y = Math.round(baseNode.y + baseNode.h + GAP);
      }else{
        sameSideCount = ch.filter(function(n){ return (n.y + n.h/2) < by; }).length;
        x = Math.round(bx - NEW_W/2 + sameSideCount * (NEW_W + PAD));
        y = Math.round(baseNode.y - GAP - NEW_H);
      }
    }
    return { x:x, y:y, w:NEW_W, h:NEW_H };
  }

  // 接続している相手のみ対象。基本: 兄弟 > 親 > 子。親が軸に近い/近距離なら親を優先。
  function pickDirectionalNeighborConnected(currentId, dir){
    var me = nodes.get(currentId); if(!me) return null;
    var cx = me.x + me.w/2, cy = me.y + me.h/2;

    // 候補収集
    var parents = [];
    me.parentIds && me.parentIds.forEach(function(pid){
      var pn = nodes.get(pid); if(pn) parents.push(pn);
    });

    var children = [];
    me.childIds && me.childIds.forEach(function(cid){
      var cn = nodes.get(cid); if(cn) children.push(cn);
    });

    var siblings = [];
    if (me.parentIds && me.parentIds.size){
      var pid = setToArray(me.parentIds)[0];
      var p = nodes.get(pid);
      if (p){
        p.childIds.forEach(function(cid){
          if (cid!==currentId){ var n = nodes.get(cid); if(n) siblings.push(n); }
        });
      }
    }

    var H = (dir==='left'||dir==='right');
    var axisSign = (dir==='right'||dir==='down') ? 1 : -1;

    var eps = 1;
    function signOK(n){
      var nx = n.x + n.w/2, ny = n.y + n.h/2;
      var dx = nx - cx, dy = ny - cy;
      return H ? (axisSign>0 ? (dx > eps) : (dx < -eps))
               : (axisSign>0 ? (dy > eps) : (dy < -eps));
    }
    function angleScore(n){
      var nx = n.x + n.w/2, ny = n.y + n.h/2;
      var dx = Math.abs(nx - cx), dy = Math.abs(ny - cy);
      var axial = H ? dx : dy, cross = H ? dy : dx;
      if (axial < 1) axial = 1;
      return cross / axial; // 小さいほど軸に沿う
    }
    function dist(n){
      var nx = n.x + n.w/2, ny = n.y + n.h/2;
      return Math.hypot(nx - cx, ny - cy);
    }
    function bestOf(arr){
      if(!arr.length) return null;
      return arr.slice().sort(function(a,b){
        var aa=angleScore(a), ab=angleScore(b);
        if (aa!==ab) return aa - ab;
        var da=dist(a), db=dist(b);
        return da - db;
      })[0];
    }

    var sibDir = siblings.filter(signOK);
    var parDir = parents .filter(signOK);
    var chiDir = children.filter(signOK);

    var bestSib = bestOf(sibDir);
    var bestPar = bestOf(parDir);

    // 親優先の条件（兄弟より十分まっすぐ or 近い）
    var ANGLE_GAIN = 0.85;
    var DIST_GAIN  = 0.85;

    if (bestSib && bestPar){
      var aS = angleScore(bestSib), aP = angleScore(bestPar);
      var dS = dist(bestSib),      dP = dist(bestPar);
      var preferParent = (aP <= aS * ANGLE_GAIN) || (dP <= dS * DIST_GAIN);
      return (preferParent ? bestPar.id : bestSib.id);
    }

    if (bestSib) return bestSib.id;
    if (bestPar) return bestPar.id;

    var bestChi = bestOf(chiDir);
    return bestChi ? bestChi.id : null;
  }

  // ===== Node CRUD =====
  function renderNode(n){
    var g = document.getElementById('node-'+n.id);
    if(!g){
      g = document.createElementNS('http://www.w3.org/2000/svg','g');
      g.classList.add('node'); g.id = 'node-'+n.id;
      g.innerHTML =
        '<rect x="0" y="0" width="'+n.w+'" height="'+n.h+'" rx="10" ry="10"></rect>'+
        '<foreignObject x="0" y="0" width="'+n.w+'" height="'+n.h+'">'+
          '<div xmlns="http://www.w3.org/1999/xhtml" class="label" contenteditable="false"></div>'+
        '</foreignObject>';
      els.nodes.appendChild(g);

      g.addEventListener('pointerdown', function(e){
        if(e.button!==0) return;
        // ★ Alt+ドラッグで接続ライン開始
        if(e.altKey){
          e.stopPropagation();
          clearSelection(); addSelection(n.id);
          var wp = stageToWorld(e.clientX, e.clientY);
          var path = document.createElementNS('http://www.w3.org/2000/svg','path');
          path.setAttribute('class','edge');
          path.setAttribute('marker-end','url(#arrow)');
          els.edges.appendChild(path);
          drawingEdge = {fromId:n.id, pathEl:path};
          g.setPointerCapture(e.pointerId);
          return;
        }
        var multiKey = e.ctrlKey || e.metaKey;
        if(!multiKey && !selectedIds.has(n.id)){ clearSelection(); addSelection(n.id); }
        else if(multiKey){ toggleSelection(n.id); }
        var wp = stageToWorld(e.clientX, e.clientY);
        var offsets = new Map();
        var ids = selectedIds.size? setToArray(selectedIds) : [n.id];
        for(var i=0;i<ids.length;i++){
          var id=ids[i]; var nn = nodes.get(id);
          offsets.set(id,{dx: wp.x - nn.x, dy: wp.y - nn.y});
        }
        dragging = {ids: ids, offsets: offsets};
        g.setPointerCapture(e.pointerId);
      });

      g.addEventListener('dblclick', function(){ editLabel(n.id); });
    }
    g.setAttribute('transform', 'translate(' + n.x + ',' + n.y + ')');
    if(selectedIds.has(n.id)) g.classList.add('selected'); else g.classList.remove('selected');

    var rect = g.querySelector('rect');
    rect.setAttribute('width', n.w);
    rect.setAttribute('height', n.h);
    rect.setAttribute('fill', n.color); // ★ 色をJS属性で一元管理
    rect.style.fill = n.color; // ★ 保険として style でも指定（即時反映を担保）

    var fo = g.querySelector('foreignObject');
    fo.setAttribute('width', n.w);
    fo.setAttribute('height', n.h);

    var div = g.querySelector('.label');
    div.style.backgroundColor = 'transparent'; // 背景は常に透明（ズレ防止）
    div.textContent = n.text;
  }

  function addNode(opts){
    opts = opts || {};
    var id = opts.id || uid();
    var node = {
      id:id, x:opts.x!=null?opts.x:0, y:opts.y!=null?opts.y:0,
      w:opts.w!=null?opts.w:160, h:opts.h!=null?opts.h:40,
      text:opts.text||'新しいノード', color:opts.color||'#ffffff',
      parentIds:new Set(opts.parentIds||[]), childIds:new Set(opts.childIds||[])
    };
    nodes.set(id, node);
    renderNode(node);
    autosizeNode(node);
    return node;
  }
  function link(fromId,toId){
    var from = nodes.get(fromId), to = nodes.get(toId);
    if(!from||!to|| fromId===toId) return;
    if(from.childIds.has(toId)) return;
    from.childIds.add(toId);
    to.parentIds.add(fromId);
    edges.push({id: 'e'+Math.random().toString(36).slice(2,9), from:fromId, to:toId}); // ★ID付与
    renderEdges();
  }
  function deleteNode(id){
    var n = nodes.get(id); if(!n) return;
    n.parentIds.forEach(function(pid){ var p=nodes.get(pid); if(p){p.childIds.delete(id);} });
    n.childIds.forEach(function(cid){ var c=nodes.get(cid); if(c){c.parentIds.delete(id);} });
    for(var i=edges.length-1;i>=0;i--){ if(edges[i].from===id || edges[i].to===id) edges.splice(i,1); }
    var g = document.getElementById('node-'+id); if(g) g.remove();
    nodes.delete(id);
    selectedIds.delete(id);
    renderEdges();
  }

  function autosizeNode(n){
    var meas = document.getElementById('mm-measure');
    if(!meas){
      meas = document.createElement('div');
      meas.id='mm-measure';
      meas.style.position='absolute';
      meas.style.left='-9999px';
      meas.style.top='-9999px';
      meas.style.visibility='hidden';
      meas.style.boxSizing='border-box';
      meas.style.font='14px/1.6 system-ui,-apple-system,Segoe UI,Roboto, "Hiragino Kaku Gothic ProN", Meiryo, sans-serif';
      meas.style.padding='8px 10px';
      meas.style.whiteSpace='pre-wrap';  // ★ 改行を維持して計測
      meas.style.wordBreak='break-word';
      meas.style.maxWidth='320px';
      document.body.appendChild(meas);
    }
    meas.textContent = n.text || '';
    var rect = meas.getBoundingClientRect();
    var w = Math.max(100, Math.min(320, Math.ceil(rect.width)+2));
    var h = Math.max(34, Math.ceil(rect.height)+2);
    n.w = w; n.h = h;
    if(editingId === n.id){
      var g  = document.getElementById('node-'+n.id);
      if(g){
        var r  = g.querySelector('rect');
        var fo = g.querySelector('foreignObject');
        if(r){  r.setAttribute('width', w);  r.setAttribute('height', h); }
        if(fo){ fo.setAttribute('width', w); fo.setAttribute('height', h); }
      }
      renderEdges(); // エッジだけ更新
    }else{
      renderNode(n);
      renderEdges();
    }
  }

  function renderEdges(){
    els.edges.innerHTML='';
    for(var i=0;i<edges.length;i++){
      var e = edges[i];
      var a = nodes.get(e.from), b = nodes.get(e.to);
      if(!a||!b) continue;
      var path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('class','edge');
      path.id = 'edge-'+e.id; // ★DOM ID
      path.setAttribute('d', connectorPath(a, b));
      path.setAttribute('marker-end','url(#arrow)');
      // クリックで選択（Ctrl/⌘で複数選択）
      path.addEventListener('pointerdown', function(ev){
        ev.stopPropagation();
        var eid = this.id.replace('edge-','');
        var multi = ev.ctrlKey || ev.metaKey;
        if(!multi) { clearSelection(); clearEdgeSelection(); } // ノード選択も解除
        toggleEdgeSelection(eid);
      });
      els.edges.appendChild(path);
    }
    // 既選択の見た目を維持
    selectedEdgeIds.forEach(function(eid){
      var p = document.getElementById('edge-'+eid); if(p) p.classList.add('selected');
    });
  }

  // ===== Selection helpers =====
  function clearSelection(){
    selectedIds.forEach(function(id){
      var el=document.getElementById('node-'+id);
      if(el) el.classList.remove('selected');
    });
    selectedIds = new Set();
  }
  function addSelection(id){
    selectedIds.add(id);
    var el=document.getElementById('node-'+id);
    if(el) el.classList.add('selected');
    lastSelectedId = id;
  }
  function toggleSelection(id){
    if(selectedIds.has(id)){ selectedIds.delete(id); }
    else { selectedIds.add(id); lastSelectedId = id; }
    var n=nodes.get(id); if(n) renderNode(n);
  }

  // ===== Edit (IME考慮) =====
  function editLabel(id){
    var g = document.getElementById('node-'+id); if(!g) return;
    var div = g.querySelector('.label');
    editingId = id; isComposing = false;

    div.setAttribute('contenteditable','true');
    div.focus();
    setCaretToEnd(div);

    function onKey(e){
      if(e.type==='compositionstart'){ isComposing = true; return; }
      if(e.type==='compositionend'){ isComposing = false; return; }

      if(e.key==='Enter'){
        if(e.ctrlKey || e.metaKey){
          e.preventDefault(); e.stopPropagation();
          try{ document.execCommand('insertLineBreak'); }
          catch(_){ document.execCommand('insertHTML', false, '<br/>'); }
          var n1 = nodes.get(id); if(n1){ autosizeNode(n1); }
          return;
        }
        if(isComposing){ return; }
        e.preventDefault(); e.stopPropagation();
        swallowKey = 'Enter';
        finish(false); // 確定して選択状態、兄弟は作らない
        setTimeout(function(){ swallowKey = null; }, 0);
      }

      if(e.key==='Tab'){
        if(isComposing){ return; }
        e.preventDefault(); e.stopPropagation();
        swallowKey = 'Tab';
        finish(false); // 確定して選択状態、子は作らない
        setTimeout(function(){ swallowKey = null; }, 0);
      }
    }

    function onInput(){
      var n = nodes.get(id); if(!n) return;
      n.text = (div.textContent||'');
      autosizeNode(n);
    }

    function finish(cancel){
      div.removeEventListener('keydown', onKey);
      div.removeEventListener('input', onInput);
      div.removeEventListener('compositionstart', onKey);
      div.removeEventListener('compositionend', onKey);
      div.removeAttribute('contenteditable');

      var n = nodes.get(id);
      if(n && !cancel){
        n.text = (div.textContent||'').trim() || '（無題）';
        autosizeNode(n);
        saveAuto();
      }
      clearSelection(); addSelection(id); // 選択状態に戻す
      setTimeout(function(){ editingId = null; isComposing=false; }, 0);
    }

    div.addEventListener('keydown', onKey);
    div.addEventListener('input', onInput);
    div.addEventListener('compositionstart', onKey);
    div.addEventListener('compositionend', onKey);
    div.addEventListener('blur', function(){ finish(false); });
  }

  // ===== Layout helpers =====
  function autoPlaceChild(parent){
    var p = nodes.get(parent); if(!p) return {x:0,y:0};
    var gapX=60, gapY=16; var idx = p.childIds.size;
    return {x: p.x + p.w + gapX, y: p.y + idx*(p.h+gapY)};
  }

  // ===== Save / Load =====
  var STORAGE_KEY = 'mindmap_saves_v2';
  function listSaves(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY))||{}; }catch(e){ return {}; } }
  function updateLoadSelect(){
    var sel = document.getElementById('loadSelect');
    var dat = document.getElementById('saveNames'); // ★ 追加
    var saves = listSaves(); 
    var curSel = sel ? sel.value : '';

    // セレクト更新
    if(sel){
      var opts = ['<option value="">保存済みを選択…</option>'];
      Object.keys(saves).sort().forEach(function(n){ opts.push('<option>'+n+'</option>'); });
      sel.innerHTML = opts.join('');
      // 可能なら現在名を選択状態に
      if(currentName && saves[currentName]) sel.value = currentName;
      else if(curSel && saves[curSel]) sel.value = curSel;
    }

    // ★ datalist 更新（mapName の候補）
    if(dat){
      var dopts = [];
      Object.keys(saves).sort().forEach(function(n){ dopts.push('<option value="'+n+'"></option>'); });
      dat.innerHTML = dopts.join('');
    }
  }

  function snapshot(){
    var arr=[]; nodes.forEach(function(n){
      arr.push({id:n.id,x:n.x,y:n.y,w:n.w,h:n.h,text:n.text,color:n.color,parents:setToArray(n.parentIds),children:setToArray(n.childIds)});
    });
    return { routeMode: routeMode, scale:scale, tx:tx, ty:ty, nodes: arr, edges: edges.slice() };
  }
  function restore(s){
    history.mute=true;
    nodes.clear(); edges.splice(0,edges.length); els.nodes.innerHTML='';
    for(var i=0;i<s.nodes.length;i++){
      var raw=s.nodes[i];
      addNode({id:raw.id,x:raw.x,y:raw.y,w:raw.w,h:raw.h,text:raw.text,color:raw.color,parentIds:raw.parents,childIds:raw.children});
    }
    for(var j=0;j<s.edges.length;j++){
      var e=s.edges[j];
      edges.push({id: e.id || ('e'+Math.random().toString(36).slice(2,9)), from:e.from, to:e.to});
    }
    scale=s.scale; tx=s.tx; ty=s.ty;
    routeMode = s.routeMode || 'bezier';
    applyViewport(); renderEdges();
    history.mute=false;
  }
  function saveAs(name){
    if(!name){ alert('保存名を入力してください'); return; }
    var payload = snapshot();
    var saves = listSaves(); saves[name] = payload;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    currentName = name; // ★ 現在名を更新
    // 入力欄にも反映
    var nm = document.getElementById('mapName'); if(nm) nm.value = name;
    updateLoadSelect(); flashBadge('保存しました');
  }

  function loadFrom(name){
    var saves = listSaves(); var p = saves[name];
    if(!p){ alert('見つかりませんでした'); return; }
    restore(p); 
    currentName = name; // ★ 現在名を更新
    var nm = document.getElementById('mapName'); if(nm) nm.value = name; // ★ 入力欄へ反映
    flashBadge('読み込み完了');
    updateLoadSelect();
  }

  function deleteSave(name){
    var saves = listSaves(); if(!saves[name]) return;
    delete saves[name];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    updateLoadSelect();
  }
  function pushHistory(){ if(history.mute) return; history.stack.push(snapshot()); if(history.stack.length>history.max) history.stack.shift(); history.redo.length=0; }
  // ★ 未入力でも currentName を既定にして自動保存
  function saveAuto(){
    pushHistory();
    var nmEl = document.getElementById('mapName');
    var name = ((nmEl && nmEl.value) || currentName || '').trim();
    if(!name) return; // 無名のときはサイレント
    saveAs(name);
  }
  function undo(){ if(history.stack.length<2) return; var cur=history.stack.pop(); history.redo.push(cur); var prev=history.stack[history.stack.length-1]; restore(prev); }
  function redo(){ if(!history.redo.length) return; var s=history.redo.pop(); history.stack.push(s); restore(s); }
  function flashBadge(text){
    var b = els.autosaveBadge; if(!b) return;
    b.textContent = text;
    setTimeout(function(){ b.textContent = 'ローカル保存'; }, 1000);
  }

  function clearEdgeSelection(){
    selectedEdgeIds.forEach(function(eid){
      var p = document.getElementById('edge-'+eid);
      if(p) p.classList.remove('selected');
    });
    selectedEdgeIds.clear();
  }
  function addEdgeSelection(eid){
    selectedEdgeIds.add(eid);
    var p = document.getElementById('edge-'+eid);
    if(p) p.classList.add('selected');
  }
  function toggleEdgeSelection(eid){
    if(selectedEdgeIds.has(eid)){
      selectedEdgeIds.delete(eid);
      var p = document.getElementById('edge-'+eid); if(p) p.classList.remove('selected');
    }else{
      addEdgeSelection(eid);
    }
  }

// ===== Export helpers =====
function nFinite(v, d){ v = Number(v); return Number.isFinite(v) ? v : (d!=null?d:0); }
function px(v){ return String(Math.round(nFinite(v,0))); }

// 簡易SVG妥当性チェック（未定義・NaN・空dなど）
function validateSVGString(svgStr){
  if(!svgStr || typeof svgStr!=='string') throw new Error('SVG文字列が空です');
  if(!/^\s*<svg[\s>]/i.test(svgStr)) throw new Error('<svg> で始まっていません');
  if(svgStr.indexOf('NaN')>=0 || svgStr.indexOf('Infinity')>=0) throw new Error('数値に NaN/Infinity が含まれます');
  // path d="" が空のものを簡易検知
  var emptyD = svgStr.match(/<path[^>]*\sd=['"]\s*['"][^>]*>/i);
  if(emptyD) throw new Error('空の path(d) が含まれます');
}

  // ===== Export (foreignObject非依存SVG構築) =====
function buildExportSVG(){
  // ノード収集
  var all=[]; nodes.forEach(function(n){ all.push(n); });
  if(all.length===0) throw new Error('no nodes');

  // 描画範囲
  var pad=40, minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(var i=0;i<all.length;i++){
    var n=all[i];
    minX=Math.min(minX, nFinite(n.x,0));
    minY=Math.min(minY, nFinite(n.y,0));
    maxX=Math.max(maxX, nFinite(n.x,0)+nFinite(n.w,100));
    maxY=Math.max(maxY, nFinite(n.y,0)+nFinite(n.h,40));
  }
  minX-=pad; minY-=pad; maxX+=pad; maxY+=pad;
  var box={x:minX,y:minY,w:maxX-minX,h:maxY-minY};

  // SVGヘッダ
  var parts=[];
  parts.push("<svg xmlns='http://www.w3.org/2000/svg' width='"+px(box.w)+"' height='"+px(box.h)+"' viewBox='"+box.x+" "+box.y+" "+box.w+" "+box.h+"'>");
  parts.push("<defs><marker id='arrow' viewBox='0 0 10 10' refX='10' refY='5' markerWidth='8' markerHeight='8' orient='auto-start-reverse'><path d='M0 0 L10 5 L0 10 Z' fill='#94a3b8'/></marker></defs>");

  // 状態をmetadataに埋め込み（再編集用）
  var stateJson = JSON.stringify(snapshot());
  parts.push("<metadata id='mm-data'><![CDATA["+ stateJson +"]]></metadata>");

  // エッジ
  for(var i=0;i<edges.length;i++){
    var e=edges[i]; var a=nodes.get(e.from), b=nodes.get(e.to);
    if(!a||!b) continue;
    var d = connectorPath(a,b); // 画面と同一ロジック
    if(!d || !d.trim()) continue;
    parts.push("<path d='"+d.replace(/\s+/g,' ')+"' stroke='#94a3b8' stroke-width='2' fill='none' marker-end='url(#arrow)'/>");
  }

  // テキスト折返し（改行維持）
  var cnv=document.createElement('canvas'); var cctx=cnv.getContext('2d');
  cctx.font='14px system-ui,-apple-system,Segoe UI,Roboto,"Hiragino Kaku Gothic ProN",Meiryo,sans-serif';
  function wrapExplicit(text, maxW){
    var paras=String(text||'').split(/\n/), out=[];
    for(var p=0;p<paras.length;p++){
      var t=paras[p]; if(t===''){ out.push(''); continue; }
      var line='';
      for(var k=0;k<t.length;k++){
        var test=line+t[k];
        if(cctx.measureText(test).width>maxW){
          out.push(line || t[k]); line=t[k];
        }else line=test;
      }
      if(line!=='') out.push(line);
    }
    return out;
  }
  function esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/\x22/g,'&quot;').replace(/'/g,'&apos;');
  }

  // ノード
  nodes.forEach(function(n){
    var x=nFinite(n.x,0), y=nFinite(n.y,0), w=nFinite(n.w,120), h=nFinite(n.h,40);
    parts.push("<rect x='"+x+"' y='"+y+"' width='"+w+"' height='"+h+"' rx='10' ry='10' fill='"+esc(n.color||"#ffffff")+"' stroke='#cbd5e1'/>");
    var padX=10, padY=10, maxW=w-20, lh=22; 
    var baseline = y+padY+14;
    var lines = wrapExplicit(n.text, maxW); if(!lines.length) lines=[''];
    for(var li=0; li<lines.length; li++){
      parts.push("<text x='"+(x+padX)+"' y='"+(baseline+lh*li)+"' font-size='14' font-family='system-ui,-apple-system,Segoe UI,Roboto,\"Hiragino Kaku Gothic ProN\",Meiryo,sans-serif' fill='#111827'>"+esc(lines[li])+"</text>");
    }
  });

  parts.push("</svg>");
  var svgStr = parts.join('');
  validateSVGString(svgStr); // ← ここで落ちれば具体的に原因表示できる

  return { svgStr: svgStr, box: box };
}

  function escapeXml(s){
    s = (s==null? '': String(s));
    s = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\x22/g,'&quot;').replace(/'/g,'&apos;');
    return s;
  }

function exportPNG(){
  try{
    var built = buildExportSVG();
    var blob = new Blob([built.svgStr], {type:'image/svg+xml;charset=utf-8'});
    var url  = URL.createObjectURL(blob);

    var img = new Image();
    img.crossOrigin = 'anonymous';     // たいてい不要だが保険
    img.decoding   = 'sync';
    img.onload = function(){
      try{
        var canvas = els.exportCanvas || document.createElement('canvas');
        canvas.width  = Math.ceil(built.box.w);
        canvas.height = Math.ceil(built.box.h);
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        var a = document.createElement('a');
        a.download = (document.getElementById('mapName').value || 'mindmap') + '.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
      }catch(err){
        console.error('[exportPNG draw] ', err);
        alert('PNG描画に失敗しました：'+ err.message + '\n→ まずSVGでの書き出しをお試しください。');
      }
    };
    img.onerror = function(ev){
      console.error('[exportPNG image error]', ev);
      URL.revokeObjectURL(url);
      alert('画像の読み込みに失敗しました（ブラウザ制約の可能性）。\n→ まずSVGで書き出してご利用ください。');
    };
    img.src = url;
  }catch(err){
    console.error('[exportPNG build] ', err);
    alert('画像書き出しでエラー：'+ err.message + '\n（ノード無し / 数値NaN / 文字列不正 など）');
  }
}

function exportSVGFile(){
  try{
    var built=buildExportSVG();
    var a=document.createElement('a');
    a.download=(document.getElementById('mapName').value||'mindmap')+'.svg';
    a.href=URL.createObjectURL(new Blob([built.svgStr],{type:'image/svg+xml'}));
    a.click();
    // revokeは遅延した方が安全
    setTimeout(function(){ try{ URL.revokeObjectURL(a.href); }catch(_){} }, 5000);
  }catch(e){
    console.error('[exportSVG] ', e);
    alert('SVG書き出しに失敗：'+ e.message);
  }
}

  // ===== View helpers =====
  function fitAll(){
    var box = getContentBox(); if(!box) return;
    var wrap = els.stageWrap.getBoundingClientRect();
    var pad = 80;
    var sx = (wrap.width - pad) / box.w;
    var sy = (wrap.height - pad) / box.h;
    scale = clamp(Math.min(sx, sy), 0.1, 4);
    tx = -box.x + (wrap.width - box.w*scale)/2;
    ty = -box.y + (wrap.height - box.h*scale)/2;
    applyViewport();
  }
  function centerView(){ tx = els.stageWrap.clientWidth/2; ty = els.stageWrap.clientHeight/2; applyViewport(); }
  function getContentBox(){
    var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity, count=0;
    nodes.forEach(function(n){ count++; if(n.x<minX)minX=n.x; if(n.y<minY)minY=n.y; if(n.x+n.w>maxX)maxX=n.x+n.w; if(n.y+n.h>maxY)maxY=n.y+n.h; });
    if(!count) return null;
    return {x:minX,y:minY,w:maxX-minX,h:maxY-minY};
  }

  function updateMinimap(){
    var mini = els.mini;
    var wrap = els.stageWrap.getBoundingClientRect();
    var box = getContentBox();
    var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('width','100%'); svg.setAttribute('height','100%');
    mini.innerHTML=''; mini.appendChild(svg);
    if(!box){ return; }
    var scaleMini = Math.min(mini.clientWidth/box.w, mini.clientHeight/box.h);
    var offx = (mini.clientWidth - box.w*scaleMini)/2;
    var offy = (mini.clientHeight - box.h*scaleMini)/2;

    for(var i=0;i<edges.length;i++){
      var e=edges[i];
      var a=nodes.get(e.from), b=nodes.get(e.to);
      if(!a||!b) continue;
      var x1=(a.x+a.w - box.x)*scaleMini+offx, y1=(a.y+a.h/2 - box.y)*scaleMini+offy;
      var x2=(b.x - box.x)*scaleMini+offx,   y2=(b.y+b.h/2 - box.y)*scaleMini+offy;
      var mx=(x1+x2)/2;
      var p=document.createElementNS('http://www.w3.org/2000/svg','path');
      p.setAttribute('d','M '+x1+' '+y1+' C '+mx+' '+y1+', '+mx+' '+y2+', '+x2+' '+y2);
      p.setAttribute('stroke','#cbd5e1'); p.setAttribute('fill','none'); p.setAttribute('stroke-width','1');
      svg.appendChild(p);
    }
    nodes.forEach(function(n){
      var r=document.createElementNS('http://www.w3.org/2000/svg','rect');
      r.setAttribute('x', (n.x - box.x)*scaleMini+offx);
      r.setAttribute('y', (n.y - box.y)*scaleMini+offy);
      r.setAttribute('width', n.w*scaleMini);
      r.setAttribute('height', n.h*scaleMini);
      r.setAttribute('rx','6'); r.setAttribute('fill','#f1f5f9'); r.setAttribute('stroke','#e2e8f0');
      svg.appendChild(r);
    });

    var vx = (-tx/scale - box.x)*scaleMini+offx;
    var vy = (-ty/scale - box.y)*scaleMini+offy;
    var vw = wrap.width/scale*scaleMini;
    var vh = wrap.height/scale*scaleMini;
    var vr = document.createElementNS('http://www.w3.org/2000/svg','rect');
    vr.setAttribute('x',vx); vr.setAttribute('y',vy); vr.setAttribute('width',vw); vr.setAttribute('height',vh);
    vr.setAttribute('fill','none'); vr.setAttribute('stroke','#94a3b8'); vr.setAttribute('stroke-dasharray','3 3');
    svg.appendChild(vr);
  }

  // ===== Events =====
  var zoomIn = document.getElementById('zoomIn');
  var zoomOut = document.getElementById('zoomOut');
  var zoomReset = document.getElementById('zoomReset');
  var fitBtn = document.getElementById('fitBtn');
  var centerBtn = document.getElementById('centerBtn');
  var exportBtn = document.getElementById('exportBtn');
  var exportSvgBtn = document.getElementById('exportSvgBtn');
  var exportJsonBtn = document.getElementById('exportJsonBtn');
  var routeModeBtn = document.getElementById('routeModeBtn');

  function refreshRouteButton(){
    if(!routeModeBtn) return;
    routeModeBtn.textContent = (routeMode==='ortho') ? '直交: ON' : '直交: OFF';
    routeModeBtn.title = '配線モード（Rで切替）';
  }
  if(routeModeBtn){
    routeModeBtn.onclick = function(){
      routeMode = (routeMode==='ortho') ? 'bezier' : 'ortho';
      localStorage.setItem('mm_route_mode', routeMode);
      refreshRouteButton();
      renderEdges(); saveAuto();
    };
  }
  refreshRouteButton();

  // キーボード R でも切替（編集中は無効）
  window.addEventListener('keydown', function(e){
    if (editingId) return;
    if (e.key.toLowerCase()==='r'){
      e.preventDefault();
      routeMode = (routeMode==='ortho') ? 'bezier' : 'ortho';
      localStorage.setItem('mm_route_mode', routeMode);
      refreshRouteButton();
      renderEdges(); saveAuto();
    }
  });

  if(zoomIn)   zoomIn.onclick   = function(){ scale=clamp(scale*1.15, 0.1, 6); applyViewport(); };
  if(zoomOut)  zoomOut.onclick  = function(){ scale=clamp(scale/1.15, 0.1, 6); applyViewport(); };
  if(zoomReset)zoomReset.onclick= function(){ scale=1; applyViewport(); };
  if(fitBtn)   fitBtn.onclick   = fitAll;
  if(centerBtn)centerBtn.onclick= centerView;
  if(exportBtn)exportBtn.onclick= exportPNG;
  if(exportSvgBtn) exportSvgBtn.onclick = function(){
    try{
      var built=buildExportSVG();
      var a=document.createElement('a');
      a.download=(document.getElementById('mapName').value||'mindmap')+'.svg';
      a.href=URL.createObjectURL(new Blob([built.svgStr],{type:'image/svg+xml'}));
      a.click();
    }catch(e){ alert('SVG書き出しに失敗しました'); }
  };

  if(exportJsonBtn) exportJsonBtn.onclick = function(){
    try{
      var data = snapshot();
      var blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
      var a = document.createElement('a');
      a.download = (document.getElementById('mapName').value || 'mindmap') + '.json';
      a.href = URL.createObjectURL(blob);
      a.click();
    }catch(e){ alert('JSON書き出しに失敗しました'); }
  };

  // ===== Import (JSON / SVG) =====
  var importBtn  = document.getElementById('importBtn');
  var importFile = document.getElementById('importFile');
  if(importBtn && importFile){
    importBtn.onclick = function(){ importFile.value=''; importFile.click(); };
    importFile.onchange = function(ev){
      var f = ev.target.files && ev.target.files[0]; if(!f) return;
      var reader = new FileReader();
      reader.onload = function(){
        var text = String(reader.result||'');
        try{
          if(/\.\s*json$/i.test(f.name)){
            var obj = JSON.parse(text);
            restore(obj); flashBadge('JSONインポート完了'); history.stack.push(snapshot());
          }else{
            var m = text.match(/<metadata[^>]*id=['"]mm-data['"][^>]*>([\s\S]*?)<\/metadata>/i);
            if(!m){ alert('SVG内に再編集データが見つかりませんでした'); return; }
            var cdata = m[1].replace(/^<!\[CDATA\[/,'').replace(/\]\]>$/,'');
            var obj2 = JSON.parse(cdata);
            restore(obj2); flashBadge('SVGインポート完了'); history.stack.push(snapshot());
          }
        }catch(err){
          alert('インポートに失敗しました：' + err.message);
        }
      };
      reader.readAsText(f, 'utf-8');
    };
  }

  // ヘルプパネル（?）
  if(els.infoBtn && els.infoPanel){
    var hideTimer=null;
    function showInfo(){ els.infoPanel.style.display='block'; }
    function hideInfo(){ els.infoPanel.style.display='none'; }
    els.infoBtn.addEventListener('mouseenter', function(){ clearTimeout(hideTimer); showInfo(); });
    els.infoBtn.addEventListener('mouseleave', function(){ hideTimer=setTimeout(hideInfo, 300); });
    els.infoPanel.addEventListener('mouseenter', function(){ clearTimeout(hideTimer); });
    els.infoPanel.addEventListener('mouseleave', function(){ hideTimer=setTimeout(hideInfo, 300); });
    els.infoBtn.addEventListener('click', function(){
      els.infoPanel.style.display = (els.infoPanel.style.display==='block'?'none':'block');
    });
  }

  // カラーパレット
  var colorGroup = document.getElementById('colorGroup');
  if(colorGroup){
    colorGroup.addEventListener('click', function(e){
      var sw = e.target.closest ? e.target.closest('.swatch') : null; if(!sw) return;
      applyColor(sw.getAttribute('data-color'));
    });
    colorGroup.addEventListener('keydown', function(e){
      if((e.key==='Enter'||e.key===' ') && e.target.classList.contains('swatch')){
        e.preventDefault(); applyColor(e.target.getAttribute('data-color'));
      }
    });
  }
  function applyColor(col){
    var ids = setToArray(selectedIds);
    for(var i=0;i<ids.length;i++){
      var n=nodes.get(ids[i]); if(!n) continue;
      n.color = col;
      renderNode(n); // rectのfillを更新
    }
    if(ids.length){ renderEdges(); saveAuto(); }
  }

  // Wheel zoom
  els.stageWrap.addEventListener('wheel', function(e){
    e.preventDefault();
    var mouse = stageToWorld(e.clientX, e.clientY);
    scale = clamp(scale * (e.deltaY<0? 1.1: 1/1.1), 0.1, 6);
    tx = e.clientX - mouse.x*scale;
    ty = e.clientY - mouse.y*scale;
    applyViewport();
  }, {passive:false});

  // Pointer drag/pan/select
  els.stageWrap.addEventListener('pointerdown', function(e){
    var isNode = e.target.closest && e.target.closest('.node');
    if(!isNode){
      if(e.shiftKey){
        var rect = els.stageWrap.getBoundingClientRect();
        var sx = e.clientX - rect.left;
        var sy = e.clientY - rect.top;
        selecting = {sx:sx, sy:sy, rectLeft:rect.left, rectTop:rect.top};
        var sr = els.selRect.style;
        sr.display='block'; sr.left = sx+'px'; sr.top = sy+'px'; sr.width='0px'; sr.height='0px';
      } else {
        panning = {startX:e.clientX, startY:e.clientY, tx0:tx, ty0:ty};
        els.stageWrap.setPointerCapture(e.pointerId);
      }
      clearSelection();
      clearEdgeSelection();
    }
  });
  els.stageWrap.addEventListener('pointermove', function(e){
    if(dragging){
      var wp = stageToWorld(e.clientX, e.clientY);
      for(var i=0;i<dragging.ids.length;i++){
        var id=dragging.ids[i]; var n = nodes.get(id); var off = dragging.offsets.get(id);
        if(!n||!off) continue;
        n.x = Math.round(wp.x - off.dx); n.y = Math.round(wp.y - off.dy);
        renderNode(n);
      }
      renderEdges();
    } else if(panning){
      tx = panning.tx0 + (e.clientX - panning.startX);
      ty = panning.ty0 + (e.clientY - panning.startY);
      applyViewport();
    } else if(drawingEdge){
      var from = nodes.get(drawingEdge.fromId);
      if(!from){ drawingEdge.pathEl.remove(); drawingEdge=null; return; }
      var wp = stageToWorld(e.clientX, e.clientY);
      drawingEdge.pathEl.setAttribute('d', connectorPath(from, {x: wp.x, y: wp.y}));
    } else if(selecting){
      var rect = els.stageWrap.getBoundingClientRect();
      var cx = e.clientX - rect.left;
      var cy = e.clientY - rect.top;
      var x = Math.min(selecting.sx, cx), y = Math.min(selecting.sy, cy);
      var w = Math.abs(cx - selecting.sx), h = Math.abs(cy - selecting.sy);
      var sr = els.selRect.style; sr.left=x+'px'; sr.top=y+'px'; sr.width=w+'px'; sr.height=h+'px';
      // ステージ座標に補正して当たり判定
      var a = stageToWorld(x + rect.left, y + rect.top);
      var b = stageToWorld(x + w + rect.left, y + h + rect.top);
      clearSelection();
      nodes.forEach(function(n){
        var nx1=n.x, ny1=n.y, nx2=n.x+n.w, ny2=n.y+n.h;
        if(nx1<b.x && nx2>a.x && ny1<b.y && ny2>a.y){ addSelection(n.id); }
      });
    }
  });
  function endDragPan(){
    if(dragging){ dragging=null; saveAuto(); }
    if(panning){ panning=null; }
    if(selecting){ selecting=null; els.selRect.style.display='none'; }
    if(drawingEdge){
      // pointerup 位置にノードがあれば接続
      var el = document.elementFromPoint ? document.elementFromPoint(window.event.clientX, window.event.clientY) : null;
      var g = el && el.closest ? el.closest('.node') : null;
      if(g){
        var toId = g.id.replace('node-','');
        if(toId !== drawingEdge.fromId){ link(drawingEdge.fromId, toId); renderEdges(); saveAuto(); }
      }
      if(drawingEdge.pathEl && drawingEdge.pathEl.parentNode){ drawingEdge.pathEl.remove(); }
      drawingEdge=null;
    }
  }
  els.stageWrap.addEventListener('pointerup', endDragPan);
  els.stageWrap.addEventListener('pointercancel', endDragPan);

  function deleteSelectedEdges(){
    if(!selectedEdgeIds.size) return;
    var del = new Set(selectedEdgeIds);
    for(var i=edges.length-1;i>=0;i--){
      var e = edges[i];
      if(!del.has(e.id)) continue;
      // ★ ノード側の参照も外す（ここが無いと「既に接続済み」と判定される）
      var from = nodes.get(e.from), to = nodes.get(e.to);
      if(from) from.childIds.delete(e.to);
      if(to)   to.parentIds.delete(e.from);
      edges.splice(i,1);
    }
    clearEdgeSelection();
    renderEdges(); saveAuto();
  }

  // === 子ノード作成（親の“逆側”に初期配置してリンク） ===
  function addChildFor(baseId){
    var base = NODES_GET(baseId);
    if(!base) return;
    var pos = initialChildPositionOpposite(base);
    var n = addNode({ x: pos.x, y: pos.y, w: pos.w, h: pos.h, text:'新しいノード' });
    link(base.id, n.id);
    clearSelection(); addSelection(n.id);
    if (typeof editLabel === 'function') editLabel(n.id);
    saveAuto();
  }

  // 互換：既存呼び出しの addChildTo も中で逆側ロジックへ委譲
  function addChildTo(id){ addChildFor(id); }

  // ===== Keyboard（編集中は無効） =====
  window.addEventListener('keydown', function(e){
    if(swallowKey && e.key===swallowKey){ e.preventDefault(); swallowKey=null; return; }
    if(editingId){ return; }
    var cmd = (e.ctrlKey||e.metaKey);
    if(cmd && e.key.toLowerCase()==='z'){ e.preventDefault(); undo(); return; }
    if(cmd && (e.key.toLowerCase()==='y' || (e.shiftKey && e.key.toLowerCase()==='z'))){ e.preventDefault(); redo(); return; }
    if(e.key==='Delete'){
      e.preventDefault();
      if(selectedEdgeIds.size){ deleteSelectedEdges(); return; }
      if(selectedIds.size){ deleteSelected(); return; }
    }
    if((e.key==='F2' || e.key.toLowerCase()==='e') && selectedIds.size===1){ e.preventDefault(); editLabel(SELECTED_ONE_ID()); return; }

    // Enter：選択状態で兄弟作成（編集中EnterはeditLabel内で処理）
    if(e.key==='Enter' && selectedIds.size===1){
      e.preventDefault();
      addSiblingTo(SELECTED_ONE_ID());
      return;
    }
    // Tab：選択状態で“親の逆側”に子作成
    if(e.key==='Tab' && selectedIds.size===1){
      e.preventDefault();
      addChildFor(SELECTED_ONE_ID());
      return;
    }
    // 方向キー：接続相手の中から角度優先で移動
    if(selectedIds.size===1 && (e.key==='ArrowLeft'||e.key==='ArrowRight'||e.key==='ArrowUp'||e.key==='ArrowDown')){
      e.preventDefault();
      var curId = SELECTED_ONE_ID();
      var dir = (e.key==='ArrowLeft'?'left': e.key==='ArrowRight'?'right': e.key==='ArrowUp'?'up':'down');
      var nextId = pickDirectionalNeighborConnected(curId, dir);
      if (nextId){ clearSelection(); addSelection(nextId); }
      return;
    }
  });

  // ===== Align（4方向：右/左コラム＋上/下行。縦は等間隔、横は等間隔。親順で連結） =====
  function layoutSubtree(rootId){
    var gapX = 120; // 親から子までの基準距離（左右なら横距離、上下なら縦距離）
    var gapY = 12;  // 同一列/行の要素間の間隔

    var root = nodes.get(rootId); if(!root) return;

    // 1) BFSで depth を構築（root=0）＆ 親テーブル
    var levels = {}, parents = {};
    var q = [[rootId,0]], seen = new Set([rootId]), maxDepth = 0;
    while(q.length){
      var cur = q.shift(), id = cur[0], d = cur[1];
      if(!levels[d]) levels[d]=[];
      levels[d].push(id);
      if(d>maxDepth) maxDepth=d;
      var n = nodes.get(id); if(!n) continue;
      n.childIds.forEach(function(cid){
        if(!seen.has(cid)){
          seen.add(cid);
          parents[cid] = id;
          q.push([cid, d+1]);
        }
      });
    }

    // 2) depthごとに子を 右/左/上/下 の4方向に振り分けて整列
    for(var depth=1; depth<=maxDepth; depth++){
      var ids = levels[depth] || [];
      if(!ids.length) continue;

      // 親の表示順（ひとつ上の depth の配列順）を保持
      var prev = levels[depth-1] || [];
      var parentOrder = {}; 
      for (var pi=0; pi<prev.length; pi++){ parentOrder[prev[pi]] = pi; }

      // 4方向のバケット
      var rightArr=[], leftArr=[], topArr=[], bottomArr=[];
      for(var i=0;i<ids.length;i++){
        var id = ids[i], n = nodes.get(id); if(!n) continue;
        var pId = parents[id], p = nodes.get(pId); if(!p) continue;
        var parentIdx = (parentOrder[pId]!=null? parentOrder[pId] : 9999);
        var cx = n.x + n.w/2,  cy = n.y + n.h/2;
        var px = p.x + p.w/2,  py = p.y + p.h/2;
        var dx = cx - px, dy = cy - py;
        if (Math.abs(dx) >= Math.abs(dy)) {
          (dx>=0 ? rightArr : leftArr).push({node:n, parent:p, parentId:pId, parentIdx:parentIdx});
        } else {
          (dy>=0 ? bottomArr : topArr).push({node:n, parent:p, parentId:pId, parentIdx:parentIdx});
        }
      }

      // 親ごとに“かたまり”を作り、親の順番で並べる（＝交差しない）
      function childOrderIndex(p, childId){
        // 親の childIds（Set）挿入順を尊重。見つからなければ大きめ値に。
        var idx = 0;
        if (p && p.childIds){
          for (const cid of p.childIds){ if (cid === childId) return idx; idx++; }
        }
        return 9999;
      }
      // axis: 'y'（縦積み＝右/左列） or 'x'（横並び＝上/下行）
      function buildBlocks(arr, axis){
        if(!arr.length) return [];
        var buckets = Object.create(null);
        var orderKeys = []; // {key: parentId, idx: parentIdx}
        for (var k=0;k<arr.length;k++){
          var it = arr[k], key = it.parentId;
          if(!(key in buckets)){ buckets[key]=[]; orderKeys.push({key:key, idx: it.parentIdx}); }
          buckets[key].push(it);
        }
        // 各親ブロック内：親の childIds の順（＝作成順）を最優先、同率時は見た目の軸方向で再現
        Object.keys(buckets).forEach(function(key){
          var group = buckets[key];
          var p = group[0].parent;
          group.sort(function(a,b){
            var ia = childOrderIndex(p, a.node.id);
            var ib = childOrderIndex(p, b.node.id);
            if (ia !== ib) return ia - ib;
            if (axis === 'y'){
              var ay = a.node.y + a.node.h/2, by = b.node.y + b.node.h/2;
              return ay - by;
            } else {
              var ax = a.node.x + a.node.w/2, bx = b.node.x + b.node.w/2;
              return ax - bx;
            }
          });
        });
        // 親ブロック自体は、上の段の“親の並び順”に合わせて
        orderKeys.sort(function(a,b){ return a.idx - b.idx; });

        // フラット化（親Aの子…→親Bの子… の順で連結）
        var out = [];
        for (var i=0;i<orderKeys.length;i++){
          var key = orderKeys[i].key;
          Array.prototype.push.apply(out, buckets[key]);
        }
        return out;
      }

      // 列/行のセンター算出（親の中心をもとに）
      function columnCenterYFor(flatArr){
        var centers = flatArr.map(function(it){ return it.parent.y + it.parent.h/2; });
        if(!centers.length){
          var all = prev.map(function(pid){ var pn=nodes.get(pid); return pn? (pn.y+pn.h/2) : 0; });
          if(!all.length) return root.y + root.h/2;
          var min = Math.min.apply(Math, all), max = Math.max.apply(Math, all);
          return (min+max)/2;
        }
        var minC = Math.min.apply(Math, centers), maxC = Math.max.apply(Math, centers);
        return (minC + maxC)/2;
      }
      function rowCenterXFor(flatArr){
        var centers = flatArr.map(function(it){ return it.parent.x + it.parent.w/2; });
        if(!centers.length){
          var all = prev.map(function(pid){ var pn=nodes.get(pid); return pn? (pn.x+pn.w/2) : 0; });
          if(!all.length) return root.x + root.w/2;
          var min = Math.min.apply(Math, all), max = Math.max.apply(Math, all);
          return (min+max)/2;
        }
        var minC = Math.min.apply(Math, centers), max = Math.max.apply(Math, centers);
        return (minC + max)/2;
      }

      // === 右コラム：親の右 + gapX に左揃え、縦等間隔（親Aの子 → 親Bの子…）
      (function layoutRight(){
        var flat = buildBlocks(rightArr, 'y');
        if(!flat.length) return;
        var maxH=0; for(var i=0;i<flat.length;i++){ if(flat[i].node.h>maxH) maxH=flat[i].node.h; }
        var totalH = flat.length*maxH + (flat.length-1)*gapY;
        var centerY = columnCenterYFor(flat);
        var topY = centerY - totalH/2, cursorY = topY;
        for(var j=0;j<flat.length;j++){
          var it = flat[j], n = it.node, p = it.parent;
          n.x = Math.round(p.x + p.w + gapX);
          n.y = Math.round(cursorY + (maxH - n.h)/2);
          renderNode(n);
          cursorY += maxH + gapY;
        }
      })();

      // === 左コラム：親の左 - gapX に右揃え、縦等間隔（親Aの子 → 親Bの子…）
      (function layoutLeft(){
        var flat = buildBlocks(leftArr, 'y');
        if(!flat.length) return;
        var maxH=0; for(var i=0;i<flat.length;i++){ if(flat[i].node.h>maxH) maxH=flat[i].node.h; }
        var totalH = flat.length*maxH + (flat.length-1)*gapY;
        var centerY = columnCenterYFor(flat);
        var topY = centerY - totalH/2, cursorY = topY;
        for(var j=0;j<flat.length;j++){
          var it = flat[j], n = it.node, p = it.parent;
          var base = p.x - gapX;
          n.x = Math.round(base - n.w);
          n.y = Math.round(cursorY + (maxH - n.h)/2);
          renderNode(n);
          cursorY += maxH + gapY;
        }
      })();

      // === 上行：親の上 - gapX に下揃え、横等間隔（親Aの子 → 親Bの子…）
      (function layoutTop(){
        var flat = buildBlocks(topArr, 'x');
        if(!flat.length) return;
        var maxW=0; for(var i=0;i<flat.length;i++){ if(flat[i].node.w>maxW) maxW=flat[i].node.w; }
        var totalW = flat.length*maxW + (flat.length-1)*gapY;
        var centerX = rowCenterXFor(flat);
        var leftX = centerX - totalW/2, cursorX = leftX;
        for(var j=0;j<flat.length;j++){
          var it = flat[j], n = it.node, p = it.parent;
          n.y = Math.round(p.y - gapX - n.h);
          n.x = Math.round(cursorX);
          renderNode(n);
          cursorX += maxW + gapY;
        }
      })();

      // === 下行：親の下 + gapX に上揃え、横等間隔（親Aの子 → 親Bの子…）
      (function layoutBottom(){
        var flat = buildBlocks(bottomArr, 'x');
        if(!flat.length) return;
        var maxW=0; for(var i=0;i<flat.length;i++){ if(flat[i].node.w>maxW) maxW=flat[i].node.w; }
        var totalW = flat.length*maxW + (flat.length-1)*gapY;
        var centerX = rowCenterXFor(flat);
        var leftX = centerX - totalW/2, cursorX = leftX;
        for(var j=0;j<flat.length;j++){
          var it = flat[j], n = it.node, p = it.parent;
          n.y = Math.round(p.y + p.h + gapX);
          n.x = Math.round(cursorX);
          renderNode(n);
          cursorX += maxW + gapY;
        }
      })();
    }

    renderEdges(); updateMinimap();

  }

  // ===== Connect mode =====
  var connectBtn = document.getElementById('connectBtn');
  if(connectBtn){
    connectBtn.onclick = function(){
      connectMode.active=!connectMode.active;
      connectMode.from=null;
      connectBtn.classList.toggle('primary', connectMode.active);
    };
    window.addEventListener('keydown', function(e){
      if(e.key==='Escape' && connectMode.active){
        connectMode.active=false; connectMode.from=null; connectBtn.classList.remove('primary');
      }
      if(e.key==='Escape' && drawingEdge){
        if(drawingEdge.pathEl && drawingEdge.pathEl.parentNode){ drawingEdge.pathEl.remove(); }
        drawingEdge=null;
      }
    });
  }
  els.nodes.addEventListener('click', function(e){
    if(!connectMode.active) return;
    var g=e.target.closest ? e.target.closest('.node') : null; if(!g) return;
    var id=g.id.replace('node-','');
    if(!connectMode.from){ connectMode.from=id; clearSelection(); addSelection(id); }
    else{
      if(connectMode.from!==id){ link(connectMode.from, id); renderEdges(); saveAuto(); }
      connectMode.from=null;
    }
  });

  // ===== Node ops =====
  function addRootNode(){ var n = addNode({x:0,y:0,text:'中心テーマ'}); clearSelection(); addSelection(n.id); saveAuto(); }
  function addSiblingTo(id){
    var me = nodes.get(id); if(!me) return;
    if(me.parentIds.size){ var p = setToArray(me.parentIds)[0]; addChildFor(p); }
    else { var sib = addNode({x:me.x, y:me.y+me.h+16, text:'兄弟ノード'}); clearSelection(); addSelection(sib.id); saveAuto(); }
  }

  var addRoot = document.getElementById('addRoot');
  var addChild = document.getElementById('addChild');
  var addSibling = document.getElementById('addSibling');
  var delNodeBtn = document.getElementById('delNode');
  var alignBtn = document.getElementById('alignBtn');
  var delEdgeBtn = document.getElementById('delEdge');

  if(addRoot)   addRoot.onclick   = addRootNode;
  if(addChild)  addChild.onclick  = function(){
    var id = SELECTED_ONE_ID();
    if(!id){ alert('先にノードを選択してください'); return; }
    addChildFor(id);
  };
  if(addSibling)addSibling.onclick= function(){
    var id = SELECTED_ONE_ID();
    if(!id){ alert('先にノードを選択してください'); return; }
    addSiblingTo(id);
  };
  if(delNodeBtn)delNodeBtn.onclick= function(){ deleteSelected(); };
  if(alignBtn)  alignBtn.onclick  = function(){
    var rootId = SELECTED_ONE_ID();
    if(!rootId){ alert('整列したい親ノードを選択してください'); return; }
    layoutSubtree(rootId); saveAuto();
  };
  if(delEdgeBtn) delEdgeBtn.onclick = function(){ deleteSelectedEdges(); };

  function pickFallback(beforeId){
    if(beforeId && nodes.has(beforeId)) return beforeId;
    if(beforeId){
      var b = nodes.get(beforeId);
      if(b && b.parentIds && b.parentIds.size){
        var pid=setToArray(b.parentIds)[0]; if(nodes.has(pid)) return pid;
      }
    }
    var any=null; nodes.forEach(function(n){ if(!any) any=n; });
    return any ? any.id : null;
  }
  function deleteSelected(){
    if(!selectedIds.size) return;
    var ids = setToArray(selectedIds);
    var basis = lastSelectedId || ids[0];
    for(var i=0;i<ids.length;i++){ deleteNode(ids[i]); }
    clearSelection();
    var fb = pickFallback(basis);
    if(fb){ addSelection(fb); }
    renderEdges(); saveAuto();
  }

  // ===== init =====
  function resetAll(){
    nodes.clear();
    edges.splice(0,edges.length);
    els.nodes.innerHTML='';          // ノード群クリア
    els.edges.innerHTML='';          // ★ 矢印（エッジ）もクリア
    clearSelection();
    lastSelectedId = null;
    history.stack = [];              // 履歴も初期化
    history.redo = [];
    scale=1; tx=0; ty=0;
    applyViewport();
    updateMinimap();
    currentName = ''; // ★ リセット
    var nm = document.getElementById('mapName'); if(nm) nm.value = '';
    updateLoadSelect();
  }
  var saveBtn = document.getElementById('saveBtn');
  var loadBtn = document.getElementById('loadBtn');
  var delBtn = document.getElementById('delBtn');
  var newBtn = document.getElementById('newBtn');
  if(saveBtn) saveBtn.onclick = function(){
    var nmEl = document.getElementById('mapName');
    var sel  = document.getElementById('loadSelect');
    // 1) 入力があればそれを優先
    var name = (nmEl && nmEl.value.trim()) || '';
    // 2) 未入力なら loadSelect の選択を採用
    if(!name && sel && sel.value) name = sel.value;
    // 3) それでも空なら currentName を採用
    if(!name && currentName) name = currentName;
    if(!name){ alert('保存名を入力（または既存名を選択）してください'); return; }
    saveAs(name);
  };

  if(loadBtn) loadBtn.onclick = function(){
    var sel=document.getElementById('loadSelect'); 
    if(!sel.value) return; 
    loadFrom(sel.value);
  };

  if(delBtn)  delBtn.onclick  = function(){
    var sel=document.getElementById('loadSelect'); 
    if(!sel.value) return; 
    if(confirm('削除しますか？')){ 
      var name = sel.value;
      deleteSave(name);
      // ★ 削除したのが現在名ならリセット
      if(currentName === name){
        currentName = '';
        var nm = document.getElementById('mapName'); if(nm) nm.value = '';
      }
    }
  };
  if(loadBtn) loadBtn.onclick = function(){ var sel=document.getElementById('loadSelect'); if(!sel.value) return; loadFrom(sel.value); };
  if(delBtn)  delBtn.onclick  = function(){ var sel=document.getElementById('loadSelect'); if(!sel.value) return; if(confirm('削除しますか？')){ deleteSave(sel.value); } };
  if(newBtn) newBtn.onclick = function(){
    if(confirm('現在の編集内容は保存されている必要があります。空のキャンバスにしますか？')) resetAll();
  };

  updateLoadSelect(); centerView();
  if(nodes.size===0){ var n=addNode({x:-80,y:-20,text:'中心テーマ'}); clearSelection(); addSelection(n.id); }
  renderEdges(); applyViewport();
  history.stack.push(snapshot());
})();
