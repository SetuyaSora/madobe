/* -------------------------------------------------------------
 * Chrome Wallpaper - Widgets Control & Render Module
 * ------------------------------------------------------------- */

import { appState, elements, escapeHtml, WIDGET_RULES, LONG_PRESS_DELAY, GRID_COLS, GRID_ROWS } from './state.js';
import { storage } from './storage.js';
import { isWidgetsColliding, findFreeGridPosition, swapWidgets, resolveWidgetCollisions } from './physics.js';
import { showContextMenu, applyWidgetOpacityStyle, updateAllWidgetsOpacityStyles } from './contextmenu.js';
import { handleSearchInput, handleSearchKeydown } from './suggest.js';
import { closeShortcutsDrawer } from './shortcuts.js';

let widgetsGlobalTimer = null;
let dragPreviewEl = null;
export let currentDraggedType = null;

export function setCurrentDraggedType(type) {
  currentDraggedType = type;
}

export function getCurrentDraggedType() {
  return currentDraggedType;
}

// ウィジェットの保存
export function saveWidgets() {
  storage.set({ widgets: appState.currentSettings.widgets });
}

// ウィジェットのデフォルトサイズを取得
export function getWidgetDefaultSize(type) {
  switch (type) {
    case 'search-bar':
      return { w: 20, h: 2 };
    case 'digital-clock':
      return { w: 12, h: 6 };
    case 'analog-clock':
      return { w: 8, h: 8 };
    case 'calendar':
      return { w: 12, h: 10 };
    case 'memo':
      return { w: 10, h: 8 };
    case 'rss':
      return { w: 12, h: 10 };
    case 'todo':
      return { w: 10, h: 8 };
    default:
      return { w: 8, h: 6 };
  }
}

// グリッド配置スナッププレビューの更新
export function updateSnapPreview(clientX, clientY, size) {
  if (!elements.widgetsLayer) return;
  const rect = elements.widgetsLayer.getBoundingClientRect();
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;

  const cellW = rect.width / GRID_COLS;
  const cellH = rect.height / GRID_ROWS;

  let gridX = Math.floor(mouseX / cellW);
  let gridY = Math.floor(mouseY / cellH);

  if (gridX + size.w > GRID_COLS) gridX = GRID_COLS - size.w;
  if (gridY + size.h > GRID_ROWS) gridY = GRID_ROWS - size.h;
  if (gridX < 0) gridX = 0;
  if (gridY < 0) gridY = 0;

  if (!dragPreviewEl) {
    dragPreviewEl = document.createElement('div');
    dragPreviewEl.className = 'widget-snap-preview';
    elements.widgetsLayer.appendChild(dragPreviewEl);
  }

  dragPreviewEl.style.left = (gridX / GRID_COLS) * 100 + '%';
  dragPreviewEl.style.top = (gridY / GRID_ROWS) * 100 + '%';
  dragPreviewEl.style.width = (size.w / GRID_COLS) * 100 + '%';
  dragPreviewEl.style.height = (size.h / GRID_ROWS) * 100 + '%';
  dragPreviewEl.style.display = 'block';
}

// プレビューの削除
export function removeSnapPreview() {
  if (dragPreviewEl) {
    dragPreviewEl.remove();
    dragPreviewEl = null;
  }
}

