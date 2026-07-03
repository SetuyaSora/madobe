/* -------------------------------------------------------------
 * Chrome Wallpaper - Context Menu Module
 * ------------------------------------------------------------- */

import { appState, elements } from './state.js';
import { storage } from './storage.js';

let activeMenuWidget = null;

// コンテキストメニューを非表示にする
export function hideContextMenu() {
  if (elements.widgetContextMenu) {
    elements.widgetContextMenu.classList.add('hidden');
  }
  activeMenuWidget = null;
}

// コンテキストメニューを表示する（はみ出し自動調整付き）
export function showContextMenu(clientX, clientY, widget) {
  if (!elements.widgetContextMenu) return;

  activeMenuWidget = widget;

  // 現在の不透明度を設定
  const opacity = (activeMenuWidget.settings && activeMenuWidget.settings.opacity !== undefined)
    ? activeMenuWidget.settings.opacity
    : 55;
  
  elements.widgetOpacityRange.value = opacity;
  elements.widgetOpacityValue.textContent = opacity + '%';

  elements.widgetContextMenu.classList.remove('hidden');

  // はみ出し補正のためにメニューの実サイズを取得
  const menuWidth = elements.widgetContextMenu.offsetWidth || 200;
  const menuHeight = elements.widgetContextMenu.offsetHeight || 120;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  let x = clientX;
  let y = clientY;

  // 右端からはみ出る場合
  if (x + menuWidth > windowWidth) {
    x = windowWidth - menuWidth - 10;
  }
  // 下端からはみ出る場合
  if (y + menuHeight > windowHeight) {
    y = windowHeight - menuHeight - 10;
  }

  elements.widgetContextMenu.style.left = `${x}px`;
  elements.widgetContextMenu.style.top = `${y}px`;
}

// 個別不透明度の適用ヘルパー
export function applyWidgetOpacityStyle(frame, widget, opacity) {
  const isEdit = document.body.classList.contains('edit-mode') || appState.isEditMode;
  const targetOpacity = isEdit ? Math.max(30, opacity) : opacity;

  if (targetOpacity === 0) {
    frame.style.background = 'transparent';
    frame.style.backdropFilter = 'none';
    frame.style.webkitBackdropFilter = 'none';
    frame.style.border = isEdit ? '1px solid var(--border-glass)' : '1px solid transparent';
    frame.style.boxShadow = 'none';
  } else {
    const alpha = targetOpacity / 100;
    frame.style.background = `rgba(15, 15, 20, ${alpha * 0.75})`; // 暗色すりガラス
    frame.style.backdropFilter = `blur(${16 * alpha}px) saturate(180%)`;
    frame.style.webkitBackdropFilter = `blur(${16 * alpha}px) saturate(180%)`;
    frame.style.border = isEdit ? '1px solid var(--border-glass)' : '1px solid transparent';
    
    if (!isEdit) {
      frame.style.boxShadow = targetOpacity > 15 ? `0 8px 32px 0 rgba(0, 0, 0, ${alpha * 0.25})` : 'none';
    } else {
      frame.style.boxShadow = `0 8px 32px 0 rgba(0, 0, 0, 0.3)`;
    }
  }
}

// 全ウィジェットの不透明度スタイルを一括更新する（編集モードの出入り時に使用）
export function updateAllWidgetsOpacityStyles() {
  appState.currentSettings.widgets.forEach(widget => {
    const frame = document.querySelector(`[data-id="${widget.id}"]`);
    if (frame) {
      const opacity = (widget.settings && widget.settings.opacity !== undefined) ? widget.settings.opacity : 55;
      applyWidgetOpacityStyle(frame, widget, opacity);
    }
  });
}

// コンテキストメニュー全体の初期化 (イベントバインド)
export function initContextMenu(saveWidgetsCallback, renderWidgetsCallback) {
  if (!elements.widgetOpacityRange) return;

  // 不透明度スライダー操作
  elements.widgetOpacityRange.addEventListener('input', (e) => {
    if (!activeMenuWidget) return;
    const val = parseInt(e.target.value);
    elements.widgetOpacityValue.textContent = val + '%';
    
    if (!activeMenuWidget.settings) activeMenuWidget.settings = {};
    activeMenuWidget.settings.opacity = val;

    // styleをリアルタイムに反映
    const frame = document.querySelector(`[data-id="${activeMenuWidget.id}"]`);
    if (frame) {
      applyWidgetOpacityStyle(frame, activeMenuWidget, val);
    }
    
    saveWidgetsCallback();
  });

  if (elements.deleteWidgetMenuBtn) {
    // 削除ボタン
    elements.deleteWidgetMenuBtn.addEventListener('click', () => {
      if (!activeMenuWidget) return;
      if (confirm('このウィジェットを削除しますか？')) {
        appState.currentSettings.widgets = appState.currentSettings.widgets.filter(w => w.id !== activeMenuWidget.id);
        
        // 検索バーが削除された場合、表示チェックボックスをOFFに同期
        if (activeMenuWidget.type === 'search-bar') {
          appState.currentSettings.showSearch = false;
          storage.set({ showSearch: false });
          if (elements.showSearchCheckbox) {
            elements.showSearchCheckbox.checked = false;
          }
        }

        saveWidgetsCallback();
        renderWidgetsCallback();
        hideContextMenu();
      }
    });
  }

  // メニュー以外のクリックで閉じる
  document.addEventListener('click', (e) => {
    if (elements.widgetContextMenu && !elements.widgetContextMenu.classList.contains('hidden')) {
      if (!e.target.closest('#widget-context-menu')) {
        hideContextMenu();
      }
    }
  });
}
