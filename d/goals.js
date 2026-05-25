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

  // ★ 詳細パネルの左下にアーカイブボタンを動的生成
  const dpFooter = els.dpClose.parentElement;
  const dpArchiveBtn = document.createElement('button');
  dpArchiveBtn.className = 'btn';
  dpArchiveBtn.style.marginRight = 'auto';
  dpArchiveBtn.style.background = '#f8fafc';
  dpArchiveBtn.style.border = '1px solid #cbd5e1';
  dpArchiveBtn.style.color = '#475569';
  dpArchiveBtn.style.fontWeight = 'bold';
  dpArchiveBtn.textContent = '📦 アーカイブ';
  dpFooter.insertBefore(dpArchiveBtn, dpFooter.firstChild);
  els.dpArchive = dpArchiveBtn;

  // --- Utility ---
  function uid() { return 'i_' + Math.random().toString(36).slice(2, 9); }
  function loadData() { try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch(e) { return null; } }
  function saveData() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(e) {} }
  function formatDate(dStr) {
    if(!dStr) return '-';
    const [y,m,d] = dStr.split('-'); return `${m}/${d}`;
  }
  function todayYMD() {
    const d = new Date(); 
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

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
          parent.doneAt = todayYMD(); 
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
    const activeIssues = state.issues.filter(i => !i.isArchived);
    activeIssues.forEach(iss => { map[iss.id] = { ...iss, children: [], isOpen: iss.isOpen !== false }; });
    activeIssues.forEach(iss => {
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
      doneAt: null,
      isArchived: false
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
    
    const activeIssues = state.issues.filter(i => !i.isArchived);

    keys.forEach(k => {
      const st = STATUSES[k];
      const items = activeIssues.filter(i => i.status === k);
      
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

  // ★ アーカイブ実行処理
  els.dpArchive.onclick = () => {
    if(!activeIssueId) return;
    const iss = getIssue(activeIssueId);
    if(!iss) return;

    if(!confirm('この課題をアーカイブしますか？\n（ボードからは非表示になりますが、アーカイブ一覧からいつでも復元できます）')) return;

    const archiveCascade = (parentId) => {
      state.issues.filter(i => i.parentId === parentId).forEach(c => {
        c.isArchived = true;
        archiveCascade(c.id);
      });
    };

    iss.isArchived = true;
    archiveCascade(iss.id);
    
    saveData();
    closeDetail();
    render();
  };

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


  // =========================================================
  // ★ アーカイブ一覧のアコーディオン化（レイアウトを美しく3分割）
  // =========================================================
  const archiveModal = document.createElement('div');
  archiveModal.style.cssText = "display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); z-index:9999; justify-content:center; align-items:center;";
  archiveModal.innerHTML = `
    <div style="background:#fff; width:90%; max-width:600px; height:85vh; border-radius:8px; display:flex; flex-direction:column; box-shadow:0 4px 12px rgba(0,0,0,0.15);">
      <div style="padding:16px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
        <h2 style="margin:0; font-size:16px;">📦 アーカイブ済み目標・課題</h2>
        <button id="closeArchiveModal" style="background:none; border:none; font-size:20px; cursor:pointer;">&times;</button>
      </div>
      <div id="archiveListBody" style="padding:16px; overflow-y:auto; flex:1; background:#f8fafc;"></div>
    </div>
  `;
  document.body.appendChild(archiveModal);

  const closeArchiveModal = document.getElementById('closeArchiveModal');
  const archiveListBody = document.getElementById('archiveListBody');
  
  closeArchiveModal.onclick = () => archiveModal.style.display = 'none';
  archiveModal.onclick = (e) => { if(e.target === archiveModal) archiveModal.style.display = 'none'; };

  const header = document.querySelector('header');
  const viewTabs = document.getElementById('viewTabs');
  const addBtn = document.getElementById('addRootTaskBtn');
  
  if (header && viewTabs && addBtn) {
    // ★ 変更：ヘッダーを「左(タイトル)・中央(タブ＋新規)・右(アーカイブ)」の3ブロックに整理
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';

    // 1. 左側（タイトル）
    const title = header.querySelector('h1') || header.firstElementChild;
    if (title) {
      title.style.flex = '1';
      title.style.margin = '0';
      title.style.textAlign = 'left';
    }

    // 2. 中央（ビュー切り替えタブ ＋ 新規課題ボタン）
    const centerWrap = document.createElement('div');
    centerWrap.style.flex = '1';
    centerWrap.style.display = 'flex';
    centerWrap.style.justifyContent = 'center';
    centerWrap.style.alignItems = 'center';
    centerWrap.style.gap = '12px'; // ボタン同士の間隔

    // 要素を移動
    viewTabs.style.margin = '0'; // 既存のマージンをリセット
    addBtn.style.margin = '0';
    centerWrap.appendChild(viewTabs);
    centerWrap.appendChild(addBtn);
    header.appendChild(centerWrap);

    // 3. 右側（アーカイブ一覧ボタン）
    const rightWrap = document.createElement('div');
    rightWrap.style.flex = '1';
    rightWrap.style.display = 'flex';
    rightWrap.style.justifyContent = 'flex-end';

    const openArchiveBtn = document.createElement('button');
    openArchiveBtn.textContent = '📦 アーカイブ一覧';
    openArchiveBtn.style.padding = '6px 12px';
    openArchiveBtn.style.border = '1px solid #cbd5e1';
    openArchiveBtn.style.background = '#f8fafc';
    openArchiveBtn.style.borderRadius = '6px';
    openArchiveBtn.style.cursor = 'pointer';
    openArchiveBtn.style.color = '#334155';
    openArchiveBtn.style.fontWeight = 'bold';
    openArchiveBtn.style.transition = '0.2s';
    
    openArchiveBtn.onmouseover = () => openArchiveBtn.style.background = '#e2e8f0';
    openArchiveBtn.onmouseout = () => openArchiveBtn.style.background = '#f8fafc';

    openArchiveBtn.onclick = () => {
      archiveModal.style.display = 'flex';
      renderArchiveList();
    };
    
    rightWrap.appendChild(openArchiveBtn);
    header.appendChild(rightWrap);
  }
  
  function renderArchiveList() {
    const archived = state.issues.filter(i => i.isArchived);
    if (archived.length === 0) {
      archiveListBody.innerHTML = '<div style="color:#64748b; font-size:13px; text-align:center; padding:20px;">アーカイブされた課題はありません</div>';
      return;
    }
    
    // 親タスクのみを抽出
    const rootArchived = archived.filter(i => !i.parentId || !archived.some(p => p.id === i.parentId));

    rootArchived.sort((a, b) => {
      const da = a.doneAt || a.dueDate || '';
      const db = b.doneAt || b.dueDate || '';
      return db.localeCompare(da);
    });

    let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
    
    rootArchived.forEach(iss => {
      const st = STATUSES[iss.status] || STATUSES.todo;
      const dateStr = iss.doneAt ? `完了日: ${formatDate(iss.doneAt)}` : (iss.dueDate ? `期限日: ${formatDate(iss.dueDate)}` : '日付未定');
      
      const getChildren = (parentId) => archived.filter(i => i.parentId === parentId);
      const children = getChildren(iss.id);
      
      const descHtml = iss.description ? `<div style="font-size:13px; color:#475569; margin-bottom:8px; white-space:pre-wrap; background:#f1f5f9; padding:8px; border-radius:4px;">${escapeHtml(iss.description)}</div>` : '';
      
      let childrenHtml = '';
      if (children.length > 0) {
         childrenHtml += `<div style="font-size:13px; font-weight:bold; margin-bottom:4px; color:#334155;">子タスク:</div><ul style="margin:0 0 8px 0; padding-left:20px; font-size:13px; color:#475569;">`;
         const renderChild = (child) => {
           const cSt = STATUSES[child.status] || STATUSES.todo;
           let cHtml = `<li><span style="color:${cSt.colorCls === 'st-done' ? '#10b981' : (cSt.colorCls === 'st-omit' ? '#f43f5e' : '#3b82f6')};">■</span> ${escapeHtml(child.title)}</li>`;
           const subChildren = getChildren(child.id);
           if (subChildren.length > 0) {
             cHtml += `<ul style="margin:2px 0 2px 0; padding-left:16px;">`;
             subChildren.forEach(sc => { cHtml += renderChild(sc); });
             cHtml += `</ul>`;
           }
           return cHtml;
         };
         children.forEach(c => { childrenHtml += renderChild(c); });
         childrenHtml += `</ul>`;
      }

      html += `
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; overflow:hidden;">
          <div onclick="toggleArchiveDetail('${iss.id}')" style="padding:12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; background:#f8fafc; transition:0.2s;">
            <div>
              <div style="font-weight:bold; font-size:14px; margin-bottom:4px;">
                <span style="color:${st.colorCls === 'st-done' ? '#10b981' : (st.colorCls === 'st-omit' ? '#f43f5e' : '#3b82f6')}; font-size:12px; margin-right:4px;">[${st.label}]</span>
                ${escapeHtml(iss.title)}
              </div>
              <div style="font-size:12px; color:#64748b;">${dateStr}</div>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <button class="btn" onclick="event.stopPropagation(); restoreArchive('${iss.id}')" style="background:#3b82f6; color:#fff; border:none; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer;">ボードへ復元</button>
              <span id="icon-toggle-${iss.id}" style="color:#94a3b8; font-size:16px; width:20px; text-align:center;">▼</span>
            </div>
          </div>
          <div id="detail-${iss.id}" style="display:none; padding:12px; border-top:1px solid #e2e8f0;">
            ${descHtml}
            ${childrenHtml}
            ${(!iss.description && children.length === 0) ? '<div style="font-size:13px; color:#94a3b8;">詳細内容や子タスクはありません。</div>' : ''}
          </div>
        </div>
      `;
    });
    html += '</div>';
    archiveListBody.innerHTML = html;
  }

  window.toggleArchiveDetail = function(id) {
    const el = document.getElementById('detail-' + id);
    const icon = document.getElementById('icon-toggle-' + id);
    if(el.style.display === 'none') {
      el.style.display = 'block';
      icon.textContent = '▲';
    } else {
      el.style.display = 'none';
      icon.textContent = '▼';
    }
  };

  window.restoreArchive = function(id) {
    if(!confirm('この課題を復元してボードに戻しますか？')) return;
    const issue = getIssue(id);
    if(issue) {
      issue.isArchived = false;
      const restoreCascade = (parentId) => {
        state.issues.filter(i => i.parentId === parentId).forEach(c => {
          c.isArchived = false;
          restoreCascade(c.id);
        });
      };
      restoreCascade(id);
      
      const restoreParent = (child) => {
        if(child.parentId) {
          const parent = getIssue(child.parentId);
          if(parent && parent.isArchived) {
            parent.isArchived = false;
            restoreParent(parent);
          }
        }
      };
      restoreParent(issue);
      
      saveData();
      renderArchiveList();
      render();
    }
  };

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