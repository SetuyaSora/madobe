/* -------------------------------------------------------------
 * Chrome Wallpaper - Widgets Control & Render Module
 * ------------------------------------------------------------- */

import { appState, elements, escapeHtml, WIDGET_RULES, LONG_PRESS_DELAY } from './state.js';
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
      return { w: 10, h: 1 };
    case 'digital-clock':
      return { w: 6, h: 3 };
    case 'analog-clock':
      return { w: 4, h: 4 };
    case 'calendar':
      return { w: 6, h: 5 };
    case 'memo':
      return { w: 5, h: 4 };
    case 'rss':
      return { w: 6, h: 5 };
    default:
      return { w: 4, h: 3 };
  }
}

// グリッド配置スナッププレビューの更新
export function updateSnapPreview(clientX, clientY, size) {
  if (!elements.widgetsLayer) return;
  const rect = elements.widgetsLayer.getBoundingClientRect();
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;

  const cellW = rect.width / 24;
  const cellH = rect.height / 12;

  let gridX = Math.floor(mouseX / cellW);
  let gridY = Math.floor(mouseY / cellH);

  if (gridX + size.w > 24) gridX = 24 - size.w;
  if (gridY + size.h > 12) gridY = 12 - size.h;
  if (gridX < 0) gridX = 0;
  if (gridY < 0) gridY = 0;

  if (!dragPreviewEl) {
    dragPreviewEl = document.createElement('div');
    dragPreviewEl.className = 'widget-snap-preview';
    elements.widgetsLayer.appendChild(dragPreviewEl);
  }

  dragPreviewEl.style.left = (gridX / 24) * 100 + '%';
  dragPreviewEl.style.top = (gridY / 12) * 100 + '%';
  dragPreviewEl.style.width = (size.w / 24) * 100 + '%';
  dragPreviewEl.style.height = (size.h / 12) * 100 + '%';
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
    const cellW = layerRect.width / 24;
    const cellH = layerRect.height / 12;

    // スナッププレビュー作成
    const preview = document.createElement('div');
    preview.className = 'widget-snap-preview';
    preview.style.left = (widgetData.gridX / 24) * 100 + '%';
    preview.style.top = (widgetData.gridY / 12) * 100 + '%';
    preview.style.width = (widgetData.gridW / 24) * 100 + '%';
    preview.style.height = (widgetData.gridH / 12) * 100 + '%';
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
      if (nextGridX + widgetData.gridW > 24) nextGridX = 24 - widgetData.gridW;
      if (nextGridY + widgetData.gridH > 12) nextGridY = 12 - widgetData.gridH;

      // スナップ先のセル座標が変化した場合にリアルタイムで入れ替えと衝突解決を行う
      if (nextGridX !== currentGridX || nextGridY !== currentGridY) {
        // 重なるウィジェットをドラッグ元の空き座標と入れ替える (スワップ)
        swapWidgets(widgetData, nextGridX, nextGridY, dragStartPos);

        // 動かしている本人のデータを仮更新 (データ上で一度移動)
        widgetData.gridX = nextGridX;
        widgetData.gridY = nextGridY;

        // 二次衝突の自動退避
        resolveWidgetCollisions(widgetData.id);

        // 避ける側のウィジェットのDOMのみを滑らかにアニメーションスライドさせる
        updateWidgetsPositionsOnly();
      }

      currentGridX = nextGridX;
      currentGridY = nextGridY;

      preview.style.left = (currentGridX / 24) * 100 + '%';
      preview.style.top = (currentGridY / 12) * 100 + '%';

      // ドラッグ中のウィジェット自体はTransitionなしでリアルタイム追従
      widgetFrame.style.left = (currentGridX / 24) * 100 + '%';
      widgetFrame.style.top = (currentGridY / 12) * 100 + '%';
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      widgetFrame.classList.remove('dragging');
      preview.remove();

      // 最終スナップ位置を再セットして永続化
      widgetData.gridX = currentGridX;
      widgetData.gridY = currentGridY;

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
    const cellW = layerRect.width / 24;
    const cellH = layerRect.height / 12;

    // スナッププレビュー作成
    const preview = document.createElement('div');
    preview.className = 'widget-snap-preview';
    preview.style.left = (widgetData.gridX / 24) * 100 + '%';
    preview.style.top = (widgetData.gridY / 12) * 100 + '%';
    preview.style.width = (widgetData.gridW / 24) * 100 + '%';
    preview.style.height = (widgetData.gridH / 12) * 100 + '%';
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
      const rules = WIDGET_RULES[widgetData.type] || { minW: 2, minH: 2, maxW: 24, maxH: 12 };
      const minW = rules.minW;
      const minH = rules.minH;
      const maxW = rules.maxW || 24;
      const maxH = rules.maxH || 12;

      if (nextGridW < minW) nextGridW = minW;
      if (nextGridH < minH) nextGridH = minH;
      if (nextGridW > maxW) nextGridW = maxW;
      if (nextGridH > maxH) nextGridH = maxH;

      if (widgetData.gridX + nextGridW > 24) nextGridW = 24 - widgetData.gridX;
      if (widgetData.gridY + nextGridH > 12) nextGridH = 12 - widgetData.gridY;

      currentGridW = nextGridW;
      currentGridH = nextGridH;

      preview.style.width = (currentGridW / 24) * 100 + '%';
      preview.style.height = (currentGridH / 12) * 100 + '%';

      widgetFrame.style.width = (currentGridW / 24) * 100 + '%';
      widgetFrame.style.height = (currentGridH / 12) * 100 + '%';

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

// すべてのウィジェットをDOM構築
export function renderWidgets() {
  if (!elements.widgetsLayer) return;
  
  elements.widgetsLayer.innerHTML = '';

  appState.currentSettings.widgets.forEach(widget => {
    const frame = document.createElement('div');
    frame.className = `widget-frame widget-type-${widget.type}`;
    frame.dataset.id = widget.id;

    // レスポンシブな絶対配置 (24x12)
    frame.style.left = (widget.gridX / 24) * 100 + '%';
    frame.style.top = (widget.gridY / 12) * 100 + '%';
    frame.style.width = (widget.gridW / 24) * 100 + '%';
    frame.style.height = (widget.gridH / 12) * 100 + '%';

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
      
      if (widget.type === 'search-bar') {
        appState.currentSettings.showSearch = false;
        storage.set({ showSearch: false });
        if (elements.showSearchCheckbox) {
          elements.showSearchCheckbox.checked = false;
        }
      }
      
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
        widget.settings.text = e.target.value;
        if (charCountSpan) {
          charCountSpan.textContent = e.target.value.length;
        }
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
            saveWidgets();
          }
        });
      }
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
    const isSmall = widget.gridW < 5 || widget.gridH < 3;

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
      frame.style.left = (widget.gridX / 24) * 100 + '%';
      frame.style.top = (widget.gridY / 12) * 100 + '%';
      frame.style.width = (widget.gridW / 24) * 100 + '%';
      frame.style.height = (widget.gridH / 12) * 100 + '%';
    }
  });
}