// ウィジェットのドラッグ移動制御
export function makeWidgetDraggable(widgetFrame, widgetData) {
  const header = widgetFrame.querySelector('.widget-header');
  if (!header) return;

  header.addEventListener('mousedown', (e) => {
    if (!document.body.classList.contains('edit-mode')) return;
    if (e.target.closest('.widget-close-btn')) return;
    e.preventDefault();

    widgetFrame.classList.add('dragging');

    const startX = e.clientX;
    const startY = e.clientY;
    const initialGridX = widgetData.gridX;
    const initialGridY = widgetData.gridY;

    // スワップ用のドラッグ開始位置を記録
    const dragStartPos = { x: widgetData.gridX, y: widgetData.gridY };

    const layerRect = elements.widgetsLayer.getBoundingClientRect();
    const cellW = layerRect.width / GRID_COLS;
    const cellH = layerRect.height / GRID_ROWS;

    // スナッププレビュー作成
    const preview = document.createElement('div');
    preview.className = 'widget-snap-preview';
    preview.style.left = (widgetData.gridX / GRID_COLS) * 100 + '%';
    preview.style.top = (widgetData.gridY / GRID_ROWS) * 100 + '%';
    preview.style.width = (widgetData.gridW / GRID_COLS) * 100 + '%';
    preview.style.height = (widgetData.gridH / GRID_ROWS) * 100 + '%';
    elements.widgetsLayer.appendChild(preview);

    let currentGridX = initialGridX;
    let currentGridY = initialGridY;

    function onMouseMove(moveEvent) {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const gridDeltaX = Math.round(deltaX / cellW);
      const gridDeltaY = Math.round(deltaY / cellH);

      let nextGridX = initialGridX + gridDeltaX;
      let nextGridY = initialGridY + gridDeltaY;

      if (nextGridX < 0) nextGridX = 0;
      if (nextGridY < 0) nextGridY = 0;
      if (nextGridX + widgetData.gridW > GRID_COLS) nextGridX = GRID_COLS - widgetData.gridW;
      if (nextGridY + widgetData.gridH > GRID_ROWS) nextGridY = GRID_ROWS - widgetData.gridH;

      // スナップ先のセル座標が変化した場合にリアルタイムで入れ替えを行う
      if (nextGridX !== currentGridX || nextGridY !== currentGridY) {
        // 重なるウィジェットをドラッグ元の空き座標と入れ替える (スワップ)
        swapWidgets(widgetData, nextGridX, nextGridY, dragStartPos);

        // 動かしている本人のデータを仮更新 (データ上で一度移動)
        widgetData.gridX = nextGridX;
        widgetData.gridY = nextGridY;

        // 避ける側のウィジェットのDOMのみを滑らかにアニメーションスライドさせる
        updateWidgetsPositionsOnly();
      }

      currentGridX = nextGridX;
      currentGridY = nextGridY;

      preview.style.left = (currentGridX / GRID_COLS) * 100 + '%';
      preview.style.top = (currentGridY / GRID_ROWS) * 100 + '%';

      // ドラッグ中のウィジェット自体はTransitionなしでリアルタイム追従
      widgetFrame.style.left = (currentGridX / GRID_COLS) * 100 + '%';
      widgetFrame.style.top = (currentGridY / GRID_ROWS) * 100 + '%';
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      widgetFrame.classList.remove('dragging');
      preview.remove();

      // 最終スナップ位置を再セットして永続化
      widgetData.gridX = currentGridX;
      widgetData.gridY = currentGridY;

      // ドラッグが完了した最終確定時に、玉突き衝突を1回だけ解決する
      resolveWidgetCollisions(widgetData.id);

      saveWidgets();
      renderWidgets(); // リビルド
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// ウィジェットのリサイズ制御
export function makeWidgetResizable(widgetFrame, widgetData) {
  const handle = widgetFrame.querySelector('.widget-resize-handle');
  if (!handle) return;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    widgetFrame.classList.add('resizing');

    const startX = e.clientX;
    const startY = e.clientY;
    const initialGridW = widgetData.gridW;
    const initialGridH = widgetData.gridH;

    const layerRect = elements.widgetsLayer.getBoundingClientRect();
    const cellW = layerRect.width / GRID_COLS;
    const cellH = layerRect.height / GRID_ROWS;

    // スナッププレビュー作成
    const preview = document.createElement('div');
    preview.className = 'widget-snap-preview';
    preview.style.left = (widgetData.gridX / GRID_COLS) * 100 + '%';
    preview.style.top = (widgetData.gridY / GRID_ROWS) * 100 + '%';
    preview.style.width = (widgetData.gridW / GRID_COLS) * 100 + '%';
    preview.style.height = (widgetData.gridH / GRID_ROWS) * 100 + '%';
    elements.widgetsLayer.appendChild(preview);

    let currentGridW = initialGridW;
    let currentGridH = initialGridH;

    function onMouseMove(moveEvent) {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const gridDeltaW = Math.round(deltaX / cellW);
      const gridDeltaH = Math.round(deltaY / cellH);

      let nextGridW = initialGridW + gridDeltaW;
      let nextGridH = initialGridH + gridDeltaH;

      // WIDGET_RULES の制約ルールを適用
      const rules = WIDGET_RULES[widgetData.type] || { minW: 4, minH: 4, maxW: GRID_COLS, maxH: GRID_ROWS };
      const minW = rules.minW;
      const minH = rules.minH;
      const maxW = rules.maxW || GRID_COLS;
      const maxH = rules.maxH || GRID_ROWS;

      if (nextGridW < minW) nextGridW = minW;
      if (nextGridH < minH) nextGridH = minH;
      if (nextGridW > maxW) nextGridW = maxW;
      if (nextGridH > maxH) nextGridH = maxH;

      if (widgetData.gridX + nextGridW > GRID_COLS) nextGridW = GRID_COLS - widgetData.gridX;
      if (widgetData.gridY + nextGridH > GRID_ROWS) nextGridH = GRID_ROWS - widgetData.gridY;

      currentGridW = nextGridW;
      currentGridH = nextGridH;

      preview.style.width = (currentGridW / GRID_COLS) * 100 + '%';
      preview.style.height = (currentGridH / GRID_ROWS) * 100 + '%';

      widgetFrame.style.width = (currentGridW / GRID_COLS) * 100 + '%';
      widgetFrame.style.height = (currentGridH / GRID_ROWS) * 100 + '%';

      // リアルタイムにサイズクラスをトグル付与
      applyAdaptiveLayoutClasses(widgetFrame, widgetData.type, currentGridW, currentGridH);
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      widgetFrame.classList.remove('resizing');
      preview.remove();

      widgetData.gridW = currentGridW;
      widgetData.gridH = currentGridH;

      // 重なった際の押し退け解決
      resolveWidgetCollisions(widgetData.id);

      saveWidgets();
      renderWidgets(); // リビルド
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// カレンダーウィジェット用のHTML生成
export function generateCalendarHtml(widget) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  
  const monthNames = [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月'
  ];

  const cells = [];
  
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, isCurrentMonth: false });
  }

  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, isCurrentMonth: true });
  }

  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) {
    cells.push({ day: i, isCurrentMonth: false });
  }

  let tableRowsHtml = '';
  for (let row = 0; row < 6; row++) {
    tableRowsHtml += '<tr>';
    for (let col = 0; col < 7; col++) {
      const cellIdx = row * 7 + col;
      const cell = cells[cellIdx];
      const isToday = cell.isCurrentMonth && cell.day === now.getDate();
      
      let className = '';
      if (!cell.isCurrentMonth) className = 'other-month';
      if (isToday) className = 'today-cell';

      tableRowsHtml += `<td class="${className}">${cell.day}</td>`;
    }
    tableRowsHtml += '</tr>';
  }

  const dayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
  const currentDayName = dayNames[now.getDay()];
  const currentDayNum = now.getDate();
  const currentYearMonth = `${year}年 ${monthNames[month]}`;

  const dayColorStyle = now.getDay() === 0 ? 'color: #f87171;' : (now.getDay() === 6 ? 'color: #60a5fa;' : '');

  const detailPaneHtml = `
    <div class="calendar-detail-pane">
      <span class="calendar-detail-dayname" style="${dayColorStyle}">${currentDayName}</span>
      <span class="calendar-detail-daynum">${currentDayNum}</span>
      <span class="calendar-detail-month">${currentYearMonth}</span>
    </div>
  `;

  return `
    <div class="widget-calendar-container">
      ${detailPaneHtml}
      <div class="calendar-grid-pane">
        <div class="calendar-month-year">${year}年 ${monthNames[month]}</div>
        <table class="calendar-table">
          <thead>
            <tr>
              <th style="color: #f87171;">日</th>
              <th>月</th>
              <th>火</th>
              <th>水</th>
              <th>木</th>
              <th>金</th>
              <th style="color: #60a5fa;">土</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// メモの入力内容に応じてウィジェットの高さを自動伸縮させる
export function adjustMemoWidgetHeight(frameEl, widget, textarea) {
  if (!frameEl || !widget || !textarea) return;

  // コンテンツの実際の高さを測定するために高さを一時的に 'auto' に
  const prevHeight = textarea.style.height;
  textarea.style.height = 'auto';
  const scrollHeight = textarea.scrollHeight;
  textarea.style.height = prevHeight;

  // 1グリッドあたりの高さを計算 (画面高の 1/GRID_ROWS)
  const cellH = window.innerHeight / GRID_ROWS;

  // ツールバーやヘッダー分の高さを考慮
  const isLarge = widget.gridW >= 10 && widget.gridH >= 8;
  const toolbarHeight = isLarge ? 30 : 0;
  
  // 編集モード（body.edit-modeがあるか）のヘッダー高さ
  const isEditMode = document.body.classList.contains('edit-mode');
  const headerHeight = isEditMode ? 30 : 0;
  
  // パディングや枠線の追加幅（上下パディング 8px + 枠線2px等）
  const extraHeight = toolbarHeight + headerHeight + 16;

  // 最適なグリッド高さ (切り上げ)
  let targetGridH = Math.ceil((scrollHeight + extraHeight) / cellH);
  
  // 最小・最大制限 (4マス〜16マス)
  targetGridH = Math.max(4, Math.min(16, targetGridH));

  // 高さが変わる場合のみ反映
  if (targetGridH !== widget.gridH) {
    widget.gridH = targetGridH;

    // 他のウィジェットとの衝突判定と連鎖退避をトリガー
    resolveWidgetCollisions(widget.id);

    // インプレースでDOMの位置・サイズを更新
    updateWidgetsPositionsOnly();
  }
}

// すべてのウィジェットをDOM構築
export function renderWidgets() {
  if (!elements.widgetsLayer) return;
  
  elements.widgetsLayer.innerHTML = '';

  appState.currentSettings.widgets.forEach(widget => {
    const frame = document.createElement('div');
    frame.className = `widget-frame widget-type-${widget.type}`;
    frame.dataset.id = widget.id;

    // レスポンシブな絶対配置 (GRID_COLS x GRID_ROWS)
    frame.style.left = (widget.gridX / GRID_COLS) * 100 + '%';
    frame.style.top = (widget.gridY / GRID_ROWS) * 100 + '%';
    frame.style.width = (widget.gridW / GRID_COLS) * 100 + '%';
    frame.style.height = (widget.gridH / GRID_ROWS) * 100 + '%';

    // アダプティブレイアウト用クラスの初期適用
    applyAdaptiveLayoutClasses(frame, widget.type, widget.gridW, widget.gridH);

    let title = 'ウィジェット';
    let bodyHtml = '';

    if (widget.type === 'search-bar') {
      title = 'Google 検索';
      const isSmall = widget.gridW < 12;
      bodyHtml = `
        <form id="search-form" action="https://www.google.com/search" method="get">
          <div class="search-input-wrapper">
            <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" name="q" id="search-input" placeholder="${isSmall ? '検索...' : 'Google で検索、またはURLを入力'}" autocomplete="off">
          </div>
          <ul id="search-suggest-list" class="hidden"></ul>
        </form>
      `;
    } else if (widget.type === 'digital-clock') {
      title = 'デジタル時計';
      bodyHtml = `
        <div class="widget-digital-clock">
          <div class="clock-time">00:00:00</div>
          <div class="clock-date">0000年00月00日</div>
        </div>
      `;
    } else if (widget.type === 'analog-clock') {
      title = 'アナログ時計';
      bodyHtml = `
        <div class="widget-analog-clock">
          <div class="analog-clock-face">
            <div class="clock-hand hour"></div>
            <div class="clock-hand minute"></div>
            <div class="clock-hand second"></div>
            <div class="clock-center-dot"></div>
          </div>
        </div>
      `;
    } else if (widget.type === 'calendar') {
      title = 'カレンダー';
      bodyHtml = generateCalendarHtml(widget);
    } else if (widget.type === 'memo') {
      title = 'メモ帳';
      const text = widget.settings.text || '';
      const isLarge = widget.gridW >= 5 && widget.gridH >= 4;
      const activeColor = widget.settings.color || 'default';

      const toolbarHtml = `
        <div class="memo-toolbar">
          <div class="memo-color-palette">
            <div class="color-dot color-default ${activeColor === 'default' ? 'active' : ''}" data-color="default" title="デフォルト"></div>
            <div class="color-dot color-yellow ${activeColor === 'yellow' ? 'active' : ''}" data-color="yellow" title="黄"></div>
            <div class="color-dot color-green ${activeColor === 'green' ? 'active' : ''}" data-color="green" title="緑"></div>
            <div class="color-dot color-blue ${activeColor === 'blue' ? 'active' : ''}" data-color="blue" title="青"></div>
          </div>
          <div class="memo-right-controls">
            <span class="memo-stats"><span class="memo-char-count">${text.length}</span>文字</span>
            <button class="memo-btn memo-clear-btn" title="内容をクリア">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;

      bodyHtml = `
        <div class="widget-memo">
          ${isLarge ? toolbarHtml : ''}
          <textarea class="memo-textarea" placeholder="メモを入力...">${escapeHtml(text)}</textarea>
        </div>
      `;

      frame.classList.remove('memo-theme-yellow', 'memo-theme-green', 'memo-theme-blue');
      if (activeColor !== 'default') {
        frame.classList.add(`memo-theme-${activeColor}`);
      }
    } else if (widget.type === 'todo') {
      title = 'ToDoリスト';
      bodyHtml = `
        <div class="widget-todo-container" data-filter="all">
          <!-- 進捗バーエリア -->
          <div class="todo-progress-area">
            <div class="todo-progress-text">
              <span>タスクの進捗</span>
              <span class="todo-progress-percent">0/0 (0%)</span>
            </div>
            <div class="todo-progress-bar-container">
              <div class="todo-progress-bar" style="width: 0%"></div>
            </div>
          </div>
          
          <!-- フィルター ＆ 一括削除エリア -->
          <div class="todo-toolbar">
            <div class="todo-filter-area">
              <button class="todo-filter-btn active" data-filter="all">すべて</button>
              <button class="todo-filter-btn" data-filter="active">未完了</button>
              <button class="todo-filter-btn" data-filter="completed">完了</button>
            </div>
            <button class="todo-clear-completed-btn" title="完了済みを一括削除">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
          
          <!-- タスクリスト -->
          <ul class="todo-list"></ul>
          
          <!-- タスク追加入力エリア -->
          <div class="todo-add-area">
            <input type="text" class="todo-input" placeholder="タスクを追加...">
            <button class="todo-add-btn">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>
        </div>
      `;
    } else if (widget.type === 'rss') {
      title = 'RSS フィード';
      bodyHtml = `
        <div class="widget-rss-container" id="rss-container-${widget.id}">
          <div class="widget-rss-loading">
            <svg class="rss-spinner-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
            <span>読み込み中...</span>
          </div>
        </div>
      `;
    }

    frame.innerHTML = `
      <div class="widget-header">
        <span class="widget-title">${title}</span>
        <button class="widget-close-btn" aria-label="削除">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div class="widget-body">
        ${bodyHtml}
        <div class="widget-resize-handle"></div>
      </div>
    `;

    // 削除ボタンのバインド
    frame.querySelector('.widget-close-btn').addEventListener('click', () => {
      appState.currentSettings.widgets = appState.currentSettings.widgets.filter(w => w.id !== widget.id);
      
      // 検索バー削除時のトグル同期処理はトグル廃止のため削除
      
      saveWidgets();
      renderWidgets();
    });

    // 検索バーのキャッシュ更新＆リスナー個別バインド
    if (widget.type === 'search-bar') {
      elements.searchForm = frame.querySelector('#search-form');
      elements.searchInput = frame.querySelector('#search-input');
      elements.suggestList = frame.querySelector('#search-suggest-list');

      elements.searchInput.addEventListener('focus', () => { appState.isShortcutDialogOpen = true; });
      elements.searchInput.addEventListener('blur', () => { appState.isShortcutDialogOpen = false; closeShortcutsDrawer(); });
      
      // サジェストリスナーを個別バインド
      elements.searchInput.addEventListener('input', handleSearchInput);
      elements.searchInput.addEventListener('keydown', handleSearchKeydown);
    }

    // メモ帳のバインド (カラーパレット・文字数・クリア機能)
    if (widget.type === 'memo') {
      const textarea = frame.querySelector('.memo-textarea');
      const charCountSpan = frame.querySelector('.memo-char-count');

      textarea.addEventListener('input', (e) => {
        const text = e.target.value;
        widget.settings.text = text;
        if (charCountSpan) {
          charCountSpan.textContent = text.length;
        }
        
        // 入力内容に合わせて高さを自動フィット
        adjustMemoWidgetHeight(frame, widget, textarea);
        
        saveWidgets();
      });
      textarea.addEventListener('focus', () => { appState.isShortcutDialogOpen = true; });
      textarea.addEventListener('blur', () => { appState.isShortcutDialogOpen = false; closeShortcutsDrawer(); });

      frame.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
          const color = e.target.dataset.color;
          widget.settings.color = color;

          frame.classList.remove('memo-theme-yellow', 'memo-theme-green', 'memo-theme-blue');
          if (color !== 'default') {
            frame.classList.add(`memo-theme-${color}`);
          }

          frame.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
          e.target.classList.add('active');

          saveWidgets();
        });
      });

      const clearBtn = frame.querySelector('.memo-clear-btn');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          if (confirm('メモの内容をすべて削除しますか？')) {
            textarea.value = '';
            widget.settings.text = '';
            if (charCountSpan) charCountSpan.textContent = 0;
            adjustMemoWidgetHeight(frame, widget, textarea); // 最小高さにリセット
            saveWidgets();
          }
        });
      }

      // 初期描画時に最適な高さにフィットさせる
      setTimeout(() => {
        adjustMemoWidgetHeight(frame, widget, textarea);
      }, 50);
    }

    // 右クリックで個別不透明度コンテキストメニューを開く
    frame.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, widget);
    });

    // 長押しで編集モードに入るイベントリスナー
    frame.addEventListener('mousedown', (e) => {
      if (document.body.classList.contains('edit-mode') || appState.isEditMode) return;
      if (e.target.closest('.widget-close-btn') || e.target.closest('.widget-resize-handle') || e.target.closest('textarea') || e.target.closest('input')) return;

      appState.pressStartX = e.clientX;
      appState.pressStartY = e.clientY;

      appState.longPressTimer = setTimeout(() => {
        enterEditMode();
        appState.longPressTimer = null;
      }, LONG_PRESS_DELAY);
    });

    frame.addEventListener('mousemove', (e) => {
      if (appState.longPressTimer) {
        const distance = Math.hypot(e.clientX - appState.pressStartX, e.clientY - appState.pressStartY);
        if (distance > 8) {
          clearTimeout(appState.longPressTimer);
          appState.longPressTimer = null;
        }
      }
    });

    // 移動とリサイズのバインド
    makeWidgetDraggable(frame, widget);
    makeWidgetResizable(frame, widget);

    // 個別不透明度の初期適用
    const opacity = (widget.settings && widget.settings.opacity !== undefined) ? widget.settings.opacity : 55;
    applyWidgetOpacityStyle(frame, widget, opacity);

    elements.widgetsLayer.appendChild(frame);

    // RSSウィジェットのマウント後処理
    if (widget.type === 'rss') {
      loadRssWidgetData(widget);
    }

    // ToDoリストウィジェットのバインド
    if (widget.type === 'todo') {
      initTodoWidget(frame, widget);
    }
  });

  // 時計類の初期更新
  updateWidgetsTime();
}

