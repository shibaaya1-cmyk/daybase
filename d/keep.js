(function() {
  const board = document.getElementById('board');
  const addBtn = document.getElementById('addNoteBtn'); // ★追加
  const NOTES_KEY = 'D_KEEP_NOTES_V1';
  let notesData = [];

  // 利用できる付箋の色
  const colors = ['#fff9c4', '#fce4ec', '#f3e5f5', '#e3f2fd', '#e0f7fa', '#e8f5e9', '#f1f8e9'];

  // ローカルストレージからデータを読み込む
  function loadNotes() {
    try { 
      notesData = JSON.parse(localStorage.getItem(NOTES_KEY)) || []; 
    } catch(e) { 
      notesData = []; 
    }
    renderAll();
  }

  // ローカルストレージへデータを保存する
  function saveNotes() {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notesData));
  }

  // 画面にすべての付箋を描画する
  function renderAll() {
    board.innerHTML = '';
    notesData.forEach(note => {
      const el = document.createElement('div');
      el.className = 'note';
      el.style.left = (note.x || 50) + 'px';
      el.style.top = (note.y || 50) + 'px';
      el.style.backgroundColor = note.color || '#fff9c4';
      
      // テキストエリア
      const txt = document.createElement('div');
      txt.className = 'note-text';
      txt.contentEditable = true;
      txt.innerText = note.text;
      
      // テキストが編集されたら保存
      txt.addEventListener('blur', () => {
        note.text = txt.innerText;
        saveNotes();
      });

      // 削除ボタン
      const del = document.createElement('button');
      del.className = 'btn-delete';
      del.innerHTML = '×';
      del.title = '削除';
      del.onclick = () => {
        if(confirm('この付箋を削除しますか？')) {
          notesData = notesData.filter(n => n.id !== note.id);
          saveNotes();
          renderAll();
        }
      };

      // 色変更パレット
      const colorsDiv = document.createElement('div');
      colorsDiv.className = 'color-picker';
      colors.forEach(c => {
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.backgroundColor = c;
        dot.onclick = () => {
          note.color = c;
          saveNotes();
          el.style.backgroundColor = c;
        };
        colorsDiv.appendChild(dot);
      });

      // ドラッグ移動の処理
      let isDragging = false;
      let startX, startY, initialX, initialY;

      el.addEventListener('mousedown', (e) => {
        if(e.target === txt || e.target === del || e.target.classList.contains('color-dot')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialX = parseInt(el.style.left) || 0;
        initialY = parseInt(el.style.top) || 0;

        // 触った付箋を一番手前に持ってくる
        document.querySelectorAll('.note').forEach(n => n.style.zIndex = 1);
        el.style.zIndex = 100;
      });

      window.addEventListener('mousemove', (e) => {
        if(!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        el.style.left = (initialX + dx) + 'px';
        el.style.top = (initialY + dy) + 'px';
      });

      window.addEventListener('mouseup', () => {
        if(isDragging) {
          isDragging = false;
          note.x = parseInt(el.style.left);
          note.y = parseInt(el.style.top);
          saveNotes();
        }
      });

      el.appendChild(del);
      el.appendChild(txt);
      el.appendChild(colorsDiv);
      board.appendChild(el);
    });
  }

  // ★追加：右下の「＋」ボタンで新しい付箋を追加する処理
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      // 画面の少しランダムな位置にずらして配置
      const newX = 50 + Math.random() * 100;
      const newY = 50 + Math.random() * 100;
      notesData.push({
        id: 'note_' + Date.now(),
        text: '', // 最初は空っぽ
        color: '#fff9c4', // デフォルトは黄色
        x: newX,
        y: newY,
        w: 220,
        h: 180
      });
      saveNotes();
      renderAll();
    });
  }

  // ★追加：最強のセンサー（Bフレームなど、他の場所からの追加・更新を自動検知）
  window.addEventListener('storage', (ev) => {
    if (ev.key === NOTES_KEY) {
      loadNotes(); // データが書き換わったら即座に再描画
    }
  });

  // postMessage方式（保険用）
  window.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'D_NOTES_UPDATED') {
      loadNotes();
    }
  });

  // 初期読み込みの実行
  loadNotes();

})();