// ウィジェットのサイズに応じたレイアウトクラスを付与するヘルパー
export function applyAdaptiveLayoutClasses(frame, type, w, h) {
  if (type === 'digital-clock') {
    const isSmall = w < 5 || h < 3;
    if (isSmall) {
      frame.classList.add('layout-small');
      frame.classList.remove('layout-large');
    } else {
      frame.classList.add('layout-large');
      frame.classList.remove('layout-small');
    }
  } else if (type === 'analog-clock') {
    const isSmall = w < 5 || h < 5;
    if (isSmall) {
      frame.classList.add('layout-small');
    } else {
      frame.classList.remove('layout-small');
    }
  } else if (type === 'calendar') {
    const isLarge = w >= 7 && h >= 5;
    if (isLarge) {
      frame.classList.add('layout-large');
    } else {
      frame.classList.remove('layout-large');
    }
  } else if (type === 'memo') {
    const isLarge = w >= 5 && h >= 4;
    if (isLarge) {
      frame.classList.add('layout-large');
    } else {
      frame.classList.remove('layout-large');
    }
  } else if (type === 'rss') {
    const isTicker = h <= 2 && w >= 8;
    if (isTicker) {
      frame.classList.add('layout-ticker');
    } else {
      frame.classList.remove('layout-ticker');
    }
  }
}

// =============================================================
// RSS Feed Non-blocking Fetch & Parse Helpers
// =============================================================

export function loadRssWidgetData(widget) {
  const container = document.getElementById(`rss-container-${widget.id}`);
  if (!container) return;

  const DEFAULT_RSS = 'https://news.yahoo.co.jp/rss/topics/top-picks.xml';
  const rssUrl = widget.settings.rssUrl || DEFAULT_RSS;

  try {
    const urlObj = new URL(rssUrl);
    const originPattern = `${urlObj.protocol}//${urlObj.hostname}/*`;

    if (typeof chrome !== 'undefined' && chrome.permissions && chrome.permissions.contains) {
      // 拡張機能環境: 該当オリジンの許可があるか確認
      chrome.permissions.contains({
        origins: [originPattern]
      }, (hasPermission) => {
        if (hasPermission) {
          fetchAndRenderRss(container, rssUrl);
        } else {
          renderPermissionRequest(container, widget, originPattern, rssUrl);
        }
      });
    } else {
      // 拡張機能外（テスト環境）: 直接フェッチ
      fetchAndRenderRss(container, rssUrl);
    }
  } catch (err) {
    renderRssError(container, '無効なURLが登録されています。右クリックから設定し直してください。');
  }
}