// グローバル時計更新タイマー
export function updateWidgetsTime() {
  const now = new Date();
  
  // デジタル時計の更新
  document.querySelectorAll('.widget-type-digital-clock').forEach(clockFrame => {
    const id = clockFrame.dataset.id;
    const widget = appState.currentSettings.widgets.find(w => w.id === id);
    if (!widget) return;

    const timeEl = clockFrame.querySelector('.clock-time');
    const dateEl = clockFrame.querySelector('.clock-date');
    const isSmall = widget.gridW < 5 || widget.gridH < 2;

    if (timeEl) {
      if (isSmall) {
        const hr = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        timeEl.textContent = `${hr}:${min}`;
      } else {
        const hr = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const sec = String(now.getSeconds()).padStart(2, '0');
        timeEl.textContent = `${hr}:${min}:${sec}`;
      }
    }

    if (dateEl) {
      if (isSmall) {
        dateEl.textContent = '';
      } else {
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const date = now.getDate();
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        const day = dayNames[now.getDay()];
        dateEl.textContent = `${year}年${month}月${date}日 (${day})`;
      }
    }
  });

  // アナログ時計の更新
  const sec = now.getSeconds();
  const min = now.getMinutes();
  const hr = now.getHours();
  const secDeg = (sec / 60) * 360;
  const minDeg = ((min + sec / 60) / 60) * 360;
  const hrDeg = (((hr % 12) + min / 60) / 12) * 360;

  document.querySelectorAll('.widget-analog-clock').forEach(clock => {
    const hrHand = clock.querySelector('.clock-hand.hour');
    const minHand = clock.querySelector('.clock-hand.minute');
    const secHand = clock.querySelector('.clock-hand.second');
    if (hrHand) hrHand.style.transform = `translateX(-50%) rotate(${hrDeg}deg)`;
    if (minHand) minHand.style.transform = `translateX(-50%) rotate(${minDeg}deg)`;
    if (secHand) secHand.style.transform = `translateX(-50%) rotate(${secDeg}deg)`;
  });
}

