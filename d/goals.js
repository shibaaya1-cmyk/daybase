(function () {
  'use strict';

  const LS_KEY = 'D_BACKLOG_V1';

  // --- ステータス定義 ---
  const STATUSES = {
    todo:   { id: 'todo',   label: '未着手', colorCls: 'st-todo' },
    doing:  { id: 'doing',  label: '対応中', colorCls: 'st-doing' },
    review: { id: 'review', label: '確認中', colorCls: 'st-review' },
    done:   { id: 'done',   label: '完了',   colorCls: 'st-done' },
    omit:   { id: 'omit',   label: 'オミット',colorCls: 'st-omit' }
  };

  // --- 状態管理 ---
  let state = loadData() || { issues: [] };
  let currentView = 'tree'; 
  let activeIssueId = null;
  
  // ガントチャート用
  let ganttBaseDate = new Date(); 
  ganttBaseDate.setDate(1);
  ganttBaseDate.setHours(0,0,0,0);

  // --- DOM Elements ---
  const els = {
    tabs: document.querySelectorAll('#viewTabs button'),
    views: {
      tree: document.getElementById('view-tree'),
      board: document.getElementById('view-board'),
      gantt: document.getElementById('view-gantt')
    },
    addRootBtn: document.getElementById('addRootTaskBtn'),
    
    treeBody: document.getElementById('treeBody'),
    boardWrap: document.getElementById('boardWrap'),
    
    gPrev: document.getElementById('ganttPrev'),
    gNext: document.getElementById('ganttNext'),
    gToday: document.getElementById('ganttToday'),
    gLabel: document.getElementById('ganttMonthLabel'),
    gTitles: document.getElementById('ganttTitles'),
    gGrid: document.getElementById('ganttGrid'),
    gBars: document.getElementById('ganttBars'),
    gScroll: document.getElementById('ganttScrollArea'),

    dp: document.getElementById('detail-panel'),
    dpClose: document.getElementById('dpClose'),
    dpTitle: document.getElementById('dpTitle'),
    dpStatus: document.getElementById('dpStatus'),
    dpStart: document.getElementById('dpStart'),
    dpDue: document.getElementById('dpDue'),
    dpSyncTodo: document.getElementById('dpSyncTodo'),
    dpDesc: document.getElementById('dpDesc'),
    dpNewCom: document.getElementById('dpNewComment'),
    dpAddCom: document.getElementById('dpAddComment'),
    dpComList: document.getElementById('dpCommentsList'),
    dpDel: document.getElementById('dpDelete')
  };

  // --- Utility ---
  function uid() { return 'i_' + Math.random().toString(36).slice(2, 9); }
  function loadData() { try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch(e) { return null; } }
  function saveData() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(e) {} }
  function formatDate(dStr) {
    if(!dStr) return '-';
    const [y,m,d] = dStr.split('-'); return `${m}/${d}`;
  }
  function todayYMD() {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function updateParent(parentId) {
    if (!parentId) return;
    const parent = state.issues.find(i => i.id === parentId);
    if (!parent) return;

    const children = state.issues.filter(i => i.parentId === parentId);
    if (children.length > 0) {
      let minStart = null, maxDue = null;
      let hasStart = false, hasDue = false;

      children.forEach(c => {
        if (c.startDate) {
          hasStart = true;
          if (!minStart || c.startDate < minStart) minStart = c.startDate;
        }
        if (c.dueDate) {
          hasDue = true;
          if (!maxDue || c.dueDate > maxDue) maxDue = c.dueDate;
        }
      });

      if (hasStart) parent.startDate = minStart;
      if (hasDue) parent.dueDate = maxDue;

      const hasDoing = children.some(c => c.status === 'doing');
      const hasReview = children.some(c => c.status === 'review');
      const hasDone = children.some(c => c.status === 'done');
      const hasTodo = children.some(c => c.status === 'todo');
      const allOmit = children.every(c => c.status === 'omit');

      if (allOmit) {
        parent.status = 'omit';
        parent.doneAt = null;
      } else if (!hasTodo && !hasDoing && !hasReview) {
        if (parent.status !== 'done') {
           parent.status = 'done';
           parent.doneAt = todayYMD(); // ★ 完了日を自動記録
        }
      } else if (hasDoing || hasReview || hasDone) {
        parent.status = 'doing';
        parent.doneAt = null;
      } else {
        parent.status = 'todo';
        parent.doneAt = null;
      }
    }

    if (parent.parentId) {
      updateParent(parent.parentId);
    }
  }

  function buildTree() {
    const map = {};
    const roots = [];
    state.issues.forEach(iss => { map[iss.id] = { ...iss, children: [], isOpen: iss.isOpen !== false }; });
    state.issues.forEach(iss => {
      if (iss.parentId && map[iss.parentId]) {
        map[iss.parentId].children.push(map[iss.id]);
      } else {
        roots.push(map[iss.id]);
      }
    });
    return roots;
  }

  function getIssue(id) { return state.issues.find(i => i.id === id); }
  
  function addIssue(parentId = null) {
    const title = prompt('課題名を入力してください', '新しい課題');
    if(!title) return;
    const newIss = {
      id: uid(), parentId: parentId, title: title.trim(), description: '',
      status: 'todo', startDate: '', dueDate: '', syncTodo: false, comments: [], isOpen: true,
      doneAt: null // ★ 初期値として完了日を空でセット
    };
    state.issues.push(newIss);
    saveData(); render();
  }

  function deleteIssue(id) {
    if(!confirm('この課題を削除しますか？\n（子課題もすべて削除されます）')) return;
    const iss = getIssue(id);
    const pId = iss ? iss.parentId : null;

    const toDelete = new Set([id]);
    let added = true;
    while(added) {
      added = false;
      state.issues.forEach(iss => {
        if(iss.parentId && toDelete.has(iss.parentId) && !toDelete.has(iss.id)) {
          toDelete.add(iss.id); added = true;
        }
      });
    }
    state.issues = state.issues.filter(iss => !toDelete.has(iss.id));
    
    if (pId) updateParent(pId);

    if(activeIssueId === id) closeDetail();
    saveData(); render();
  }

  function render() {
    if(currentView === 'tree') renderTree();
    if(currentView === 'board') renderBoard();
    if(currentView === 'gantt') renderGantt();
  }

  function renderTree() {
    els.treeBody.innerHTML = '';
    const roots = buildTree();
    
    function drawNode(node, depth) {
      const tr = document.createElement('tr');
      tr.className = 'tree-row' + (node.id === activeIssueId ? ' active' : '');
      tr.onclick = () => openDetail(node.id);

      const st = STATUSES[node.status] || STATUSES.todo;
      const hasChild = node.children.length > 0;
      
      let html = `
        <td>
          <div class="t-title-col" style="padding-left: ${depth * 20}px;">
            <span class="t-toggle" data-id="${node.id}">${hasChild ? (node.isOpen ? '▼' : '▶') : ' '}</span>
            <span style="font-weight:${depth===0?'600':'400'}">${node.title}</span>
            <button class="t-add-sub" data-id="${node.id}" title="子課題を追加">＋</button>
          </div>
        </td>
        <td><span class="st-badge ${st.colorCls}">${st.label}</span></td>
        <td>${formatDate(node.startDate)}</td>
        <td>${formatDate(node.dueDate)}</td>
        <td>${node.syncTodo ? '📅' : ''}</td>
      `;
      tr.innerHTML = html;

      tr.querySelector('.t-add-sub').onclick = (e) => { e.stopPropagation(); addIssue(node.id); };
      const tgl = tr.querySelector('.t-toggle');
      if(hasChild) {
        tgl.onclick = (e) => {
          e.stopPropagation();
          const i = getIssue(node.id); if(i){ i.isOpen = !i.isOpen; saveData(); renderTree(); }
        };
      }
      els.treeBody.appendChild(tr);

      if(node.isOpen) {
        node.children.forEach(c => drawNode(c, depth + 1));
      }
    }
    
    if(roots.length === 0) {
      els.treeBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:20px;">課題がありません。「＋ 新規課題」から追加してください。</td></tr>';
    } else {
      roots.forEach(r => drawNode(r, 0));
    }
  }

  function renderBoard() {
    els.boardWrap.innerHTML = '';
    const keys = Object.keys(STATUSES);
    
    keys.forEach(k => {
      const st = STATUSES[k];
      const items = state.issues.filter(i => i.status === k);
      
      const col = document.createElement('div');
      col.className = 'board-col';
      col.innerHTML = `
        <div class="board-col-head ${st.colorCls}">
          <span>${st.label}</span>
          <span class="col-count">${items.length}</span>
        </div>
        <div class="board-cards" data-status="${k}"></div>
      `;
      
      const cardsWrap = col.querySelector('.board-cards');
      
      cardsWrap.ondragover = e => { e.preventDefault(); cardsWrap.classList.add('drag-over'); };
      cardsWrap.ondragleave = () => cardsWrap.classList.remove('drag-over');
      cardsWrap.ondrop = e => {
        e.preventDefault(); cardsWrap.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain');
        const iss = getIssue(id);
        if(iss && iss.status !== k) {
          iss.status = k;
          // ★ ドラッグ＆ドロップでステータスが変わった時の完了日記録
          if (k === 'done') iss.doneAt = todayYMD();
          else iss.doneAt = null;

          if (iss.parentId) updateParent(iss.parentId);
          saveData(); renderBoard();
          if(activeIssueId === id) updateDetailView(id); 
        }
      };

      items.forEach(iss => {
        const card = document.createElement('div');
        card.className = 'b-card';
        card.draggable = true;
        card.ondragstart = e => {
          e.dataTransfer.setData('text/plain', iss.id);
          setTimeout(() => card.classList.add('dragging'), 0);
        };
        card.ondragend = () => card.classList.remove('dragging');
        card.onclick = () => openDetail(iss.id);
        
        let metaHtml = `<span>`;
        if(iss.syncTodo) metaHtml += `📅 `;
        metaHtml += `${formatDate(iss.startDate)} ~ ${formatDate(iss.dueDate)}</span>`;
        if(iss.comments.length > 0) metaHtml += `<span>💬 ${iss.comments.length}</span>`;

        card.innerHTML = `
          <div class="b-card-title">${iss.title}</div>
          <div class="b-card-meta">${metaHtml}</div>
        `;
        cardsWrap.appendChild(card);
      });
      
      els.boardWrap.appendChild(col);
    });
  }

  function renderGantt() {
    const y = ganttBaseDate.getFullYear();
    const m = ganttBaseDate.getMonth();
    els.gLabel.textContent = `${y}年 ${m+1}月`;

    const dStart = new Date(y, m, 1);
    const dEnd = new Date(y, m + 1, 0);
    const daysInMonth = dEnd.getDate();

    els.gGrid.innerHTML = '';
    const todayStr = todayYMD();
    for(let d=1; d<=daysInMonth; d++) {
      const curStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday = curStr === todayStr;
      
      const col = document.createElement('div');
      col.className = 'g-col' + (isToday ? ' is-today' : '');
      col.innerHTML = `<div class="g-col-date">${d}</div>`;
      els.gGrid.appendChild(col);
    }

    const flatList = [];
    function flatten(nodes, depth) {
      nodes.forEach(n => {
        flatList.push({ node: n, depth });
        if(n.isOpen && n.children.length) flatten(n.children, depth + 1);
      });
    }
    flatten(buildTree(), 0);

    els.gTitles.innerHTML = '';
    els.gBars.innerHTML = '';
    const colWidth = 100 / daysInMonth; 

    flatList.forEach((item, idx) => {
      const n = item.node;
      const tRow = document.createElement('div');
      tRow.className = 'g-row';
      tRow.style.paddingLeft = (10 + item.depth * 16) + 'px';
      tRow.textContent = n.title;
      tRow.onclick = () => openDetail(n.id);
      els.gTitles.appendChild(tRow);

      const bWrap = document.createElement('div');
      bWrap.className = 'g-bar-wrap';
      bWrap.style.top = (idx * 32) + 'px';
      bWrap.style.width = '100%';

      if (n.startDate || n.dueDate) {
        let sDate = n.startDate ? new Date(n.startDate) : new Date(n.dueDate);
        let eDate = n.dueDate ? new Date(n.dueDate) : new Date(n.startDate);
        
        if(eDate >= dStart && sDate <= dEnd) {
          const s = sDate < dStart ? dStart : sDate;
          const e = eDate > dEnd ? dEnd : eDate;
          
          const startOffsetDays = Math.max(0, (s - dStart) / 86400000);
          const durationDays = Math.max(1, (e - s) / 86400000 + 1);
          
          const bar = document.createElement('div');
          bar.className = `g-bar ${STATUSES[n.status].colorCls}`;
          bar.style.left = (startOffsetDays * colWidth) + '%';
          bar.style.width = (durationDays * colWidth) + '%';
          bar.title = `${n.title}\n${formatDate(n.startDate)} ~ ${formatDate(n.dueDate)}`;
          bar.onclick = () => openDetail(n.id);
          
          bWrap.appendChild(bar);
        }
      }
      els.gBars.appendChild(bWrap);
    });
  }

  function openDetail(id) {
    activeIssueId = id;
    updateDetailView(id);
    els.dp.classList.add('open');
    render();
  }
  function closeDetail() {
    activeIssueId = null;
    els.dp.classList.remove('open');
    render();
  }

  function updateDetailView(id) {
    const iss = getIssue(id);
    if(!iss) return closeDetail();

    els.dpTitle.value = iss.title;
    els.dpStatus.value = iss.status;
    els.dpStart.value = iss.startDate || '';
    els.dpDue.value = iss.dueDate || '';
    els.dpSyncTodo.checked = !!iss.syncTodo;
    els.dpDesc.value = iss.description || '';

    els.dpComList.innerHTML = '';
    if(iss.comments.length === 0) {
      els.dpComList.innerHTML = '<div style="font-size:11px;color:#94a3b8;">メモはまだありません。</div>';
    } else {
      [...iss.comments].reverse().forEach(c => {
        const dStr = new Date(c.createdAt).toLocaleString('ja-JP', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
        els.dpComList.innerHTML += `
          <div class="comment-item">
            <div class="comment-meta"><span>進捗メモ</span><span>${dStr}</span></div>
            <div class="comment-text">${c.text}</div>
          </div>
        `;
      });
    }
  }

  const syncSave = () => {
    if(!activeIssueId) return;
    const iss = getIssue(activeIssueId);
    if(!iss) return;
    iss.title = els.dpTitle.value.trim() || '無題';

    // ★ ステータスの変更を検知して完了日を記録・リセット
    const newStatus = els.dpStatus.value;
    if (iss.status !== newStatus) {
      if (newStatus === 'done') iss.doneAt = todayYMD();
      else iss.doneAt = null;
      iss.status = newStatus;
    }

    iss.startDate = els.dpStart.value;
    iss.dueDate = els.dpDue.value;
    iss.syncTodo = els.dpSyncTodo.checked;
    iss.description = els.dpDesc.value;
    
    if(iss.syncTodo) {
      function syncChildren(parentId) {
        state.issues.filter(i => i.parentId === parentId).forEach(c => {
          c.syncTodo = true; syncChildren(c.id);
        });
      }
      syncChildren(iss.id);
    }

    if (iss.parentId) updateParent(iss.parentId); 

    saveData(); render();
  };

  els.dpTitle.addEventListener('input', syncSave);
  els.dpStatus.addEventListener('change', syncSave);
  els.dpStart.addEventListener('change', syncSave);
  els.dpDue.addEventListener('change', syncSave);
  els.dpSyncTodo.addEventListener('change', syncSave);
  els.dpDesc.addEventListener('input', syncSave);

  els.dpAddCom.onclick = () => {
    const text = els.dpNewCom.value.trim();
    if(!text || !activeIssueId) return;
    const iss = getIssue(activeIssueId);
    iss.comments.push({ id: uid(), text: text, createdAt: Date.now() });
    els.dpNewCom.value = '';
    saveData(); updateDetailView(activeIssueId); render();
  };

  els.dpDel.onclick = () => deleteIssue(activeIssueId);
  els.dpClose.onclick = closeDetail;

  els.tabs.forEach(btn => {
    btn.onclick = () => {
      els.tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      
      document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
      document.getElementById(`view-${currentView}`).classList.add('active');
      render();
    };
  });

  els.addRootBtn.onclick = () => addIssue(null);

  els.gPrev.onclick = () => { ganttBaseDate.setMonth(ganttBaseDate.getMonth() - 1); renderGantt(); };
  els.gNext.onclick = () => { ganttBaseDate.setMonth(ganttBaseDate.getMonth() + 1); renderGantt(); };
  els.gToday.onclick = () => { 
    ganttBaseDate = new Date(); ganttBaseDate.setDate(1); ganttBaseDate.setHours(0,0,0,0); renderGantt();
    setTimeout(() => {
      const todayCol = document.querySelector('.g-col.is-today');
      if(todayCol) els.gScroll.scrollLeft = todayCol.offsetLeft - els.gScroll.clientWidth/2;
    }, 50);
  };

  // 外部からのデータ更新を検知
  window.addEventListener('storage', e => {
    if (e.key === LS_KEY) {
      state = loadData() || { issues: [] };
      render();
    }
  });

  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'todo:saved') {
      state = loadData() || { issues: [] };
      render();
    }
  });

  render();
})();