// 許可リクエスト用画面のレンダリング
function renderPermissionRequest(container, widget, originPattern, rssUrl) {
  container.innerHTML = `
    <div class="widget-rss-permission-request">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
      <span style="font-size: 11px; margin-bottom: 4px; line-height: 1.4;">表示するにはこのドメインへの通信許可が必要です</span>
      <button class="rss-request-btn">アクセス許可を付与</button>
    </div>
  `;

  const btn = container.querySelector('.rss-request-btn');
  btn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.permissions && chrome.permissions.request) {
      chrome.permissions.request({
        origins: [originPattern]
      }, (granted) => {
        if (granted) {
          if (!widget.settings) widget.settings = {};
          widget.settings.rssUrl = rssUrl;
          saveWidgets();
          fetchAndRenderRss(container, rssUrl);
        } else {
          alert('RSSを表示するにはアクセス許可が必要です。');
        }
      });
    } else {
      fetchAndRenderRss(container, rssUrl);
    }
  });
}

// RSSフェッチ＆XMLパース＆DOM描画処理
function fetchAndRenderRss(container, rssUrl) {
  container.innerHTML = `
    <div class="widget-rss-loading">
      <svg class="rss-spinner-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
      <span>フィードを読み込み中...</span>
    </div>
  `;

  fetch(rssUrl)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then(xmlText => {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) throw new Error('XMLパースエラー');

      const channel = xmlDoc.querySelector('channel');
      const channelTitle = channel ? channel.querySelector('title').textContent : 'RSS Feed';
      
      const items = Array.from(xmlDoc.querySelectorAll('item')).slice(0, 15);
      
      if (items.length === 0) {
        container.innerHTML = `
          <div class="widget-rss-container">
            <div class="widget-rss-header" title="${escapeHtml(channelTitle)}">${escapeHtml(channelTitle)}</div>
            <div class="widget-rss-error">
              <span>新着記事が見つかりません。</span>
            </div>
          </div>
        `;
        return;
      }

      // ウィジェットフレームのクラスからティッカー表示かリスト表示かを判定
      const frameEl = container.closest('.widget-frame');
      const isTicker = frameEl ? frameEl.classList.contains('layout-ticker') : false;

      if (isTicker) {
        // 電光掲示板（ニュースティッカー）モード
        const tickerItems = items.map(item => {
          const title = item.querySelector('title') ? item.querySelector('title').textContent : '無題の記事';
          
          let link = '#';
          const linkNode = item.querySelector('link');
          if (linkNode) {
            link = linkNode.textContent.trim() || linkNode.getAttribute('href') || '#';
          }
          return `<a href="${escapeHtml(link)}" class="ticker-link" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`;
        });

        // 繰り返し繋ぎ目をなくすため、2つ同じものを繋いでスクロールさせる
        const tickerItemsHtml = tickerItems.join(' <span class="ticker-dot">•</span> ');

        container.innerHTML = `
          <div class="widget-rss-ticker-container">
            <span class="ticker-channel-tag" title="${escapeHtml(channelTitle)}">${escapeHtml(channelTitle)}</span>
            <div class="ticker-scroll-window">
              <div class="ticker-track">
                <div class="ticker-items">${tickerItemsHtml}</div>
                <div class="ticker-items" aria-hidden="true">${tickerItemsHtml}</div>
              </div>
            </div>
          </div>
        `;
      } else {
        // 通常のリストモード
        let listHtml = '';
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
          
          let dateStr = '';
          if (pubDateNode) {
            try {
              const date = new Date(pubDateNode.textContent);
              if (!isNaN(date.getTime())) {
                dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
              } else {
                dateStr = pubDateNode.textContent.trim();
              }
            } catch(e) {
              dateStr = pubDateNode.textContent.trim();
            }
          }

          listHtml += `
            <li class="widget-rss-item">
              <a href="${escapeHtml(link)}" class="widget-rss-link" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>
              ${dateStr ? `<span class="widget-rss-date">${escapeHtml(dateStr)}</span>` : ''}
            </li>
          `;
        });

        container.innerHTML = `
          <div class="widget-rss-container">
            <div class="widget-rss-header" title="${escapeHtml(channelTitle)}">${escapeHtml(channelTitle)}</div>
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