// タイマーの起動
export function initWidgetsTimer() {
  if (!widgetsGlobalTimer) {
    widgetsGlobalTimer = setInterval(updateWidgetsTime, 1000);
  }
}

// 編集モードに入る
export function enterEditMode() {
  if (appState.isEditMode) return;
  appState.isEditMode = true;
  document.body.classList.add('edit-mode');
  updateAllWidgetsOpacityStyles();
}

// 編集モードを終了する
export function exitEditMode() {
  if (!appState.isEditMode) return;
  appState.isEditMode = false;
  document.body.classList.remove('edit-mode');
  updateAllWidgetsOpacityStyles();
}

// ドラッグ/リサイズ中にDOMを破壊せず、位置とサイズのみをインプレースで直接更新する軽量反映関数
export function updateWidgetsPositionsOnly() {
  appState.currentSettings.widgets.forEach(widget => {
    const frame = document.querySelector(`[data-id="${widget.id}"]`);
    if (frame) {
      if (frame.classList.contains('dragging') || frame.classList.contains('resizing')) {
        return;
      }
      frame.style.left = (widget.gridX / GRID_COLS) * 100 + '%';
      frame.style.top = (widget.gridY / GRID_ROWS) * 100 + '%';
      frame.style.width = (widget.gridW / GRID_COLS) * 100 + '%';
      frame.style.height = (widget.gridH / GRID_ROWS) * 100 + '%';
    }
  });
}

