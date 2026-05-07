(function () {
  'use strict';

  const LS_KEY = 'D_MEMO_CAT_V1';

  const el = {
    folderList: document.getElementById('folderList'),
    addFolderBtn: document.getElementById('addFolderBtn'),
    tabBar: document.getElementById('tabBar'),
    editorWrap: document.getElementById('editorWrap'),
    noSelection: document.getElementById('noSelection'),
    memoTitle: document.getElementById('memoTitle'),
    memoContent: document.getElementById('memoContent')
  };

  let state = loadData() || {
    folders: [
      { id: 'f_default', parentId: null, name: '一般', memos: [], isOpen: true }
    ],
    memos: {},
    activeFolderId: 'f_default',
    activeMemoId: null
  };

  state.folders.forEach(f => {
    if (f.parentId === undefined) f.parentId = null;
    if (f.isOpen === undefined) f.isOpen = true;
  });

  function uid() { return 'm_' + Math.random().toString(36).slice(2, 9); }
  function loadData() { try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { return null; } }
  function saveData() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { } }

  // 再帰的削除
  function deleteFolderRecursive(folderId) {
    const children = state.folders.filter(f => f.parentId === folderId);
    children.forEach(child => deleteFolderRecursive(child.id));

    const folder = state.folders.find(f => f.id === folderId);
    if (folder) {
      folder.memos.forEach(mid => delete state.memos[mid]); 
      state.folders = state.folders.filter(f => f.id !== folderId); 
    }
  }

  // メモの移動
  function moveMemoToFolder(memoId, targetFolderId) {
    const memo = state.memos[memoId];
    if (!memo || memo.folderId === targetFolderId) return;

    const oldFolder = state.folders.find(f => f.id === memo.folderId);
    if (oldFolder) oldFolder.memos = oldFolder.memos.filter(id => id !== memoId);

    const newFolder = state.folders.find(f => f.id === targetFolderId);
    if (newFolder) {
      newFolder.memos.push(memoId);
      memo.folderId = targetFolderId;
    }

    if (state.activeFolderId !== targetFolderId && state.activeMemoId === memoId) {
      state.activeMemoId = oldFolder.memos.length > 0 ? oldFolder.memos[0] : null;
    }
    saveData(); render();
  }

  // 循環参照のチェック
  function isDescendant(checkFolderId, targetParentId) {
    if (checkFolderId === targetParentId) return true; // 自分自身
    let current = state.folders.find(f => f.id === targetParentId);
    while (current && current.parentId !== null) {
      if (current.parentId === checkFolderId) return true;
      current = state.folders.find(f => f.id === current.parentId);
    }
    return false;
  }

  // フォルダの移動
  function moveFolder(folderId, targetParentId) {
    if (folderId === targetParentId) return; // 同じ場所
    if (targetParentId !== null && isDescendant(folderId, targetParentId)) {
      alert('親フォルダを自分の子フォルダの中に移動することはできません。');
      return;
    }
    const folder = state.folders.find(f => f.id === folderId);
    if (folder) {
      folder.parentId = targetParentId;
      saveData(); render();
    }
  }

  // ─────────────────────────────
  // 描画ロジック
  // ─────────────────────────────
  function render() {
    renderFolders();
    renderTabs();
    renderEditor();
  }

  function renderFolders() {
    el.folderList.innerHTML = '';

    function buildTree(parentId, depth) {
      const children = state.folders.filter(f => f.parentId === parentId);
      
      children.forEach(f => {
        const hasChildren = state.folders.some(xf => xf.parentId === f.id);
        const div = document.createElement('div');
        div.className = 'folder-item' + (f.id === state.activeFolderId ? ' active' : '');
        div.style.paddingLeft = `${8 + depth * 16}px`;

        div.draggable = true;
        div.ondragstart = (e) => {
          e.stopPropagation();
          e.dataTransfer.setData('text/plain', 'folder:' + f.id);
          e.dataTransfer.effectAllowed = 'move';
          setTimeout(() => div.classList.add('dragging'), 0);
        };
        div.ondragend = () => { div.classList.remove('dragging'); };

        div.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); div.classList.add('drag-over'); };
        div.ondragleave = (e) => { e.stopPropagation(); div.classList.remove('drag-over'); };
        div.ondrop = (e) => {
          e.preventDefault();
          e.stopPropagation();
          div.classList.remove('drag-over');
          
          const data = e.dataTransfer.getData('text/plain');
          if (data.startsWith('memo:')) {
            moveMemoToFolder(data.replace('memo:', ''), f.id);
          } else if (data.startsWith('folder:')) {
            moveFolder(data.replace('folder:', ''), f.id);
            f.isOpen = true;
            saveData(); render();
          }
        };

        const toggle = document.createElement('span');
        toggle.className = 'f-toggle';
        toggle.style.visibility = hasChildren ? 'visible' : 'hidden';
        toggle.textContent = f.isOpen ? '▼' : '▶';
        toggle.onclick = (e) => {
          e.stopPropagation();
          f.isOpen = !f.isOpen;
          saveData(); renderFolders();
        };

        const nameSpan = document.createElement('span');
        nameSpan.className = 'f-name';
        nameSpan.textContent = f.name;

        const ctrls = document.createElement('div');
        ctrls.className = 'f-ctrls';

        const addSubBtn = document.createElement('span');
        addSubBtn.className = 'f-btn';
        addSubBtn.innerHTML = '＋';
        addSubBtn.title = '子フォルダを作成';
        addSubBtn.onclick = (e) => {
          e.stopPropagation();
          const newName = prompt('子フォルダ名', '新しいフォルダ');
          if (newName && newName.trim()) {
            state.folders.push({ id: uid(), parentId: f.id, name: newName.trim(), memos: [], isOpen: true });
            f.isOpen = true;
            saveData(); render();
          }
        };

        const renameBtn = document.createElement('span');
        renameBtn.className = 'f-btn';
        renameBtn.innerHTML = '✎';
        renameBtn.title = '名前を変更';
        renameBtn.onclick = (e) => {
          e.stopPropagation();
          const newName = prompt('フォルダ名を変更', f.name);
          if (newName && newName.trim()) {
            f.name = newName.trim();
            saveData(); render();
          }
        };

        const delBtn = document.createElement('span');
        delBtn.className = 'f-btn';
        delBtn.textContent = '×';
        delBtn.title = 'フォルダ削除';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          if (!confirm(`フォルダ「${f.name}」を削除しますか？\n※中のサブフォルダとメモもすべて削除されます。`)) return;
          deleteFolderRecursive(f.id);
          const activeStillExists = state.folders.some(xf => xf.id === state.activeFolderId);
          if (!activeStillExists) {
            state.activeFolderId = state.folders.length > 0 ? state.folders[0].id : null;
            state.activeMemoId = null;
          }
          saveData(); render();
        };

        div.onclick = (e) => {
          e.stopPropagation();
          state.activeFolderId = f.id;
          const folder = state.folders.find(xf => xf.id === f.id);
          if (folder && folder.memos.length > 0) {
            if (!folder.memos.includes(state.activeMemoId)) {
              state.activeMemoId = folder.memos[0];
            }
          } else {
            state.activeMemoId = null;
          }
          saveData(); render();
        };

        div.appendChild(toggle);
        div.appendChild(nameSpan);
        ctrls.appendChild(addSubBtn);
        ctrls.appendChild(renameBtn);
        ctrls.appendChild(delBtn);
        div.appendChild(ctrls);
        el.folderList.appendChild(div);

        if (f.isOpen) buildTree(f.id, depth + 1);
      });
    }

    buildTree(null, 0);
  }

  function renderTabs() {
    el.tabBar.innerHTML = '';
    if (!state.activeFolderId) return;

    const folder = state.folders.find(f => f.id === state.activeFolderId);
    if (!folder) return;

    folder.memos.forEach(mid => {
      const memo = state.memos[mid];
      if (!memo) return;

      const tab = document.createElement('div');
      tab.className = 'tab' + (mid === state.activeMemoId ? ' active' : '');
      
      // ─── ★ メモのドラッグ（並べ替え・移動両対応） ───
      tab.draggable = true;
      tab.ondragstart = (e) => {
        e.dataTransfer.setData('text/plain', 'memo:' + mid);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => tab.classList.add('dragging'), 0);
      };
      
      tab.ondragend = () => {
        tab.classList.remove('dragging');
        // 他のタブに残ったガイドラインをすべて消去
        el.tabBar.querySelectorAll('.tab').forEach(t => t.classList.remove('drag-over-left', 'drag-over-right'));
      };

      // ★ 他のタブが重なってきたときの処理（並べ替えのガイドライン表示）
      tab.ondragover = (e) => {
        const types = e.dataTransfer.types || [];
        if (!types.includes('text/plain')) return; // ファイルなどは無視
        
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // マウスがタブの左半分にあるか右半分にあるかでガイドラインを切り替え
        const rect = tab.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        if (e.clientX < midX) {
          tab.classList.add('drag-over-left');
          tab.classList.remove('drag-over-right');
        } else {
          tab.classList.add('drag-over-right');
          tab.classList.remove('drag-over-left');
        }
      };

      tab.ondragleave = () => {
        tab.classList.remove('drag-over-left', 'drag-over-right');
      };

      // ★ ドロップされた時の並べ替え処理
      tab.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation(); // サイドバーなどのドロップ発火を防ぐ
        tab.classList.remove('drag-over-left', 'drag-over-right');
        
        const data = e.dataTransfer.getData('text/plain');
        if (data.startsWith('memo:')) {
          const dragId = data.replace('memo:', '');
          if (dragId === mid) return; // 自分自身には落とせない

          // 同じフォルダ内での順番入れ替え
          if (folder.memos.includes(dragId)) {
            // まず元の位置から削除
            const oldIdx = folder.memos.indexOf(dragId);
            folder.memos.splice(oldIdx, 1);

            // 挿入先のインデックスを再計算
            let newIdx = folder.memos.indexOf(mid);
            const rect = tab.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;
            
            // 右半分に落としたら、その後ろに挿入
            if (e.clientX >= midX) {
              newIdx += 1;
            }

            folder.memos.splice(newIdx, 0, dragId);
            saveData(); 
            renderTabs(); // タブだけ再描画してスムーズに反映
          }
        }
      };

      const tName = document.createElement('span');
      tName.className = 't-name';
      tName.textContent = memo.title || '無題のメモ';

      const tClose = document.createElement('span');
      tClose.className = 't-close';
      tClose.innerHTML = '×';

      tClose.onclick = (e) => {
        e.stopPropagation();
        if (!confirm('このメモを削除しますか？')) return;
        delete state.memos[mid];
        folder.memos = folder.memos.filter(id => id !== mid);
        if (state.activeMemoId === mid) {
          state.activeMemoId = folder.memos.length > 0 ? folder.memos[0] : null;
        }
        saveData(); render();
      };

      tab.onclick = () => {
        state.activeMemoId = mid;
        saveData(); render();
      };

      tab.appendChild(tName);
      tab.appendChild(tClose);
      el.tabBar.appendChild(tab);
    });

    const addBtn = document.createElement('div');
    addBtn.className = 'add-tab-btn';
    addBtn.title = '新規メモ';
    addBtn.textContent = '＋';
    addBtn.onclick = () => {
      const newId = uid();
      state.memos[newId] = {
        id: newId,
        title: '新規メモ',
        content: '',
        folderId: folder.id,
        updatedAt: Date.now()
      };
      folder.memos.push(newId);
      state.activeMemoId = newId;
      saveData(); render();
      setTimeout(() => el.memoTitle.select(), 50);
    };
    el.tabBar.appendChild(addBtn);
  }

  function renderEditor() {
    const memo = state.memos[state.activeMemoId];
    if (memo) {
      el.editorWrap.style.display = 'flex';
      el.noSelection.style.display = 'none';
      if (el.memoTitle.value !== memo.title) el.memoTitle.value = memo.title;
      if (el.memoContent.value !== memo.content) el.memoContent.value = memo.content;
    } else {
      el.editorWrap.style.display = 'none';
      el.noSelection.style.display = 'flex';
    }
  }

  // ─────────────────────────────
  // イベントリスナー
  // ─────────────────────────────
  
  el.folderList.ondragover = (e) => { e.preventDefault(); };
  el.folderList.ondrop = (e) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    if (data.startsWith('folder:')) {
      moveFolder(data.replace('folder:', ''), null);
    }
  };

  el.addFolderBtn.onclick = () => {
    const name = prompt('ルートフォルダ名', '新しいフォルダ');
    if (!name) return;
    const newId = 'f_' + Math.random().toString(36).slice(2, 9);
    state.folders.push({ id: newId, parentId: null, name: name.trim(), memos: [], isOpen: true });
    state.activeFolderId = newId;
    state.activeMemoId = null;
    saveData(); render();
  };

  el.memoTitle.addEventListener('input', (e) => {
    const memo = state.memos[state.activeMemoId];
    if (memo) {
      memo.title = e.target.value;
      memo.updatedAt = Date.now();
      saveData(); renderTabs();
    }
  });

  el.memoContent.addEventListener('input', (e) => {
    const memo = state.memos[state.activeMemoId];
    if (memo) {
      memo.content = e.target.value;
      memo.updatedAt = Date.now();
      saveData();
    }
  });

  render();
})();