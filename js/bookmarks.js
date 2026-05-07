(function() {
  const KEY = 'customBookmarksV2';

  function loadData(){
    let d = { folders:[], root:{ items:[], collapsed: false } };
    try { const s = localStorage.getItem(KEY); if(s) d = JSON.parse(s); } catch(e){}
    return d;
  }
  function saveData(d){ 
    localStorage.setItem(KEY, JSON.stringify(d)); 
    notifyParent();
  }
  function notifyParent() {
    try { window.parent.postMessage({ type: 'D_BOOKMARKS_UPDATED' }, '*'); } catch(e){}
  }

  function uid() { return 'bm_' + Math.random().toString(36).slice(2,10); }

  function getFaviconUrl(url){
    try{
      const u = new URL(/^https?:\/\//i.test(url) ? url : 'https://'+url);
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=32`;
    }catch{ return ''; }
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  const TITLE_FETCH_TIMEOUT_MS = 7000;
  async function suggestTitle(rawUrl){
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : ('https://'+rawUrl);
    try {
      const html = await fetchWithTimeout(url, {mode:'cors'}, TITLE_FETCH_TIMEOUT_MS).then(r=>r.text());
      const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (t) return decodeEntities(t[1].trim());
    } catch(_) {}

    try {
      const bare = url.replace(/^https?:\/\//i,'');
      const via = url.startsWith('https://') ? `https://r.jina.ai/https://${bare}` : `https://r.jina.ai/http://${bare}`;
      const text = await fetchWithTimeout(via, {}, TITLE_FETCH_TIMEOUT_MS).then(r=>r.text());
      const m1 = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (m1) return decodeEntities(m1[1].trim());
      const m2 = text.match(/^\s*#\s+(.+?)\s*$/m);
      if (m2) return m2[1].trim();
    } catch(_) {}

    try { return new URL(url).hostname.replace(/^www\./,''); } catch { return rawUrl; }
  }
  function decodeEntities(s){ return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }
  function fetchWithTimeout(resource, options={}, timeout=8000){
    return new Promise((resolve,reject)=>{
      const id=setTimeout(()=>reject(new Error('timeout')), timeout);
      fetch(resource, options).then(res=>{ clearTimeout(id); resolve(res); }, err=>{ clearTimeout(id); reject(err); });
    });
  }

  function buildFolderTree(folders) {
    const map = {};
    const roots = [];
    folders.forEach(f => map[f.id] = { ...f, children: [] });
    folders.forEach(f => {
      if (f.parentId && map[f.parentId]) map[f.parentId].children.push(map[f.id]);
      else roots.push(map[f.id]);
    });
    return roots;
  }

  const grid = document.getElementById('folderGrid');
  let draggedItemEl = null;

  function render(){
    const data = loadData();
    grid.innerHTML = '';
    grid.appendChild(createFolderCard('root', 'ルート（未分類）', data.root.items || [], '🌍', data.root, 0));
    
    const tree = buildFolderTree(data.folders);
    tree.forEach(node => { grid.appendChild(createFolderCard(node.id, node.name, node.items || [], '📂', node, 0)); });
  }

  window.toggleFolder = function(e, id, forceState = null) {
    if (e) e.stopPropagation();
    const card = document.querySelector(`.folder-card[data-id="${id}"]`);
    if (card) {
      let willCollapse = !card.classList.contains('collapsed');
      if (forceState !== null) willCollapse = forceState;
      
      if (willCollapse) card.classList.add('collapsed');
      else card.classList.remove('collapsed');

      const data = loadData();
      if (id === 'root') {
        if (!data.root) data.root = {items:[]};
        data.root.collapsed = willCollapse;
      } else {
        const f = data.folders.find(x => x.id === id);
        if (f) f.collapsed = willCollapse;
      }
      saveData(data);
    }
  };

  function createFolderCard(id, name, items, iconEmoji, nodeObj, depth){
    const card = document.createElement('div');
    card.className = 'folder-card' + (depth > 0 ? ' sub-folder' : '');
    card.dataset.id = id;

    const isCollapsed = nodeObj ? !!nodeObj.collapsed : false;
    if (isCollapsed) card.classList.add('collapsed');

    const btnsHTML = id !== 'root' ? `
      <button class="f-ctrl-btn toggle-collapse" onclick="toggleFolder(event, '${id}')" title="開閉">▼</button>
      <button class="f-ctrl-btn" onclick="addSubFolder('${id}')" title="サブフォルダを追加">➕📂</button>
      <button class="f-ctrl-btn" onclick="renameFolder('${id}', '${name}')" title="名前を変更">✎</button>
      <button class="f-ctrl-btn del" onclick="deleteFolder('${id}', '${name}')" title="フォルダを削除">🗑️</button>
    ` : `
      <button class="f-ctrl-btn toggle-collapse" onclick="toggleFolder(event, 'root')" title="開閉">▼</button>
    `;

    card.innerHTML = `
      <div class="folder-head">
        <span class="folder-icon">${iconEmoji}</span>
        <span class="folder-title">${escapeHtml(name)}</span>
        <span class="folder-count">${items.length}</span>
        ${btnsHTML}
      </div>
      <div class="item-list" data-folder="${id}"></div>
    `;

    let expandTimer = null;
    card.addEventListener('dragenter', (e) => {
       if (card.classList.contains('collapsed') && draggedItemEl && !card.contains(draggedItemEl)) {
           if (!expandTimer) {
               expandTimer = setTimeout(() => {
                   window.toggleFolder(null, id, false);
               }, 800);
           }
       }
    });
    card.addEventListener('dragleave', () => {
       if (expandTimer) { clearTimeout(expandTimer); expandTimer = null; }
    });
    card.addEventListener('drop', () => {
       if (expandTimer) { clearTimeout(expandTimer); expandTimer = null; }
    });

    if (id !== 'root') {
      card.draggable = true;
      card.ondragstart = (e) => {
        if (e.target !== card) return;
        draggedItemEl = card;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        e.stopPropagation();
        setTimeout(() => card.classList.add('dragging'), 0);
      };
      card.ondragend = (e) => {
        if (e.target !== card) return;
        card.classList.remove('dragging');
        draggedItemEl = null;
        document.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
        saveOrderFromDOM();
        e.stopPropagation();
      };
    }

    const list = card.querySelector('.item-list');
    
    items.forEach(v => {
      const el = document.createElement('div');
      el.className = 'bm-item';
      el.draggable = true;
      el.dataset.id = v.id;
      const ico = getFaviconUrl(v.url);
      el.innerHTML = `
        ${ico ? `<img src="${ico}">` : `<span style="font-size:16px;">🔖</span>`}
        <span class="v-title">${escapeHtml(v.title || '(無題)')}</span>
        <span class="v-edit" onclick="openEdit('${v.id}')">✎</span>
      `;
      
      el.ondragstart = (e) => {
        draggedItemEl = el;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', v.id);
        e.stopPropagation();
        setTimeout(() => el.classList.add('dragging'), 0);
      };
      
      el.ondragend = (e) => {
        el.classList.remove('dragging');
        draggedItemEl = null;
        document.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
        saveOrderFromDOM();
        e.stopPropagation();
      };
      
      list.appendChild(el);
    });

    if (nodeObj && nodeObj.children && nodeObj.children.length > 0) {
      nodeObj.children.forEach(child => {
        list.appendChild(createFolderCard(child.id, child.name, child.items || [], '📁', child, depth + 1));
      });
    }

    list.ondragover = (e) => {
      e.preventDefault();
      e.stopPropagation(); 
      if (!draggedItemEl) return;
      if (draggedItemEl === card || draggedItemEl.contains(list)) return;
      if (id === 'root' && draggedItemEl.classList.contains('folder-card')) return;

      list.classList.add('drag-over');
      const afterElement = getDragAfterElement(list, e.clientY);
      if (afterElement == null) list.appendChild(draggedItemEl);
      else list.insertBefore(draggedItemEl, afterElement);
    };

    list.ondragleave = (e) => { e.stopPropagation(); list.classList.remove('drag-over'); };
    list.ondrop = (e) => { e.preventDefault(); e.stopPropagation(); list.classList.remove('drag-over'); };

    return card;
  }

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll(':scope > .bm-item:not(.dragging), :scope > .folder-card:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
      else return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  grid.ondragover = (e) => {
    e.preventDefault();
    if (!draggedItemEl) return;
    if (draggedItemEl.classList.contains('bm-item')) return;
    if (draggedItemEl.contains(grid)) return;

    const target = e.target.closest('.folder-card');
    if (target && target.dataset.id === 'root') return;

    if (target && target.parentElement === grid && target !== draggedItemEl) {
      const box = target.getBoundingClientRect();
      if (e.clientX < box.left + box.width / 2) grid.insertBefore(draggedItemEl, target);
      else {
        if (target.nextSibling) grid.insertBefore(draggedItemEl, target.nextSibling);
        else grid.appendChild(draggedItemEl);
      }
    } else if (e.target === grid) {
      grid.appendChild(draggedItemEl);
    }
  };

  function saveOrderFromDOM() {
    const oldData = loadData();
    const allItems = new Map();
    oldData.root.items.forEach(i => allItems.set(i.id, i));
    oldData.folders.forEach(f => f.items.forEach(i => allItems.set(i.id, i)));
    
    const allFolders = new Map();
    oldData.folders.forEach(f => allFolders.set(f.id, { ...f, parentId: null, items: [] }));

    const newData = { root: { items: [], collapsed: !!oldData.root.collapsed }, folders: [] };

    function parseItemList(listEl, currentFolderId) {
      Array.from(listEl.children).forEach(child => {
        const id = child.dataset.id;
        if (child.classList.contains('bm-item')) {
          const item = allItems.get(id);
          if (item) {
            if (currentFolderId === 'root') newData.root.items.push(item);
            else { const f = allFolders.get(currentFolderId); if (f) f.items.push(item); }
          }
        } else if (child.classList.contains('folder-card')) {
          const folder = allFolders.get(id);
          if (folder) {
            folder.parentId = currentFolderId === 'root' ? null : currentFolderId;
            newData.folders.push(folder);
            const subList = child.querySelector(':scope > .item-list');
            if (subList) parseItemList(subList, id);
          }
        }
      });
    }

    const rootList = document.querySelector('.folder-card[data-id="root"] > .item-list');
    if (rootList) parseItemList(rootList, 'root');

    const topFolders = document.querySelectorAll('#folderGrid > .folder-card:not([data-id="root"])');
    topFolders.forEach(topEl => {
      const id = topEl.dataset.id;
      const folder = allFolders.get(id);
      if (folder) {
        folder.parentId = null;
        newData.folders.push(folder);
        const subList = topEl.querySelector(':scope > .item-list');
        if (subList) parseItemList(subList, id);
      }
    });

    saveData(newData); render();
  }

  document.getElementById('addFolderBtn').onclick = () => {
    const n = prompt('新しいトップフォルダ名を入力してください');
    if(!n) return;
    const data = loadData();
    data.folders.push({ id:'f_'+Date.now(), name:n, parentId: null, items:[], collapsed: false });
    saveData(data); render();
  };

  window.addSubFolder = function(parentId) {
    const n = prompt('サブフォルダ名を入力してください');
    if(!n) return;
    const data = loadData();
    data.folders.push({ id:'f_'+Date.now(), name:n, parentId: parentId, items:[], collapsed: false });
    saveData(data); render();
  };

  window.renameFolder = function(id, oldName) {
    const newName = prompt('新しいフォルダ名を入力してください', oldName);
    if (newName && newName.trim() && newName !== oldName) {
      const data = loadData();
      const f = data.folders.find(x => x.id === id);
      if (f) { f.name = newName.trim(); saveData(data); render(); }
    }
  };

  window.deleteFolder = function(id, name) {
    if (confirm(`フォルダ「${name}」を削除しますか？\n※中に入っているブックマークはすべて「ルート（未分類）」へ移動します。`)) {
      const data = loadData();
      const toDeleteIds = new Set([id]);
      let added = true;
      while(added) {
        added = false;
        data.folders.forEach(f => {
          if(f.parentId && toDeleteIds.has(f.parentId) && !toDeleteIds.has(f.id)) { toDeleteIds.add(f.id); added = true; }
        });
      }
      data.folders.forEach(f => {
        if (toDeleteIds.has(f.id) && f.items && f.items.length > 0) data.root.items.push(...f.items);
      });
      data.folders = data.folders.filter(f => !toDeleteIds.has(f.id));
      saveData(data); render();
    }
  };

  let editingId = null;
  const modal = document.getElementById('editModal');

  function updateFolderSelectOptions(selectEl, data) {
    selectEl.innerHTML = '<option value="root">ルート（未分類）</option>';
    function buildOptions(nodes, depth, prefix) {
      nodes.forEach(n => {
        const indent = '　'.repeat(depth);
        const opt = document.createElement('option');
        opt.value = n.id;
        opt.textContent = indent + (depth > 0 ? '└ ' : '') + n.name;
        selectEl.appendChild(opt);
        if (n.children.length > 0) buildOptions(n.children, depth + 1, prefix + n.name + ' > ');
      });
    }
    buildOptions(buildFolderTree(data.folders), 0, '');
  }

  window.openEdit = function(id = null){
    editingId = id;
    const data = loadData();
    const sel = document.getElementById('inFolder');
    updateFolderSelectOptions(sel, data);

    if(id){
      document.getElementById('modalTitle').textContent = 'ブックマークを編集';
      document.getElementById('btnDel').style.display = 'block';
      const loc = findBookmark(data, id);
      if(loc){
        document.getElementById('inTitle').value = loc.item.title;
        document.getElementById('inUrl').value = loc.item.url;
        document.getElementById('inFolder').value = loc.from;
      }
    } else {
      document.getElementById('modalTitle').textContent = 'ブックマークを登録';
      document.getElementById('btnDel').style.display = 'none';
      document.getElementById('inTitle').value = '';
      document.getElementById('inUrl').value = '';
    }
    modal.showModal();
  };

  document.getElementById('btnSave').onclick = async () => {
    let title = document.getElementById('inTitle').value.trim();
    const url = document.getElementById('inUrl').value.trim();
    const folder = document.getElementById('inFolder').value;
    const btnSave = document.getElementById('btnSave');
    
    if(!url) return alert('URLを入力してください');

    if (!title) {
      btnSave.textContent = 'タイトル取得中...';
      btnSave.disabled = true;
      try {
        const t = await suggestTitle(url);
        if (t) title = t; else throw new Error('title fetch failed');
      } catch(e) {
        title = url;
      }
      btnSave.textContent = '保存する';
      btnSave.disabled = false;
    }

    const data = loadData();
    if(editingId) removeBookmark(data, editingId);
    
    const newItem = { id: editingId || uid(), title, url };
    if(folder === 'root') data.root.items.push(newItem);
    else {
      const f = data.folders.find(x=>x.id===folder);
      if(f) f.items.push(newItem);
    }

    saveData(data); modal.close(); render();
  };

  document.getElementById('btnDel').onclick = () => {
    if(!confirm('削除してよろしいですか？')) return;
    const data = loadData();
    removeBookmark(data, editingId);
    saveData(data); modal.close(); render();
  };

  document.getElementById('btnCancel').onclick = () => modal.close();
  
  const addBmBtn = document.getElementById('addBmBtn');
  if (addBmBtn) addBmBtn.onclick = () => openEdit();

  function findBookmark(data, id){
    const rIdx = data.root.items.findIndex(x=>x.id===id);
    if(rIdx>=0) return { item:data.root.items[rIdx], from:'root' };
    for(const f of data.folders){
      const i = (f.items||[]).findIndex(x=>x.id===id);
      if(i>=0) return { item:f.items[i], from:f.id };
    }
    return null;
  }
  function removeBookmark(data, id){
    const rIdx = data.root.items.findIndex(x=>x.id===id);
    if(rIdx>=0) data.root.items.splice(rIdx,1);
    else {
      for(const f of data.folders){
        const i = (f.items||[]).findIndex(x=>x.id===id);
        if(i>=0) { f.items.splice(i,1); break; }
      }
    }
  }

  const recoverBtn = document.getElementById('recoverBtn');
  if (recoverBtn) {
    recoverBtn.onclick = () => {
      const data = loadData();
      let recoveredCount = 0;
      const LEGACY_KEYS = ['customBookmarksV1', 'customBookmarks'];
      
      for (const k of LEGACY_KEYS) {
        try {
          const arr = JSON.parse(localStorage.getItem(k));
          if (Array.isArray(arr) && arr.length) {
            arr.forEach(x => {
              const url = x.url || x.href || '';
              if (!url) return;
              if (!data.root.items.find(it => it.url === url) && 
                  !data.folders.some(f => f.items && f.items.find(it => it.url === url))) {
                data.root.items.push({
                  id: uid(),
                  title: x.title || x.label || url || '(無題)',
                  url: url
                });
                recoveredCount++;
              }
            });
          }
        } catch(e) {}
      }
      if (recoveredCount > 0) {
        saveData(data); render();
        alert(`${recoveredCount}件の過去のブックマークを「ルート（未分類）」に復元しました！`);
      } else {
        alert('復元できる過去のデータが見つかりませんでした。');
      }
    };
  }

  window.addEventListener('DOMContentLoaded', () => {
    const data = loadData();
    if ((data.root.items.length === 0) && (data.folders.length === 0)) {
      const btn = document.getElementById('recoverBtn');
      if (btn) btn.click();
    } else {
      render();
    }
  });

})(); // ← エラーの原因だった「カッコの対応」をここで完璧に閉じています！