// ウィジェットのサイズに応じたレイアウトクラスを付与するヘルパー
export function applyAdaptiveLayoutClasses(frame, type, w, h) {
  if (type === 'digital-clock') {
    const isSmall = w < 10 || h < 4;
    if (isSmall) {
      frame.classList.add('layout-small');
      frame.classList.remove('layout-large');
    } else {
      frame.classList.add('layout-large');
      frame.classList.remove('layout-small');
    }
    // 縦2マス以下の超スリム専用クラス
    if (h <= 2) {
      frame.classList.add('layout-height-1');
    } else {
      frame.classList.remove('layout-height-1');
    }
  } else if (type === 'analog-clock') {
    const isSmall = w < 10 || h < 10;
    if (isSmall) {
      frame.classList.add('layout-small');
    } else {
      frame.classList.remove('layout-small');
    }
  } else if (type === 'calendar') {
    const isLarge = w >= 14 && h >= 10;
    if (isLarge) {
      frame.classList.add('layout-large');
    } else {
      frame.classList.remove('layout-large');
    }
  } else if (type === 'memo') {
    const isLarge = w >= 10 && h >= 8;
    if (isLarge) {
      frame.classList.add('layout-large');
    } else {
      frame.classList.remove('layout-large');
    }
  } else if (type === 'rss') {
    const isTicker = h <= 4 && w >= 16;
    if (isTicker) {
      frame.classList.add('layout-ticker');
      // リサイズにより幅が変わるため、等速スクロール速度を動的再計算
      updateTickerSpeed(frame);
    } else {
      frame.classList.remove('layout-ticker');
    }
  } else if (type === 'todo') {
    if (h < 6) {
      frame.classList.add('layout-small');
      frame.classList.remove('layout-large');
    } else if (w >= 10 && h >= 10) {
      frame.classList.add('layout-large');
      frame.classList.remove('layout-small');
    } else {
      frame.classList.remove('layout-small');
      frame.classList.remove('layout-large');
    }
  }
}

