/**
 * Bフレーム（サイドバー）の動画ブックマーク同期・描画スクリプト
 */
(function() {
  'use strict';

  function escapeHtml(s){ 
    return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // フォルダ階層をデータから構築するヘルパー
  function buildFolderTree(folders) {
    const map = {};
    const roots = [];
    folders.forEach(f => map[f.id] = { ...f, children: [] });
    folders.forEach(f => {
      if (f.parentId && map[f.parentId]) {
        map[f.parentId].children.push(map[f.id]);
      } else {
        roots.push(map[f.id]);
      }
    });
    return roots;
  }

  function renderBFrameVideos() {
    const vbList = document.querySelector('#bPanelVideos .vb-list') || document.querySelector('.vb-list');
    if (!vbList) return;
    
    vbList.innerHTML = '';
    
    let data = { root: { items: [] }, folders: [] };
    try {
      const s = localStorage.getItem('D_VID_V2');
      if(s) data = JSON.parse(s);
    } catch(e){}

    if (data.root.items.length === 0 && data.folders.length === 0) {
      vbList.innerHTML = '<div style="padding:16px 10px; color:#64748b; font-size:12px; text-align:center;">動画がありません。<br>管理画面から追加してください。</div>';
      return;
    }

    function createVideoItem(v) {
      const el = document.createElement('div');
      el.className = 'vb-item';
      const safeTitle = escapeHtml(v.title || '(無題)');
      const safeIcon = escapeHtml(v.icon || '📺');
      
      // 動画アイテムのUI微調整
      el.innerHTML = `
        <span style="font-size:14px;">${safeIcon}</span>
        <div class="vb-title-wrap" style="flex:1; min-width:0; overflow:hidden;">
          <div class="vb-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600; font-size:12px; color:#334155;">${safeTitle}</div>
        </div>
      `;
      
      el.onclick = (e) => {
        e.stopPropagation();
        vbList.querySelectorAll('.vb-item').forEach(item => item.classList.remove('active'));
        el.classList.add('active');
        window.postMessage({ type: 'D_OPEN_URL', url: v.url }, '*');
      };
      return el;
    }

    // ① 未分類アイテムの描画
    if (data.root.items && data.root.items.length > 0) {
      const rootWrap = document.createElement('div');
      rootWrap.style.display = 'flex';
      rootWrap.style.flexDirection = 'column';
      rootWrap.style.gap = '6px';
      rootWrap.style.marginBottom = '12px';
      data.root.items.forEach(v => rootWrap.appendChild(createVideoItem(v)));
      vbList.appendChild(rootWrap);
    }

    // ② フォルダの再帰的描画（階層対応アコーディオン）
    function appendFolder(node, container, depth = 0) {
      // 完全に空っぽ（アイテムもサブフォルダもない）の場合は表示しない（ノイズ削減）
      if ((!node.items || node.items.length === 0) && (!node.children || node.children.length === 0)) return;

      const isSub = depth > 0;
      const fWrap = document.createElement('div');
      fWrap.className = 'vb-folder-wrap';
      fWrap.style.marginBottom = isSub ? '4px' : '8px';

      const fHead = document.createElement('div');
      fHead.className = 'vb-folder-head';
      
      // 深さに応じて見た目を変更（トップレベルはカード風、サブフォルダはスッキリ破線）
      if (isSub) {
        fHead.style.cssText = `
          padding: 6px 8px; font-size: 11px; font-weight: 700; color: #475569;
          display: flex; align-items: center; cursor: pointer; user-select: none;
          background: transparent; border-bottom: 1px dashed #cbd5e1;
        `;
      } else {
        fHead.style.cssText = `
          padding: 8px 12px; font-size: 12px; font-weight: 700; color: #334155;
          display: flex; align-items: center; cursor: pointer; user-select: none;
          background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;
          box-shadow: 0 1px 2px rgba(0,0,0,0.02);
        `;
      }
      
      const icon = isSub ? '📁' : '📂';
      fHead.innerHTML = `<span style="margin-right:6px;">${icon} ${escapeHtml(node.name)}</span> <span class="vb-folder-caret" style="margin-left:auto; font-size:10px; transition:0.2s; transform: rotate(-90deg); color:#94a3b8;">▼</span>`;

      const fBody = document.createElement('div');
      fBody.className = 'vb-folder-body';
      // 階層が下がるごとに左側にインデントとガイドライン（border-left）を引く
      fBody.style.cssText = `
        display: none; flex-direction: column; gap: 6px;
        padding: 8px 0 0 ${isSub ? '12px' : '10px'}; 
        border-left: 2px solid ${isSub ? '#cbd5e1' : '#e2e8f0'}; 
        margin-left: ${isSub ? '6px' : '8px'};
      `;

      // フォルダ内の動画を描画
      if (node.items) {
        node.items.forEach(v => fBody.appendChild(createVideoItem(v)));
      }
      
      // サブフォルダを再帰的に描画（ここがポイント）
      if (node.children) {
        node.children.forEach(child => appendFolder(child, fBody, depth + 1));
      }

      let isOpen = false;
      fHead.onclick = (e) => {
        e.stopPropagation(); // 子フォルダのクリックで親フォルダまで反応しないようにする
        isOpen = !isOpen;
        fBody.style.display = isOpen ? 'flex' : 'none';
        fHead.querySelector('.vb-folder-caret').style.transform = isOpen ? 'rotate(0deg)' : 'rotate(-90deg)';
      };

      fWrap.appendChild(fHead);
      fWrap.appendChild(fBody);
      container.appendChild(fWrap);
    }

    const tree = buildFolderTree(data.folders);
    tree.forEach(node => appendFolder(node, vbList));
  }

  window.addEventListener('message', e => {
    if(e.data && e.data.type === 'D_VIDEOS_UPDATED') renderBFrameVideos();
  });
  window.addEventListener('storage', e => {
    if(e.key === 'D_VID_V2') renderBFrameVideos();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderBFrameVideos);
  } else {
    renderBFrameVideos();
  }

})();