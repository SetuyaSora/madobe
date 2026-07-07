/* -------------------------------------------------------------
 * Chrome Wallpaper - Main JavaScript Hub
 * ------------------------------------------------------------- */

import { appState, elements, initElements, GRID_COLS, GRID_ROWS } from './js/state.js';
import { storage } from './js/storage.js';
import { initSettings, applyAllSettings } from './js/settings.js';
import { initShortcuts, closeShortcutsDrawer } from './js/shortcuts.js';
import { initContextMenu } from './js/contextmenu.js';
import { 
  renderWidgets, 
  saveWidgets, 
  getWidgetDefaultSize, 
  updateSnapPreview, 
  removeSnapPreview, 
  setCurrentDraggedType,
  getCurrentDraggedType,
  exitEditMode,
  checkAllCollisions,
  showCollisionToast
} from './js/widgets.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. DOM要素のキャッシュ初期化
  initElements();

  // 2. 保存設定のロードと初期適用
  storage.get(appState.currentSettings, (loadedSettings) => {
    appState.currentSettings = loadedSettings;
    
    // 3. 各モジュールのイベントバインドと適用
    initSettings();
    initShortcuts();
    initContextMenu(saveWidgets, renderWidgets);
    initGlobalEvents();

    // 4. 全設定の初期反映
    applyAllSettings();
  });
});

// グローバルな汎用イベントのバインド
function initGlobalEvents() {
  // 背景クリックで編集モードを終了
  document.addEventListener('click', (e) => {
    if (document.body.classList.contains('edit-mode') || appState.isEditMode) {
      if (!e.target.closest('.widget-frame') && 
          !e.target.closest('#shortcuts-drawer') && 
          !e.target.closest('#settings-panel') &&
          !e.target.closest('#settings-toggle') &&
          !e.target.closest('#drawer-trigger')) {
        exitEditMode();
      }
    }
  });

  // マウスを離したときに長押しタイマーをクリア (グローバルmouseup)
  document.addEventListener('mouseup', () => {
    if (appState.longPressTimer) {
      clearTimeout(appState.longPressTimer);
      appState.longPressTimer = null;
    }
  });

  // --- ドロワー内のウィジェット / ショートカットタブの切り替え ---
  const drawerTabBtns = document.querySelectorAll('.drawer-tab-btn');
  const tabContentWrappers = document.querySelectorAll('.tab-content-wrapper');
  drawerTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      drawerTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tabContentWrappers.forEach(wrapper => {
        if (wrapper.id === `tab-content-${tabName}`) {
          wrapper.classList.remove('hidden');
        } else {
          wrapper.classList.add('hidden');
        }
      });
    });
  });

  // --- ウィジェットサンプルのドラッグ開始・終了 ---
  const widgetSampleCards = document.querySelectorAll('.widget-sample-card');
  widgetSampleCards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      const type = card.dataset.widgetType;
      setCurrentDraggedType(type);
      e.dataTransfer.setData('text/plain', type);
      appState.isShortcutDialogOpen = true; // ドラッグ中はドロワーを閉じない
      document.body.classList.add('dragging-widget');
    });
    card.addEventListener('dragend', () => {
      setCurrentDraggedType(null);
      appState.isShortcutDialogOpen = false;
      document.body.classList.remove('dragging-widget');
      closeShortcutsDrawer();
    });
  });

  // --- ウィジェット配置レイヤーへのドロップ処理 ---
  if (elements.widgetsLayer) {
    elements.widgetsLayer.addEventListener('dragover', (e) => {
      e.preventDefault();
      const type = getCurrentDraggedType() || 'digital-clock';
      updateSnapPreview(e.clientX, e.clientY, getWidgetDefaultSize(type));
    });

    elements.widgetsLayer.addEventListener('dragleave', () => {
      removeSnapPreview();
    });

    elements.widgetsLayer.addEventListener('drop', (e) => {
      e.preventDefault();
      removeSnapPreview();
      const type = e.dataTransfer.getData('text/plain');
      if (!type) return;

      const rect = elements.widgetsLayer.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const cellW = rect.width / GRID_COLS;
      const cellH = rect.height / GRID_ROWS;

      let gridX = Math.floor(mouseX / cellW);
      let gridY = Math.floor(mouseY / cellH);
      const size = getWidgetDefaultSize(type);

      if (gridX + size.w > GRID_COLS) gridX = GRID_COLS - size.w;
      if (gridY + size.h > GRID_ROWS) gridY = GRID_ROWS - size.h;
      if (gridX < 0) gridX = 0;
      if (gridY < 0) gridY = 0;

      const newWidget = {
        id: 'widget_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        type: type,
        gridX: gridX,
        gridY: gridY,
        gridW: size.w,
        gridH: size.h,
        settings: {}
      };

      if (!appState.currentSettings.widgets) {
        appState.currentSettings.widgets = [];
      }
      appState.currentSettings.widgets.push(newWidget);

      // 新規追加時の保存・再描画
      saveWidgets();
      renderWidgets();

      // 重なりがあるかチェックして赤枠を反映
      if (checkAllCollisions()) {
        showCollisionToast("ウィジェットが重なっています。配置を調整してください。");
      }
    });
  }
}