// ティッカーの実際の幅から等速スクロールのアニメーション秒数を算出して適用する
export function updateTickerSpeed(frameEl, speedLevel) {
  if (!frameEl) return;

  let level = speedLevel;
  if (level === undefined || level === null) {
    const widgetId = frameEl.getAttribute('data-id');
    const widget = appState.currentSettings.widgets.find(w => w.id === widgetId);
    level = (widget && widget.settings && widget.settings.tickerSpeed !== undefined)
      ? widget.settings.tickerSpeed
      : 5;
  }

  const itemsEl = frameEl.querySelector('.ticker-items');
  const trackEl = frameEl.querySelector('.ticker-track');

  if (itemsEl && trackEl) {
    const L = itemsEl.offsetWidth;
    if (L === 0) {
      // まだDOMが描画されておらず幅が取得できない場合は、少し遅延させて再計算
      setTimeout(() => updateTickerSpeed(frameEl, level), 150);
      return;
    }

    // 速度レベルから秒速 V (px/s) を算出 (レベル1 = 20px/s, レベル5 = 100px/s, レベル10 = 200px/s)
    const V = parseInt(level) * 20;

    // 1往復にかかる時間 T = 距離 L / 速度 V
    const T = L / V;

    trackEl.style.animationDuration = `${T}s`;
  }
}

// =============================================================
// RSS Feed Non-blocking Fetch & Parse Helpers
// =============================================================

export function loadRssWidgetData(widget) {
  const container = document.getElementById(`rss-container-${widget.id}`);
  if (!container) return;

  const DEFAULT_RSS = 'https://news.yahoo.co.jp/rss/topics/top-picks.xml';
  
  // 複数URL配列、無ければ単一URLを配列化して使用、それも無ければデフォルトRSSを配列化
  let rssUrls = [];
  if (widget.settings) {
    if (Array.isArray(widget.settings.rssUrls) && widget.settings.rssUrls.length > 0) {
      rssUrls = widget.settings.rssUrls;
    } else if (widget.settings.rssUrl) {
      rssUrls = [widget.settings.rssUrl];
    }
  }
  if (rssUrls.length === 0) {
    rssUrls = [DEFAULT_RSS];
  }

  try {
    // 全URLのオリジンパターンを抽出
    const origins = [];
    for (const url of rssUrls) {
      const urlObj = new URL(url);
      origins.push(`${urlObj.protocol}//${urlObj.hostname}/*`);
    }
    const uniqueOrigins = [...new Set(origins)];

    if (typeof chrome !== 'undefined' && chrome.permissions && chrome.permissions.contains) {
      // 拡張機能環境: すべてのオリジンの許可があるか確認
      chrome.permissions.contains({
        origins: uniqueOrigins
      }, (hasPermission) => {
        if (hasPermission) {
          fetchAndRenderRss(container, rssUrls, widget);
        } else {
          renderPermissionRequest(container, widget, uniqueOrigins, rssUrls);
        }
      });
    } else {
      // 拡張機能外（テスト環境）: 直接フェッチ
      fetchAndRenderRss(container, rssUrls, widget);
    }
  } catch (err) {
    renderRssError(container, '無効なURLが登録されています。右クリックから設定し直してください。');
  }
}

// 許可リクエスト用画面のレンダリング
function renderPermissionRequest(container, widget, origins, rssUrls) {
  container.innerHTML = `
    <div class="widget-rss-permission-request">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
      <span style="font-size: 11px; margin-bottom: 4px; line-height: 1.4; text-align: center;">表示するには登録ドメインへの通信許可が必要です</span>
      <button class="rss-request-btn">アクセス許可を付与</button>
    </div>
  `;

  const btn = container.querySelector('.rss-request-btn');
  btn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.permissions && chrome.permissions.request) {
      chrome.permissions.request({
        origins: origins
      }, (granted) => {
        if (granted) {
          if (!widget.settings) widget.settings = {};
          widget.settings.rssUrls = rssUrls;
          widget.settings.rssUrl = rssUrls[0] || '';
          saveWidgets();
          fetchAndRenderRss(container, rssUrls, widget);
        } else {
          alert('RSSを表示するにはアクセス許可が必要です。');
        }
      });
    } else {
      fetchAndRenderRss(container, rssUrls, widget);
    }
  });
}

