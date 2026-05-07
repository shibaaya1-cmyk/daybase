(function() {
  const STORAGE_KEY = 'todosV1';
  const urlParams = new URLSearchParams(location.search);
  const editId = urlParams.get('id');

  let allTodos = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  let currentTask = editId ? allTodos.find(t => t.id === editId) : null;

  const el = {
    title: document.getElementById('tmTitle'),
    start: document.getElementById('tmStart'),
    due: document.getElementById('tmDue'),
    icon: document.getElementById('tmIcon'),
    memo: document.getElementById('tmMemo'),
    done: document.getElementById('tmDone'),
    subList: document.getElementById('subList'),
    btnSave: document.getElementById('btnSave'),
    btnCancel: document.getElementById('btnCancel'),
    btnDelete: document.getElementById('btnDelete'),
    btnAddSub: document.getElementById('btnAddSub')
  };

  function init() {
    if (currentTask) {
      el.title.value = currentTask.title || '';
      el.start.value = currentTask.startDate || '';
      el.due.value = currentTask.dueDate || '';
      el.icon.value = currentTask.icon || '';
      el.memo.value = currentTask.memo || '';
      el.done.checked = !!currentTask.done;

      // 保存されている1列のデータを、親子関係（ツリー）に復元して描画
      const subs = currentTask.subtasks || [];
      const subMap = {};
      const rootSubs = [];

      subs.forEach(s => {
        s.childrenData = [];
        subMap[s.id] = s;
      });

      subs.forEach(s => {
        // 親IDが設定されていて、かつその親が存在する場合
        if (s.parentSubId && subMap[s.parentSubId]) {
          subMap[s.parentSubId].childrenData.push(s);
        } else {
          // 親がいない（大元の直下タスク）
          rootSubs.push(s);
        }
      });

      renderSubTree(rootSubs, el.subList);
    } else {
      el.btnDelete.style.display = 'none';
    }

    el.btnSave.onclick = save;
    el.btnCancel.onclick = () => window.close();
    el.btnDelete.onclick = deleteTask;
    // 大元の「＋追加」は、一番上の階層に追加する
    el.btnAddSub.onclick = () => addSubtaskRowUI({}, el.subList);
  }

  // ツリー構造を再帰的に描画する
  function renderSubTree(dataList, container) {
    dataList.forEach(data => {
      const div = addSubtaskRowUI(data, container);
      if (data.childrenData && data.childrenData.length > 0) {
        renderSubTree(data.childrenData, div.querySelector('.child-list'));
      }
    });
  }

  // サブタスクの行（枠）を作る
  function addSubtaskRowUI(data, container) {
    const div = document.createElement('div');
    div.className = 'sub-item';
    div.dataset.id = data.id || ('s_' + Math.random().toString(36).slice(2, 9));

    div.innerHTML = `
      <div class="sub-item-header">
        <input type="text" class="s-title" placeholder="タスク名" value="${data.title || ''}" style="flex:1">
        <button class="btn-add-child" title="このタスクの中に子タスクを追加">＋追加</button>
        <button class="btn btn-danger btn-delete" style="height:24px; padding:0 6px" title="削除">×</button>
      </div>
      <div class="sub-item-dates">
        <input type="date" class="s-start" value="${data.startDate || ''}">
        <span>～</span>
        <input type="date" class="s-due" value="${data.dueDate || ''}">
        <label style="margin-left:auto; display:flex; align-items:center; gap:4px">
          <input type="checkbox" class="s-done" ${data.done ? 'checked' : ''}> 完了
        </label>
      </div>
      <div class="child-list"></div>
    `;

    // 「＋追加」を押すと、自分の「.child-list」の中に子タスクを生成
    div.querySelector('.btn-add-child').onclick = () => addSubtaskRowUI({}, div.querySelector('.child-list'));
    div.querySelector('.btn-delete').onclick = () => div.remove();

    container.appendChild(div);
    return div;
  }

  // 画面のツリー構造を読み取って、保存用の1列（フラット）データに変換
  function extractSubtasksFlat(container, parentId = '') {
    let result = [];
    const children = Array.from(container.children).filter(e => e.classList.contains('sub-item'));

    children.forEach(row => {
      const id = row.dataset.id;
      const childData = {
        id: id,
        parentSubId: parentId, // 自分がどの親に属しているかを記録
        title: row.querySelector('.s-title').value || '(無題)',
        startDate: row.querySelector('.s-start').value,
        dueDate: row.querySelector('.s-due').value,
        done: row.querySelector('.s-done').checked
      };
      result.push(childData);

      // さらに自分の子（孫タスク）がいれば、自分のIDを親IDとして渡して再帰的に読み取る
      const childList = row.querySelector('.child-list');
      result = result.concat(extractSubtasksFlat(childList, id));
    });
    return result;
  }

  // 一番下の子タスクの状態から、上の親タスクの日付や完了状態を自動計算
  function syncStateFlat(task) {
    if (!task.subtasks || task.subtasks.length === 0) return;

    const subs = task.subtasks;
    const byParent = {};
    subs.forEach(s => {
      const pid = s.parentSubId || '';
      if (!byParent[pid]) byParent[pid] = [];
      byParent[pid].push(s);
    });

    // 下の階層から順番に計算していく（後行順回帰）
    function postOrder(pid) {
      const children = byParent[pid] || [];
      children.forEach(c => postOrder(c.id));

      if (children.length > 0) {
        const allDone = children.every(c => c.done);
        const starts = children.map(c => c.startDate).filter(Boolean).sort();
        const dues = children.map(c => c.dueDate).filter(Boolean).sort();

        if (pid !== '') {
          // サブタスク自身の更新
          const self = subs.find(s => s.id === pid);
          if (self) {
            self.done = allDone;
            if (starts.length) self.startDate = starts[0];
            if (dues.length) self.dueDate = dues[dues.length - 1];
          }
        } else {
          // 大元の親タスクの更新
          task.done = allDone;
          if (starts.length) task.startDate = starts[0];
          if (dues.length) task.dueDate = dues[dues.length - 1];
        }
      }
    }
    postOrder('');
  }

  function save() {
    const title = el.title.value.trim();
    if (!title) return alert('タイトルを入力してください');

    // ツリー構造のDOMからフラット配列を抽出
    const flatSubtasks = extractSubtasksFlat(el.subList, '');

    const taskData = {
      id: editId || 't_' + Date.now(),
      title,
      startDate: el.start.value,
      dueDate: el.due.value,
      icon: el.icon.value,
      memo: el.memo.value,
      done: el.done.checked,
      subtasks: flatSubtasks,
      updatedAt: new Date().toISOString()
    };

    // 親子状態の同期
    syncStateFlat(taskData);

    if (editId) {
      allTodos = allTodos.map(t => t.id === editId ? taskData : t);
    } else {
      allTodos.push(taskData);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(allTodos));
    if (window.opener) window.opener.postMessage({ type: 'todo:saved' }, '*');
    window.close();
  }

  function deleteTask() {
    if (!confirm('このタスクを削除しますか？')) return;
    allTodos = allTodos.filter(t => t.id !== editId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allTodos));
    if (window.opener) window.opener.postMessage({ type: 'todo:saved' }, '*');
    window.close();
  }

  init();
})();