// RSSフェッチ＆XMLパース＆DOM描画処理
function fetchAndRenderRss(container, rssUrls, widget) {
  // rssUrls が単一文字列として渡された場合のセーフティガード（念のため）
  const urls = Array.isArray(rssUrls) ? rssUrls : [rssUrls];

  container.innerHTML = `
    <div class="widget-rss-loading">
      <svg class="rss-spinner-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
      <span>フィードを読み込み中...</span>
    </div>
  `;

  // 各URLのフェッチを並列で実行
  const fetchPromises = urls.map(url => {
    return fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(xmlText => {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) throw new Error('XMLパースエラー');
        return { url, xmlDoc };
      });
  });

  Promise.allSettled(fetchPromises)
    .then(results => {
      const allItems = [];
      let activeChannelTitle = 'RSS Feed';
      let successCount = 0;

      results.forEach(result => {
        if (result.status === 'fulfilled') {
          successCount++;
          const { url, xmlDoc } = result.value;
          const channel = xmlDoc.querySelector('channel');
          
          // フィードタイトル（チャンネル名）の抽出
          let channelTitle = 'RSS Feed';
          if (channel && channel.querySelector('title')) {
            channelTitle = channel.querySelector('title').textContent;
          } else {
            // Atomフィード等
            const feedTitleNode = xmlDoc.querySelector('feed > title');
            if (feedTitleNode) {
              channelTitle = feedTitleNode.textContent;
            }
          }

          // 記事アイテムのパース（各フィード最大15件）
          const items = Array.from(xmlDoc.querySelectorAll('item, entry')).slice(0, 15);
          items.forEach(item => {
            const title = item.querySelector('title') ? item.querySelector('title').textContent : '無題の記事';
            
            let link = '#';
            const linkNode = item.querySelector('link');
            if (linkNode) {
              link = linkNode.textContent.trim() || linkNode.getAttribute('href') || '#';
            }

            const pubDateNode = item.querySelector('pubDate') || 
                                item.querySelector('date') || 
                                item.getElementsByTagName('dc:date')[0] || 
                                item.querySelector('published') || 
                                item.querySelector('updated');
            
            let dateObj = null;
            let dateStr = '';
            if (pubDateNode) {
              try {
                const date = new Date(pubDateNode.textContent);
                if (!isNaN(date.getTime())) {
                  dateObj = date;
                  dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                } else {
                  dateStr = pubDateNode.textContent.trim();
                }
              } catch(e) {
                dateStr = pubDateNode.textContent.trim();
              }
            }

            // チャンネル名をクリーンにする（長すぎる場合にトリム）
            const cleanChannel = channelTitle
              .replace(/のRSS.*$/, '')
              .replace(/フィード.*$/, '')
              .substring(0, 10)
              .trim();

            allItems.push({
              title,
              link,
              dateObj: dateObj || new Date(0), // 日付のないものは最古に
              dateStr,
              source: cleanChannel
            });
          });

          if (urls.length === 1) {
            activeChannelTitle = channelTitle;
          }
        }
      });

      if (successCount === 0) {
        throw new Error('すべてのフィードの取得に失敗しました。');
      }

      if (allItems.length === 0) {
        container.innerHTML = `
          <div class="widget-rss-container">
            <div class="widget-rss-header">RSSフィード</div>
            <div class="widget-rss-error">
              <span>新着記事が見つかりません。</span>
            </div>
          </div>
        `;
        return;
      }

      // 日付の降順でマージソート
      allItems.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

      // 最大30件を取り出す
      const displayItems = allItems.slice(0, 30);

      // ウィジェットフレームのクラスからティッカー表示かリスト表示かを判定
      const frameEl = container.closest('.widget-frame');
      const isTicker = frameEl ? frameEl.classList.contains('layout-ticker') : false;

      if (isTicker) {
        // 電光掲示板（ニュースティッカー）モード
        const tickerItems = displayItems.map(item => {
          return `<a href="${escapeHtml(item.link)}" class="ticker-link" target="_blank" rel="noopener noreferrer"><span class="ticker-source-tag">[${escapeHtml(item.source)}]</span> ${escapeHtml(item.title)}</a>`;
        });

        // 繰り返し繋ぎ目をなくすため、2つ同じものを繋いでスクロールさせる
        const tickerItemsHtml = tickerItems.join(' <span class="ticker-dot">•</span> ');

        const level = (widget && widget.settings && widget.settings.tickerSpeed !== undefined)
          ? widget.settings.tickerSpeed
          : 5;

        // 複数URLの場合は「複数フィード」
        const headerTitle = urls.length > 1 ? '複数フィード' : activeChannelTitle;

        container.innerHTML = `
          <div class="widget-rss-ticker-container">
            <span class="ticker-channel-tag" title="${escapeHtml(headerTitle)}">${escapeHtml(headerTitle)}</span>
            <div class="ticker-scroll-window">
              <div class="ticker-track">
                <div class="ticker-items">${tickerItemsHtml}</div>
                <div class="ticker-items" aria-hidden="true">${tickerItemsHtml}</div>
              </div>
            </div>
          </div>
        `;

        // 描画確定後に等速スクロールのアニメーション時間を動的適用
        setTimeout(() => {
          updateTickerSpeed(frameEl, level);
        }, 100);
      } else {
        // 通常のリストモード
        let listHtml = '';
        displayItems.forEach(item => {
          listHtml += `
            <li class="widget-rss-item">
              <a href="${escapeHtml(item.link)}" class="widget-rss-link" target="_blank" rel="noopener noreferrer">
                <span class="widget-rss-source-label">[${escapeHtml(item.source)}]</span> ${escapeHtml(item.title)}
              </a>
              ${item.dateStr ? `<span class="widget-rss-date">${escapeHtml(item.dateStr)}</span>` : ''}
            </li>
          `;
        });

        const headerTitle = urls.length > 1 ? '複数フィードの統合' : activeChannelTitle;

        container.innerHTML = `
          <div class="widget-rss-container">
            <div class="widget-rss-header" title="${escapeHtml(headerTitle)}">${escapeHtml(headerTitle)}</div>
            <ul class="widget-rss-list">
              ${listHtml}
            </ul>
          </div>
        `;
      }
    })
    .catch(err => {
      console.warn('RSSフェッチエラー:', err);
      renderRssError(container, 'フィードの取得に失敗しました。URLを確認するか、しばらく待ってから右クリックメニュー等で再読込してください。');
    });
}

// エラー画面のレンダリング
function renderRssError(container, message) {
  container.innerHTML = `
    <div class="widget-rss-error">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
      <span style="font-size: 11px; line-height: 1.4;">${escapeHtml(message)}</span>
    </div>
  `;
}

// ToDoリストウィジェットの初期化
function initTodoWidget(frameEl, widget) {
  if (!widget.settings) {
    widget.settings = {};
  }
  if (!widget.settings.todos) {
    widget.settings.todos = [];
  }
  if (!widget.settings.filter) {
    widget.settings.filter = 'all';
  }

  const todoContainer = frameEl.querySelector('.widget-todo-container');
  const inputEl = todoContainer.querySelector('.todo-input');
  const addBtn = todoContainer.querySelector('.todo-add-btn');
  const clearCompletedBtn = todoContainer.querySelector('.todo-clear-completed-btn');
  const filterBtns = todoContainer.querySelectorAll('.todo-filter-btn');

  // 初期フィルター設定
  todoContainer.setAttribute('data-filter', widget.settings.filter);
  filterBtns.forEach(btn => {
    if (btn.dataset.filter === widget.settings.filter) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // リストの初期表示と進捗の更新
  updateTodoList(frameEl, widget);

  // タスク追加イベント
  const handleAddTodo = () => {
    const text = inputEl.value.trim();
    if (!text) return;

    const newTodo = {
      id: 'todo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      text: text,
      completed: false
    };

    widget.settings.todos.push(newTodo);
    inputEl.value = '';
    
    saveWidgets();
    updateTodoList(frameEl, widget);
  };

  addBtn.addEventListener('click', handleAddTodo);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleAddTodo();
    }
  });

  // フィルター切り替えイベント
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const filter = btn.dataset.filter;
      widget.settings.filter = filter;
      todoContainer.setAttribute('data-filter', filter);
      
      saveWidgets();
      updateTodoList(frameEl, widget);
    });
  });

  // 完了済みの一括削除イベント
  if (clearCompletedBtn) {
    clearCompletedBtn.addEventListener('click', () => {
      const completedCount = widget.settings.todos.filter(t => t.completed).length;
      if (completedCount === 0) return;

      if (confirm(`完了済みのタスク ${completedCount} 件を一括削除しますか？`)) {
        widget.settings.todos = widget.settings.todos.filter(t => !t.completed);
        saveWidgets();
        updateTodoList(frameEl, widget);
      }
    });
  }

  // ショートカットドロワー用のフォーカスイベント
  inputEl.addEventListener('focus', () => { appState.isShortcutDialogOpen = true; });
  inputEl.addEventListener('blur', () => { appState.isShortcutDialogOpen = false; closeShortcutsDrawer(); });
}

// ToDoリストアイテムの描画更新
function updateTodoList(frameEl, widget) {
  const todoContainer = frameEl.querySelector('.widget-todo-container');
  const listEl = todoContainer.querySelector('.todo-list');
  listEl.innerHTML = '';

  const todos = widget.settings.todos || [];
  const filter = widget.settings.filter || 'all';

  // フィルターされたタスクの決定
  let filteredTodos = todos;
  if (filter === 'active') {
    filteredTodos = todos.filter(t => !t.completed);
  } else if (filter === 'completed') {
    filteredTodos = todos.filter(t => t.completed);
  }

  if (filteredTodos.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'todo-empty-state';
    if (filter === 'completed') {
      emptyEl.textContent = '完了済みのタスクはありません';
    } else if (filter === 'active') {
      emptyEl.textContent = '未完了のタスクはありません';
    } else {
      emptyEl.textContent = 'タスクがありません。下から追加してください';
    }
    listEl.appendChild(emptyEl);
  } else {
    filteredTodos.forEach(todo => {
      const li = document.createElement('li');
      li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
      li.dataset.todoId = todo.id;

      li.innerHTML = `
        <button class="todo-check-btn" aria-label="タスクの状態切り替え">
          <svg class="todo-check-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </button>
        <span class="todo-text">${escapeHtml(todo.text)}</span>
        <button class="todo-delete-btn" aria-label="タスクを削除">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;

      // チェック切り替えイベント
      li.querySelector('.todo-check-btn').addEventListener('click', () => {
        todo.completed = !todo.completed;
        saveWidgets();
        updateTodoList(frameEl, widget);
      });

      // 個別削除イベント
      li.querySelector('.todo-delete-btn').addEventListener('click', () => {
        widget.settings.todos = widget.settings.todos.filter(t => t.id !== todo.id);
        saveWidgets();
        updateTodoList(frameEl, widget);
      });

      listEl.appendChild(li);
    });
  }

  // 進捗バーの更新
  updateTodoProgress(frameEl, widget);
}

// 進捗バーのリアルタイム更新
function updateTodoProgress(frameEl, widget) {
  const todoContainer = frameEl.querySelector('.widget-todo-container');
  const percentEl = todoContainer.querySelector('.todo-progress-percent');
  const progressBar = todoContainer.querySelector('.todo-progress-bar');

  const todos = widget.settings.todos || [];
  const total = todos.length;
  const completed = todos.filter(t => t.completed).length;
  
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (percentEl) {
    percentEl.textContent = `${completed}/${total} (${percent}%)`;
  }
  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }
}
