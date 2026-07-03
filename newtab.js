/* -------------------------------------------------------------
 * Chrome Wallpaper - Main JavaScript
 * Vanilla JS / Lightweight & Performance Optimized
 * ------------------------------------------------------------- */

// 1. ストレージのポリフィル (Chrome Extension Storage と Web LocalStorage の両対応)
const storage = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? {
  get: (defaults, callback) => {
    chrome.storage.local.get(Object.keys(defaults), (result) => {
      // 未設定の項目にデフォルト値をマージ
      const merged = { ...defaults };
      for (const key in defaults) {
        if (result[key] !== undefined) {
          merged[key] = result[key];
        }
      }
      callback(merged);
    });
  },
  set: (data, callback) => {
    chrome.storage.local.set(data, callback);
  }
} : {
  get: (defaults, callback) => {
    const result = { ...defaults };
    for (const key in defaults) {
      const val = localStorage.getItem(key);
      if (val !== null) {
        try {
          result[key] = JSON.parse(val);
        } catch (e) {
          result[key] = val; // パースエラー時はそのまま
        }
      }
    }
    setTimeout(() => callback(result), 0);
  },
  set: (data, callback) => {
    for (const key in data) {
      localStorage.setItem(key, JSON.stringify(data[key]));
    }
    if (callback) setTimeout(callback, 0);
  }
};

// 2. 定数・初期設定
const DEFAULT_SHORTCUTS = [
  { name: 'Google', url: 'https://www.google.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'GitHub', url: 'https://github.com' }
];

const DEFAULT_SETTINGS = {
  bgType: 'default', // 'default', 'url', 'file'
  bgUrl: '',
  volume: 0,         // 0% - 100%
  speed: 1.0,        // 0.5 - 2.0
  overlayOpacity: 30, // 0% - 90%
  showSearch: true,
  showShortcuts: true,
  shortcuts: DEFAULT_SHORTCUTS,
  widgets: [
    {
      id: 'widget_search_default',
      type: 'search-bar',
      gridX: 7,
      gridY: 4,
      gridW: 10,
      gridH: 1,
      settings: {}
    }
  ]
};

// ウィジェットの種類ごとのサイズ制限（アダプティブ制約）
const WIDGET_RULES = {
  'search-bar':    { minW: 6, minH: 1, maxW: 24, maxH: 3 },
  'digital-clock': { minW: 3, minH: 2, maxW: 12, maxH: 5 },
  'analog-clock':  { minW: 3, minH: 3, maxW: 10, maxH: 10 },
  'calendar':      { minW: 4, minH: 4, maxW: 16, maxH: 8 },
  'memo':          { minW: 3, minH: 3, maxW: 16, maxH: 8 }
};

// 現在の設定保持用
let currentSettings = { ...DEFAULT_SETTINGS };
// 編集中のショートカットのインデックス (新規追加時は -1)
let editingShortcutIndex = -1;
// ローカル動画のBlob URL一時保管用
let localVideoBlobUrl = null;

// サジェスト制御用
let suggestDebounceTimer = null;
let currentSuggestList = [];
let activeSuggestIndex = -1;
let originalInputText = '';

// ショートカットドロワー開閉制御用
let isShortcutDialogOpen = false;

// 編集モード状態用
let isEditMode = false;
let longPressTimer = null;
let pressStartX = 0;
let pressStartY = 0;
const LONG_PRESS_DELAY = 700; // 700ms 長押しで編集モード

// ドラッグ＆ドロップ時の入れ替え用開始位置
let dragStartGridX = 0;
let dragStartGridY = 0;

// -------------------------------------------------------------
// IndexedDB 制御用 (ローカル動画の永続保存用)
// -------------------------------------------------------------
const DB_NAME = 'ChromeWallpaperDB';
const DB_VERSION = 1;
const STORE_NAME = 'wallpapers';
const KEY_NAME = 'user_video';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

function saveVideoBlob(blob) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(blob, KEY_NAME);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  });
}

function loadVideoBlob() {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(KEY_NAME);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  });
}

function deleteVideoBlob() {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(KEY_NAME);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  });
}

// DOM要素のキャッシュ
const elements = {
  video: document.getElementById('bg-video'),
  overlay: document.getElementById('bg-overlay'),
  searchSection: document.getElementById('search-section'),
  shortcutsSection: document.getElementById('shortcuts-section'),
  shortcutsGrid: document.getElementById('shortcuts-grid'),
  settingsToggle: document.getElementById('settings-toggle'),
  settingsPanel: document.getElementById('settings-panel'),
  settingsClose: document.getElementById('settings-close'),
  
  // 設定コントロール
  videoSourceRadios: document.getElementsByName('video-source'),
  urlInputContainer: document.getElementById('url-input-container'),
  videoUrlInput: document.getElementById('video-url-input'),
  saveUrlBtn: document.getElementById('save-url-btn'),
  fileInputContainer: document.getElementById('file-input-container'),
  videoFileInput: document.getElementById('video-file-input'),
  opacitySlider: document.getElementById('opacity-slider'),
  opacityValue: document.getElementById('opacity-value'),
  volumeSlider: document.getElementById('volume-slider'),
  volumeValue: document.getElementById('volume-value'),
  speedSelect: document.getElementById('speed-select'),
  showSearchCheckbox: document.getElementById('show-search-checkbox'),
  showShortcutsCheckbox: document.getElementById('show-shortcuts-checkbox'),

  // ショートカットダイアログ
  shortcutDialog: document.getElementById('shortcut-dialog'),
  dialogTitle: document.getElementById('dialog-title'),
  shortcutNameInput: document.getElementById('shortcut-name-input'),
  shortcutUrlInput: document.getElementById('shortcut-url-input'),
  dialogCancelBtn: document.getElementById('dialog-cancel-btn'),
  dialogSaveBtn: document.getElementById('dialog-save-btn'),

  // カスタム右クリックコンテキストメニュー
  contextMenu: document.getElementById('widget-context-menu'),
  widgetOpacityRange: document.getElementById('widget-opacity-range'),
  widgetOpacityValue: document.getElementById('widget-opacity-value'),
  widgetContextDeleteBtn: document.getElementById('widget-context-delete-btn'),

  // 検索サジェスト
  searchForm: document.getElementById('search-form'),
  searchInput: document.getElementById('search-input'),
  suggestList: document.getElementById('search-suggest-list'),

  // ショートカットドロワー
  shortcutsDrawer: document.getElementById('shortcuts-drawer'),
  drawerTrigger: document.getElementById('drawer-trigger'),

  // ウィジェット関連
  widgetsLayer: document.getElementById('widgets-layer'),
  drawerTabBtns: document.querySelectorAll('.drawer-tab-btn'),
  tabContentWrappers: document.querySelectorAll('.tab-content-wrapper'),
  widgetSampleCards: document.querySelectorAll('.widget-sample-card')
};

// -------------------------------------------------------------
// 3. コアロジックの初期化と適用
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // 設定を読み込んでUIに適用
  storage.get(DEFAULT_SETTINGS, (settings) => {
    currentSettings = settings;
    applyAllSettings();
    initEventListeners();
  });
});

// 全設定の適用
function applyAllSettings() {
  // 1. 壁紙ソースの適用
  applyVideoSource();

  // 2. 音量適用
  const vol = currentSettings.volume / 100;
  elements.video.volume = vol;
  elements.video.muted = (vol === 0);
  elements.volumeSlider.value = currentSettings.volume;
  elements.volumeValue.textContent = `${currentSettings.volume}%`;

  // 3. 再生速度適用
  elements.video.playbackRate = parseFloat(currentSettings.speed);
  elements.speedSelect.value = currentSettings.speed;

  // 4. 暗度 (オーバーレイ不透明度) 適用
  elements.overlay.style.backgroundColor = `rgba(0, 0, 0, ${currentSettings.overlayOpacity / 100})`;
  elements.opacitySlider.value = currentSettings.overlayOpacity;
  elements.opacityValue.textContent = `${currentSettings.overlayOpacity}%`;

  // 5. 表示項目トグル適用
  elements.showSearchCheckbox.checked = currentSettings.showSearch;
  if (currentSettings.showSearch) {
    const hasSearch = currentSettings.widgets.some(w => w.type === 'search-bar');
    if (!hasSearch) {
      currentSettings.widgets.push({
        id: 'widget_search_default',
        type: 'search-bar',
        gridX: 7, gridY: 4, gridW: 10, gridH: 1,
        settings: {}
      });
    }
  } else {
    currentSettings.widgets = currentSettings.widgets.filter(w => w.type !== 'search-bar');
  }

  if (currentSettings.showShortcuts) {
    elements.drawerTrigger.classList.remove('hidden');
  } else {
    elements.drawerTrigger.classList.add('hidden');
    elements.shortcutsDrawer.classList.remove('open');
  }
  elements.showShortcutsCheckbox.checked = currentSettings.showShortcuts;

  // 6. 設定パネルのUI（ラジオボタンや入力値）の同期
  Array.from(elements.videoSourceRadios).forEach(radio => {
    radio.checked = (radio.value === currentSettings.bgType);
  });
  elements.videoUrlInput.value = currentSettings.bgUrl || '';
  toggleSourceInputVisibility(currentSettings.bgType);

  // 7. ショートカットの描画
  renderShortcuts();

  // 8. ウィジェットの描画とタイマー開始
  renderWidgets();
  initWidgetsTimer();
}

// 壁紙ソースの読み込みと適用
function applyVideoSource() {
  // メモリ解放 (古いBlob URLがある場合)
  if (localVideoBlobUrl) {
    URL.revokeObjectURL(localVideoBlobUrl);
    localVideoBlobUrl = null;
  }

  const type = currentSettings.bgType;

  if (type === 'default') {
    const sourceUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) 
      ? chrome.runtime.getURL('assets/default_bg.mp4') 
      : 'assets/default_bg.mp4';
    setVideoSource(sourceUrl);
  } else if (type === 'url') {
    setVideoSource(currentSettings.bgUrl);
  } else if (type === 'file') {
    loadVideoBlob().then(blob => {
      if (blob) {
        localVideoBlobUrl = URL.createObjectURL(blob);
        setVideoSource(localVideoBlobUrl);
      } else {
        // 保存されていなければデフォルトにフォールバック
        console.warn("IndexedDBに動画Blobが見つかりません。デフォルトにフォールバックします。");
        currentSettings.bgType = 'default';
        storage.set({ bgType: 'default' });
        applyVideoSource();
      }
    }).catch(err => {
      console.error("IndexedDBからの動画読み込みに失敗しました:", err);
      currentSettings.bgType = 'default';
      storage.set({ bgType: 'default' });
      applyVideoSource();
    });
  }
}

// ビデオソースの設定と再生開始
function setVideoSource(url) {
  if (url) {
    elements.video.src = url;
    elements.video.load();
    
    // 再生速度と音量を再適用
    elements.video.playbackRate = parseFloat(currentSettings.speed);
    const vol = currentSettings.volume / 100;
    elements.video.volume = vol;
    elements.video.muted = (vol === 0);

    elements.video.play().catch(err => {
      console.warn("動画の自動再生がブロックされました。ユーザー操作を待ちます。", err);
    });
  }
}

// ソースごとの入力UI表示切り替え
function toggleSourceInputVisibility(type) {
  if (type === 'url') {
    elements.urlInputContainer.classList.remove('hidden');
    elements.fileInputContainer.classList.add('hidden');
  } else if (type === 'file') {
    elements.urlInputContainer.classList.add('hidden');
    elements.fileInputContainer.classList.remove('hidden');
  } else {
    elements.urlInputContainer.classList.add('hidden');
    elements.fileInputContainer.classList.add('hidden');
  }
}

// -------------------------------------------------------------
// 4. イベントリスナーの設定
// -------------------------------------------------------------
function initEventListeners() {
  // --- 4.1. Visibility API による省電力・軽量化 (最重要) ---
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      elements.video.pause();
      console.log('Tab backgrounded: Video paused for performance.');
    } else {
      // ユーザーの音量・再生速度を再適用した上で再生
      elements.video.playbackRate = parseFloat(currentSettings.speed);
      elements.video.play().catch(e => console.log('Playback resume failed:', e));
      console.log('Tab foregrounded: Video resumed.');
    }
  });

  // --- 4.2. 設定パネル開閉 ---
  elements.settingsToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.settingsPanel.classList.toggle('hidden');
  });

  elements.settingsClose.addEventListener('click', () => {
    elements.settingsPanel.classList.add('hidden');
  });

  // 設定パネルの外側をクリックしたら閉じる
  document.addEventListener('click', (e) => {
    if (!elements.settingsPanel.classList.contains('hidden') && 
        !elements.settingsPanel.contains(e.target) && 
        !elements.settingsToggle.contains(e.target)) {
      elements.settingsPanel.classList.add('hidden');
    }
  });

  // --- 4.3. 壁紙ソースのラジオボタン変更 ---
  Array.from(elements.videoSourceRadios).forEach(radio => {
    radio.addEventListener('change', (e) => {
      const type = e.target.value;
      toggleSourceInputVisibility(type);

      if (type === 'default') {
        currentSettings.bgType = 'default';
        storage.set({ bgType: 'default' });
        deleteVideoBlob().catch(err => console.error(err));
        applyVideoSource();
      } else if (type === 'file') {
        // 既にIndexedDBにデータがあればそれを再生、無ければファイル選択を促す
        loadVideoBlob().then(blob => {
          if (blob) {
            currentSettings.bgType = 'file';
            storage.set({ bgType: 'file' });
            applyVideoSource();
          } else {
            elements.videoFileInput.click();
          }
        }).catch(err => {
          elements.videoFileInput.click();
        });
      }
    });
  });

  // --- 4.4. 外部URLの適用 ---
  elements.saveUrlBtn.addEventListener('click', () => {
    const url = elements.videoUrlInput.value.trim();
    if (url) {
      currentSettings.bgType = 'url';
      currentSettings.bgUrl = url;
      storage.set({
        bgType: 'url',
        bgUrl: url
      }, () => {
        deleteVideoBlob().catch(err => console.error(err));
        applyVideoSource();
        alert('壁紙URLを適用しました。');
      });
    } else {
      alert('有効な動画URLを入力してください。');
    }
  });

  // --- 4.5. ローカルファイル選択 ---
  elements.videoFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      saveVideoBlob(file).then(() => {
        currentSettings.bgType = 'file';
        storage.set({ bgType: 'file' }, () => {
          applyVideoSource();
        });
      }).catch(err => {
        console.error("IndexedDBへの動画保存に失敗しました:", err);
        alert("動画の保存に失敗しました。容量が大きい（またはブラウザの空き容量不足）可能性があります。");
      });
    }
  });

  // --- 4.6. 暗度 (不透明度) スライダー ---
  elements.opacitySlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    currentSettings.overlayOpacity = val;
    elements.opacityValue.textContent = `${val}%`;
    elements.overlay.style.backgroundColor = `rgba(0, 0, 0, ${val / 100})`;
  });

  elements.opacitySlider.addEventListener('change', () => {
    storage.set({ overlayOpacity: currentSettings.overlayOpacity });
  });

  // --- 4.7. 音量スライダー ---
  elements.volumeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    currentSettings.volume = val;
    elements.volumeValue.textContent = `${val}%`;
    
    const vol = val / 100;
    elements.video.volume = vol;
    elements.video.muted = (vol === 0);
  });

  elements.volumeSlider.addEventListener('change', () => {
    storage.set({ volume: currentSettings.volume });
  });

  // --- 4.8. 再生速度 ---
  elements.speedSelect.addEventListener('change', (e) => {
    const speed = parseFloat(e.target.value);
    currentSettings.speed = speed;
    elements.video.playbackRate = speed;
    storage.set({ speed: speed });
  });

  // --- 4.9. 表示トグル (検索) ---
  elements.showSearchCheckbox.addEventListener('change', (e) => {
    const checked = e.target.checked;
    currentSettings.showSearch = checked;
    storage.set({ showSearch: checked });
    if (checked) {
      const hasSearch = currentSettings.widgets.some(w => w.type === 'search-bar');
      if (!hasSearch) {
        currentSettings.widgets.push({
          id: 'widget_search_' + Date.now(),
          type: 'search-bar',
          gridX: 7, gridY: 4, gridW: 10, gridH: 1,
          settings: {}
        });
        saveWidgets();
        renderWidgets();
      }
    } else {
      currentSettings.widgets = currentSettings.widgets.filter(w => w.type !== 'search-bar');
      saveWidgets();
      renderWidgets();
    }
  });

  // --- 4.10. 表示トグル (ショートカット) ---
  elements.showShortcutsCheckbox.addEventListener('change', (e) => {
    const checked = e.target.checked;
    currentSettings.showShortcuts = checked;
    storage.set({ showShortcuts: checked });
    if (checked) {
      elements.drawerTrigger.classList.remove('hidden');
    } else {
      elements.drawerTrigger.classList.add('hidden');
      elements.shortcutsDrawer.classList.remove('open');
    }
  });

  // --- 4.11. ショートカットダイアログの操作 ---
  elements.dialogCancelBtn.addEventListener('click', closeShortcutDialog);
  
  elements.dialogSaveBtn.addEventListener('click', () => {
    const name = elements.shortcutNameInput.value.trim();
    let url = elements.shortcutUrlInput.value.trim();

    if (!name || !url) {
      alert('名前とURLを入力してください。');
      return;
    }

    // スキーム補完 (http/httpsが無い場合)
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    if (editingShortcutIndex === -1) {
      // 新規追加
      currentSettings.shortcuts.push({ name, url });
    } else {
      // 編集更新
      currentSettings.shortcuts[editingShortcutIndex] = { name, url };
    }

    storage.set({ shortcuts: currentSettings.shortcuts }, () => {
      renderShortcuts();
      closeShortcutDialog();
    });
  });

  // ダイアログ外クリックで閉じる
  elements.shortcutDialog.addEventListener('click', (e) => {
    if (e.target === elements.shortcutDialog) {
      closeShortcutDialog();
    }
  });

  // --- 4.12. 検索サジェストイベントの監視 (イベント委譲) ---
  document.addEventListener('input', (e) => {
    if (e.target.id === 'search-input') {
      handleSearchInput(e);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'search-input') {
      handleSearchKeydown(e);
    }
  });

  document.addEventListener('focusin', (e) => {
    if (e.target.id === 'search-input') {
      const query = e.target.value.trim();
      if (query) {
        updateSuggestList(query);
      }
    }
  });

  // サジェストリスト以外のクリックでリストを閉じる
  document.addEventListener('click', (e) => {
    if (elements.suggestList && 
        !elements.suggestList.classList.contains('hidden') && 
        !elements.suggestList.contains(e.target) && 
        e.target.id !== 'search-input') {
      elements.suggestList.classList.add('hidden');
    }
  });

  // --- 4.13. ショートカットドロワーのホバー開閉制御 ---
  elements.drawerTrigger.addEventListener('mouseenter', openShortcutsDrawer);
  elements.shortcutsDrawer.addEventListener('mouseenter', openShortcutsDrawer);
  elements.shortcutsDrawer.addEventListener('mouseleave', () => {
    if (!isShortcutDialogOpen) {
      closeShortcutsDrawer();
    }
  });

  // --- 4.17. 背景クリックで編集モードを終了 ---
  document.addEventListener('click', (e) => {
    if (document.body.classList.contains('edit-mode')) {
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
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  });

  // --- 4.18. カスタム右クリックコンテキストメニューのイベント ---
  document.addEventListener('contextmenu', (e) => {
    const frame = e.target.closest('.widget-frame');
    if (frame) {
      e.preventDefault();
      const widgetId = frame.dataset.id;
      const widget = currentSettings.widgets.find(w => w.id === widgetId);
      if (widget) {
        activeMenuWidget = widget;
        showContextMenu(e.clientX, e.clientY);
      }
    } else {
      hideContextMenu();
    }
  });

  // メニュー外左クリックでメニューを閉じる
  document.addEventListener('click', (e) => {
    if (elements.contextMenu && !elements.contextMenu.classList.contains('hidden')) {
      if (!elements.contextMenu.contains(e.target)) {
        hideContextMenu();
      }
    }
  });

  // スライダー操作による不透明度リアルタイム更新
  if (elements.widgetOpacityRange) {
    elements.widgetOpacityRange.addEventListener('input', (e) => {
      if (!activeMenuWidget) return;
      const opacity = parseInt(e.target.value);
      elements.widgetOpacityValue.textContent = opacity;

      if (!activeMenuWidget.settings) activeMenuWidget.settings = {};
      activeMenuWidget.settings.opacity = opacity;

      const frame = document.querySelector(`[data-id="${activeMenuWidget.id}"]`);
      if (frame) {
        applyWidgetOpacityStyle(frame, activeMenuWidget, opacity);
      }
    });

    elements.widgetOpacityRange.addEventListener('change', () => {
      saveWidgets();
    });
  }

  // メニュー内削除ボタン
  if (elements.widgetContextDeleteBtn) {
    elements.widgetContextDeleteBtn.addEventListener('click', () => {
      if (!activeMenuWidget) return;

      currentSettings.widgets = currentSettings.widgets.filter(w => w.id !== activeMenuWidget.id);

      if (activeMenuWidget.type === 'search-bar') {
        currentSettings.showSearch = false;
        storage.set({ showSearch: false });
        elements.showSearchCheckbox.checked = false;
      }

      saveWidgets();
      renderWidgets();
      hideContextMenu();
    });
  }

  // --- 4.14. ウィジェットドロワーのタブ切り替え ---
  elements.drawerTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      elements.drawerTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      elements.tabContentWrappers.forEach(wrapper => {
        if (wrapper.id === `tab-content-${tabName}`) {
          wrapper.classList.remove('hidden');
        } else {
          wrapper.classList.add('hidden');
        }
      });
    });
  });

  // --- 4.15. ウィジェット見本のドラッグ開始・終了 ---
  elements.widgetSampleCards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      currentDraggedType = card.dataset.widgetType; // ドラッグ中のタイプを記録
      e.dataTransfer.setData('text/plain', card.dataset.widgetType);
      isShortcutDialogOpen = true; // ドラッグ中はドロワーを閉じない
      document.body.classList.add('dragging-widget'); // ドラッグ中だけpointer-events: autoにする
    });
    card.addEventListener('dragend', () => {
      currentDraggedType = null;
      isShortcutDialogOpen = false;
      document.body.classList.remove('dragging-widget'); // 通常のpointer-events: noneに戻す
      closeShortcutsDrawer();
    });
  });

  // --- 4.16. ウィジェット配置レイヤーへのドロップ制御 ---
  elements.widgetsLayer.addEventListener('dragover', (e) => {
    e.preventDefault();
    const type = currentDraggedType || 'digital-clock';
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

    const cellW = rect.width / 24;
    const cellH = rect.height / 12;

    let gridX = Math.floor(mouseX / cellW);
    let gridY = Math.floor(mouseY / cellH);
    const size = getWidgetDefaultSize(type);

    if (gridX + size.w > 24) gridX = 24 - size.w;
    if (gridY + size.h > 12) gridY = 12 - size.h;
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

    if (!currentSettings.widgets) {
      currentSettings.widgets = [];
    }
    currentSettings.widgets.push(newWidget);

    // 新規ドロップ時の重なり衝突解決
    resolveWidgetCollisions(newWidget.id);

    saveWidgets();
    renderWidgets();
  });
}

// -------------------------------------------------------------
// 5. ショートカット（クイックリンク）の描画 & 制御
// -------------------------------------------------------------
function renderShortcuts() {
  // グリッドを一旦クリア
  elements.shortcutsGrid.innerHTML = '';

  const shortcuts = currentSettings.shortcuts || [];

  // 1. 各ショートカットアイテムの追加
  shortcuts.forEach((item, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'shortcut-item';
    
    // ドメイン名の取得 (ファビコン/フォールバック表示用)
    let domain = '';
    try {
      domain = new URL(item.url).hostname;
    } catch(e) {
      domain = item.url;
    }

    // ドメインの頭文字 (フォールバック用)
    const initial = item.name ? item.name.charAt(0) : '?';
    // GoogleのFavicon APIを利用 (sz=64で高解像度を指定)
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

    itemEl.innerHTML = `
      <a href="${item.url}" class="shortcut-link" target="_self">
        <div class="shortcut-tile">
          <img src="${faviconUrl}" class="shortcut-fav" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="shortcut-fallback hidden" style="background: ${getRandomGradient(domain)}">${initial}</div>
        </div>
        <div class="shortcut-title" title="${item.name}">${item.name}</div>
      </a>
      <div class="shortcut-actions">
        <button class="action-btn edit-btn" data-index="${index}" aria-label="編集">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path></svg>
        </button>
        <button class="action-btn delete-btn" data-index="${index}" aria-label="削除">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;

    // リンク遷移イベントの付与 (aタグをクリックした時の遷移先保証)
    const link = itemEl.querySelector('.shortcut-link');
    link.addEventListener('click', (e) => {
      // 編集・削除ボタンのクリック時は遷移させない
      if (e.target.closest('.shortcut-actions')) {
        e.preventDefault();
      }
    });

    // 編集ボタンイベント
    const editBtn = itemEl.querySelector('.edit-btn');
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openShortcutDialog(index);
    });

    // 削除ボタンイベント
    const deleteBtn = itemEl.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteShortcut(index);
    });

    elements.shortcutsGrid.appendChild(itemEl);
  });

  // 2. ショートカット追加ボタン (「＋」) の描画 (上限10個程度)
  if (shortcuts.length < 10) {
    const addBtnEl = document.createElement('div');
    addBtnEl.className = 'shortcut-item';
    addBtnEl.innerHTML = `
      <div class="shortcut-tile add-tile">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </div>
      <div class="shortcut-title">追加</div>
    `;
    addBtnEl.addEventListener('click', () => openShortcutDialog());
    elements.shortcutsGrid.appendChild(addBtnEl);
  }
}

// ショートカット追加・編集ダイアログを開く
function openShortcutDialog(index = -1) {
  isShortcutDialogOpen = true; // ダイアログ展開中はドロワーを閉じない
  elements.shortcutsDrawer.classList.add('open');

  editingShortcutIndex = index;
  if (index === -1) {
    elements.dialogTitle.textContent = 'ショートカットを追加';
    elements.shortcutNameInput.value = '';
    elements.shortcutUrlInput.value = '';
  } else {
    elements.dialogTitle.textContent = 'ショートカットを編集';
    const item = currentSettings.shortcuts[index];
    elements.shortcutNameInput.value = item.name;
    elements.shortcutUrlInput.value = item.url;
  }
  elements.shortcutDialog.classList.remove('hidden');
  elements.shortcutNameInput.focus();
}

// ダイアログを閉じる
function closeShortcutDialog() {
  elements.shortcutDialog.classList.add('hidden');
  editingShortcutIndex = -1;
  isShortcutDialogOpen = false; // ロックを解除
  
  // マウスがドロワー外なら閉じる
  closeShortcutsDrawer();
}

// ショートカットを削除
function deleteShortcut(index) {
  if (confirm(`「${currentSettings.shortcuts[index].name}」を削除しますか？`)) {
    currentSettings.shortcuts.splice(index, 1);
    storage.set({ shortcuts: currentSettings.shortcuts }, () => {
      renderShortcuts();
    });
  }
}

// ドメイン名に基づいて一意のグラデーション背景を生成 (フォールバック用)
function getRandomGradient(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c1 = hueToRgb((hash % 360));
  const c2 = hueToRgb(((hash + 60) % 360));
  return `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
}

function hueToRgb(h) {
  return `hsl(${h}, 70%, 45%)`;
}

// -------------------------------------------------------------
// 6. 検索サジェスト（予測＆履歴）用関数群
// -------------------------------------------------------------

// 入力イベントハンドラー (デバウンス処理)
function handleSearchInput(e) {
  const query = e.target.value.trim();
  
  // デバウンスタイマーをリセット
  clearTimeout(suggestDebounceTimer);
  
  if (!query) {
    elements.suggestList.innerHTML = '';
    elements.suggestList.classList.add('hidden');
    activeSuggestIndex = -1;
    return;
  }
  
  // 150ms待ってからサジェストを更新
  suggestDebounceTimer = setTimeout(() => {
    updateSuggestList(query);
  }, 150);
}

// キーダウンイベントハンドラー (上下キーでの選択制御)
function handleSearchKeydown(e) {
  if (elements.suggestList.classList.contains('hidden') || currentSuggestList.length === 0) {
    return;
  }

  const maxIndex = currentSuggestList.length - 1;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (activeSuggestIndex === -1) {
      originalInputText = elements.searchInput.value;
    }
    
    activeSuggestIndex++;
    if (activeSuggestIndex > maxIndex) {
      activeSuggestIndex = -1; // 元の入力テキストに戻る
    }
    
    updateActiveSuggestItem();
  } 
  else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (activeSuggestIndex === -1) {
      originalInputText = elements.searchInput.value;
      activeSuggestIndex = maxIndex;
    } else {
      activeSuggestIndex--;
    }
    
    updateActiveSuggestItem();
  } 
  else if (e.key === 'Escape') {
    elements.suggestList.classList.add('hidden');
    activeSuggestIndex = -1;
  } 
  else if (e.key === 'Enter') {
    if (activeSuggestIndex >= 0) {
      const selectedItem = currentSuggestList[activeSuggestIndex];
      if (selectedItem.type === 'history') {
        e.preventDefault();
        window.location.href = selectedItem.url; // 履歴なら直接遷移
      }
      // queryタイプならそのままformのsubmitが走りGoogle検索される
    }
  }
}

// サジェスト項目ハイライトの更新とテキスト入力欄への反映
function updateActiveSuggestItem() {
  const items = elements.suggestList.querySelectorAll('.suggest-item');
  items.forEach((item, idx) => {
    if (idx === activeSuggestIndex) {
      item.classList.add('active');
      // キーボード選択したテキストを入力欄に反映
      elements.searchInput.value = currentSuggestList[idx].text;
      
      // スクロール追従 (項目が多い場合)
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('active');
    }
  });

  if (activeSuggestIndex === -1) {
    // 選択なし（元の入力値に戻す）
    elements.searchInput.value = originalInputText;
  }
}

// サジェストリストの取得と描画
function updateSuggestList(query) {
  Promise.all([
    fetchHistorySuggests(query),
    fetchGoogleSuggests(query)
  ]).then(([historyItems, googleItems]) => {
    // 統合と重複排除 (同じクエリ文字列がある場合は履歴を優先)
    const merged = [];
    const seenTexts = new Set();

    // 1. まず履歴を追加 (最大5件)
    historyItems.forEach(item => {
      const normalized = item.text.toLowerCase().trim();
      if (!seenTexts.has(normalized)) {
        seenTexts.add(normalized);
        merged.push(item);
      }
    });

    // 2. 次にGoogle検索予測を追加
    googleItems.forEach(item => {
      const normalized = item.text.toLowerCase().trim();
      if (!seenTexts.has(normalized)) {
        seenTexts.add(normalized);
        merged.push(item);
      }
    });

    // 検索バーのサイズに基づいて表示件数を制限 (小サイズは3件、大サイズは8件)
    const searchWidget = currentSettings.widgets.find(w => w.type === 'search-bar');
    const maxSuggestItems = (searchWidget && searchWidget.gridW < 12) ? 3 : 8;
    currentSuggestList = merged.slice(0, maxSuggestItems);
    activeSuggestIndex = -1;

    renderSuggestItems();
  }).catch(err => {
    console.error("サジェストデータの統合エラー:", err);
  });
}

// サジェストのDOM描画
function renderSuggestItems() {
  elements.suggestList.innerHTML = '';

  if (currentSuggestList.length === 0) {
    elements.suggestList.classList.add('hidden');
    return;
  }

  // 時計アイコン (履歴用)
  const clockIcon = `<svg class="suggest-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
  // 虫眼鏡アイコン (検索予測用)
  const searchIcon = `<svg class="suggest-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;

  currentSuggestList.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'suggest-item';
    li.dataset.index = index;

    const icon = item.type === 'history' ? clockIcon : searchIcon;
    
    li.innerHTML = `
      ${icon}
      <div class="suggest-content">
        <span class="suggest-text">${escapeHtml(item.text)}</span>
        ${item.type === 'history' ? `<span class="suggest-url">${escapeHtml(item.url)}</span>` : ''}
      </div>
    `;

    // クリック・タップイベントの登録
    li.addEventListener('click', (e) => {
      e.preventDefault();
      if (item.type === 'history') {
        window.location.href = item.url;
      } else {
        elements.searchInput.value = item.text;
        elements.suggestList.classList.add('hidden');
        elements.searchForm.submit();
      }
    });

    elements.suggestList.appendChild(li);
  });

  elements.suggestList.classList.remove('hidden');
}

// Google検索サジェストの非同期取得
function fetchGoogleSuggests(query) {
  const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`;
  
  return fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    })
    .then(data => {
      // データ構造: [query, [suggest1, suggest2, ...], ...]
      if (data && Array.isArray(data[1])) {
        return data[1].map(text => ({ type: 'query', text: text }));
      }
      return [];
    })
    .catch(err => {
      console.warn("Googleサジェスト取得に失敗しました:", err);
      return [];
    });
}

// ブラウザ履歴サジェストの非同期取得
function fetchHistorySuggests(query) {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.history || !chrome.history.search) {
      resolve([]); // 拡張機能コンテキスト外の場合は空配列を返す
      return;
    }

    // 入力文字にマッチする履歴を検索 (最大5件)
    chrome.history.search({
      text: query,
      maxResults: 5
    }, (results) => {
      if (results && results.length > 0) {
        const items = results.map(item => {
          // タイトルがない場合はURLを使用
          const displayTitle = item.title ? item.title : item.url;
          return {
            type: 'history',
            text: displayTitle,
            url: item.url
          };
        });
        resolve(items);
      } else {
        resolve([]);
      }
    });
  });
}

// HTMLエスケープ処理 (セキュリティ対策)
function escapeHtml(string) {
  if (typeof string !== 'string') {
    return string;
  }
  return string.replace(/[&<>"']/g, function(match) {
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    };
    return escapeMap[match];
  });
}

// ドロワーを開く
function openShortcutsDrawer() {
  if (currentSettings.showShortcuts) {
    elements.shortcutsDrawer.classList.add('open');
  }
}

// ドロワーを閉じる
function closeShortcutsDrawer() {
  elements.shortcutsDrawer.classList.remove('open');
}

// -------------------------------------------------------------
// 6. ウィジェット管理システムの実装
// -------------------------------------------------------------
let widgetsGlobalTimer = null;
let dragPreviewEl = null;
let currentDraggedType = null;

// ウィジェットの保存
function saveWidgets() {
  storage.set({ widgets: currentSettings.widgets });
}

// ウィジェットのデフォルトサイズを取得
function getWidgetDefaultSize(type) {
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
    default:
      return { w: 4, h: 3 };
  }
}

// グリッド配置スナッププレビューの更新
function updateSnapPreview(clientX, clientY, size) {
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
function removeSnapPreview() {
  if (dragPreviewEl) {
    dragPreviewEl.remove();
    dragPreviewEl = null;
  }
}

// ウィジェットのドラッグ移動制御
function makeWidgetDraggable(widgetFrame, widgetData) {
  const header = widgetFrame.querySelector('.widget-header');
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
    dragStartGridX = widgetData.gridX;
    dragStartGridY = widgetData.gridY;

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
        swapWidgets(widgetData, nextGridX, nextGridY);

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

      // ドラッグ中のウィジェット自体はマウス操作をカクつかせないためにTransitionなしでリアルタイム追従
      widgetFrame.style.left = (currentGridX / 24) * 100 + '%';
      widgetFrame.style.top = (currentGridY / 12) * 100 + '%';
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      widgetFrame.classList.remove('dragging');
      preview.remove();

      // ドラッグ移動中のリアルタイム処理でデータは確定されているため、最終スナップ位置を再セットして永続化
      widgetData.gridX = currentGridX;
      widgetData.gridY = currentGridY;

      saveWidgets();
      renderWidgets(); // タイマーやTodoの内容の整合性を確定するためにリビルド
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// ウィジェットのリサイズ制御
function makeWidgetResizable(widgetFrame, widgetData) {
  const handle = widgetFrame.querySelector('.widget-resize-handle');
  handle.addEventListener('mousedown', (e) => {
    if (!document.body.classList.contains('edit-mode')) return;
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

      // リアルタイムにサイズクラスをトグル付与（カクつきなく中身の表示を切り替え）
      applyAdaptiveLayoutClasses(widgetFrame, widgetData.type, currentGridW, currentGridH);
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      widgetFrame.classList.remove('resizing');
      preview.remove();

      widgetData.gridW = currentGridW;
      widgetData.gridH = currentGridH;

      // リサイズで押し広げられた分、重なった既存のウィジェットを自動退避
      resolveWidgetCollisions(widgetData.id);

      saveWidgets();
      renderWidgets();
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// カレンダーのHTML生成
function generateCalendarHtml(widget) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const dayOfWeekName = dayNames[now.getDay()];

  const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  let tableRowsHtml = '';
  let date = 1;
  for (let i = 0; i < 6; i++) {
    tableRowsHtml += '<tr>';
    for (let j = 0; j < 7; j++) {
      if (i === 0 && j < firstDay) {
        tableRowsHtml += '<td class="other-month"></td>';
      } else if (date > lastDate) {
        tableRowsHtml += '<td class="other-month"></td>';
      } else {
        const isToday = date === today;
        tableRowsHtml += `<td class="${isToday ? 'today-cell' : ''}">${date}</td>`;
        date++;
      }
    }
    tableRowsHtml += '</tr>';
    if (date > lastDate) break;
  }

  // 2カラムと通常表示の切り替え
  return `
    <div class="widget-calendar-container">
      <div class="calendar-detail-pane">
        <div class="calendar-detail-dayname" style="color: ${now.getDay() === 0 || now.getDay() === 6 ? '#ef4444' : '#a855f7'}">${dayOfWeekName}曜日</div>
        <div class="calendar-detail-daynum">${today}</div>
        <div class="calendar-detail-month">${year}年 ${monthNames[month]}</div>
      </div>
      <div class="calendar-grid-pane">
        <div class="calendar-month-year">${year}年 ${monthNames[month]}</div>
        <table class="calendar-table">
          <thead>
            <tr>
              <th>日</th><th>月</th><th>火</th><th>水</th><th>木</th><th>金</th><th>土</th>
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

// 全ウィジェットの描画
function renderWidgets() {
  elements.widgetsLayer.innerHTML = '';

  if (!currentSettings.widgets) {
    currentSettings.widgets = [];
  }

  currentSettings.widgets.forEach(widget => {
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

    // タイトルの設定
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

      // カラーパレットツールバーのHTML
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

      // カラーテーマ適用
      frame.classList.remove('memo-theme-yellow', 'memo-theme-green', 'memo-theme-blue');
      if (activeColor !== 'default') {
        frame.classList.add(`memo-theme-${activeColor}`);
      }
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
      currentSettings.widgets = currentSettings.widgets.filter(w => w.id !== widget.id);
      
      // 検索バーが削除された場合、表示チェックボックスをOFFに同期
      if (widget.type === 'search-bar') {
        currentSettings.showSearch = false;
        storage.set({ showSearch: false });
        elements.showSearchCheckbox.checked = false;
      }
      
      saveWidgets();
      renderWidgets();
    });

    // 検索バーのキャッシュ更新＆ドロワーロック
    if (widget.type === 'search-bar') {
      elements.searchForm = frame.querySelector('#search-form');
      elements.searchInput = frame.querySelector('#search-input');
      elements.suggestList = frame.querySelector('#search-suggest-list');

      elements.searchInput.addEventListener('focus', () => { isShortcutDialogOpen = true; });
      elements.searchInput.addEventListener('blur', () => { isShortcutDialogOpen = false; closeShortcutsDrawer(); });
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
      textarea.addEventListener('focus', () => { isShortcutDialogOpen = true; });
      textarea.addEventListener('blur', () => { isShortcutDialogOpen = false; closeShortcutsDrawer(); });

      // カラーパレットボタンのバインド
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

      // クリアボタンのバインド
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

    // 長押しで編集モードに入るイベントリスナー
    frame.addEventListener('mousedown', (e) => {
      if (document.body.classList.contains('edit-mode')) return;
      if (e.target.closest('.widget-close-btn') || e.target.closest('.widget-resize-handle') || e.target.closest('textarea') || e.target.closest('input')) return;

      pressStartX = e.clientX;
      pressStartY = e.clientY;

      longPressTimer = setTimeout(() => {
        enterEditMode();
        longPressTimer = null;
      }, LONG_PRESS_DELAY);
    });

    frame.addEventListener('mousemove', (e) => {
      if (longPressTimer) {
        const distance = Math.hypot(e.clientX - pressStartX, e.clientY - pressStartY);
        if (distance > 8) { // 8px動いたらキャンセル
          clearTimeout(longPressTimer);
          longPressTimer = null;
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
  });

  // 時計類の初期更新
  updateWidgetsTime();
}

// グローバル時計更新タイマー
function updateWidgetsTime() {
  const now = new Date();
  
  // デジタル時計の更新 (個別アダプティブ対応)
  document.querySelectorAll('.widget-type-digital-clock').forEach(clockFrame => {
    const id = clockFrame.dataset.id;
    const widget = currentSettings.widgets.find(w => w.id === id);
    if (!widget) return;

    const timeEl = clockFrame.querySelector('.clock-time');
    const dateEl = clockFrame.querySelector('.clock-date');
    const isSmall = widget.gridW < 5 || widget.gridH < 3;

    if (timeEl) {
      if (isSmall) {
        // 秒なし (時:分)
        const hr = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        timeEl.textContent = `${hr}:${min}`;
      } else {
        // 秒あり (時:分:秒)
        const hr = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const sec = String(now.getSeconds()).padStart(2, '0');
        timeEl.textContent = `${hr}:${min}:${sec}`;
      }
    }

    if (dateEl) {
      if (isSmall) {
        dateEl.textContent = ''; // 非表示
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
function initWidgetsTimer() {
  if (!widgetsGlobalTimer) {
    widgetsGlobalTimer = setInterval(updateWidgetsTime, 1000);
  }
}

// 編集モードに入る
function enterEditMode() {
  if (isEditMode) return;
  isEditMode = true;
  document.body.classList.add('edit-mode');
  updateAllWidgetsOpacityStyles();
}

// 編集モードを終了する
function exitEditMode() {
  if (!isEditMode) return;
  isEditMode = false;
  document.body.classList.remove('edit-mode');
  updateAllWidgetsOpacityStyles();
}

// --- 衝突検知と回避・位置入れ替え (スワップ) アルゴリズム ---

// 2つのウィジェットが重なっているか判定
function isWidgetsColliding(w1, w2) {
  return !(
    w1.gridX + w1.gridW <= w2.gridX ||
    w2.gridX + w2.gridW <= w1.gridX ||
    w1.gridY + w1.gridH <= w2.gridY ||
    w2.gridY + w2.gridH <= w1.gridY
  );
}

// ウィジェット同士の位置を入れ替える (iPhone風スワップ・リアルタイムローリング追従仕様)
function swapWidgets(movedWidget, targetX, targetY) {
  const tempPos = { gridX: targetX, gridY: targetY, gridW: movedWidget.gridW, gridH: movedWidget.gridH };
  
  // 移動先に重なる既存のウィジェットを検出 (移動対象自身は除く)
  const collidingWidget = currentSettings.widgets.find(w => w.id !== movedWidget.id && isWidgetsColliding(tempPos, w));

  if (collidingWidget) {
    // 衝突された相手が元々占有していた座標を退避
    const oldX = collidingWidget.gridX;
    const oldY = collidingWidget.gridY;

    // 衝突された相手を、移動ウィジェットの「直前の空き座標（元の位置）」へ瞬間移動させる
    collidingWidget.gridX = dragStartGridX;
    collidingWidget.gridY = dragStartGridY;

    // ★重要：次の連続スワップに備えて、ドラッグ元の空き座標を「衝突相手が元いた座標」に更新（ローリング）
    dragStartGridX = oldX;
    dragStartGridY = oldY;

    // スワップされたウィジェットが、スワップ先で別のウィジェットと二次衝突した場合は
    // そのスワップされた側を起点として全方向の自動押し退けを再帰解決する
    resolveWidgetCollisions(collidingWidget.id);
  }
}

// 衝突が発生しているウィジェットを、全方向(上下左右)で最も移動距離が少なくて済む位置へ玉突き押し退け
function resolveWidgetCollisions(movedWidgetId) {
  let changed = true;
  let iterations = 0;
  const maxIterations = 50; // 無限ループガード
  const gridWidthLimit = 24;
  const gridHeightLimit = 12;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (let i = 0; i < currentSettings.widgets.length; i++) {
      const w1 = currentSettings.widgets[i];

      for (let j = 0; j < currentSettings.widgets.length; j++) {
        if (i === j) continue;
        const w2 = currentSettings.widgets[j];

        // 2つのウィジェットが衝突している場合
        if (isWidgetsColliding(w1, w2)) {
          let target = w2;
          let obstacle = w1;

          // 最近動かされたウィジェット(movedWidgetId)を「固定物」とみなし、他方を動かす
          if (w2.id === movedWidgetId) {
            target = w1;
            obstacle = w2;
          }

          // 上下左右に避けるために必要なズレ（シフト量）を計算
          const shiftUp = (target.gridY + target.gridH) - obstacle.gridY;
          const shiftDown = (obstacle.gridY + obstacle.gridH) - target.gridY;
          const shiftLeft = (target.gridX + target.gridW) - obstacle.gridX;
          const shiftRight = (obstacle.gridX + obstacle.gridW) - target.gridX;

          const candidates = [];

          // 画面外(0〜24マス, 0〜12マス)にはみ出さない候補だけを集める
          if (target.gridY - shiftUp >= 0) {
            candidates.push({ dir: 'up', dist: shiftUp, x: target.gridX, y: target.gridY - shiftUp });
          }
          if (target.gridY + shiftDown + target.gridH <= gridHeightLimit) {
            candidates.push({ dir: 'down', dist: shiftDown, x: target.gridX, y: target.gridY + shiftDown });
          }
          if (target.gridX - shiftLeft >= 0) {
            candidates.push({ dir: 'left', dist: shiftLeft, x: target.gridX - shiftLeft, y: target.gridY });
          }
          if (target.gridX + shiftRight + target.gridW <= gridWidthLimit) {
            candidates.push({ dir: 'right', dist: shiftRight, x: target.gridX + shiftRight, y: target.gridY });
          }

          // 画面内に収まる逃げ道がある場合、移動距離(dist)が最も小さくて済む方向を選ぶ
          if (candidates.length > 0) {
            candidates.sort((a, b) => a.dist - b.dist);
            const best = candidates[0];
            target.gridX = best.x;
            target.gridY = best.y;
          } else {
            // どの方向にも逃げ場がない場合の最終手段として、画面全体から最も近い空きスペースを全探索
            const freePos = findFreeGridPosition(target.gridW, target.gridH, [target.id]);
            target.gridX = freePos.x;
            target.gridY = freePos.y;
          }

          changed = true;
        }
      }
    }
  }
}

// ドラッグ/リサイズ中にDOMを破壊(リビルド)せず、位置とサイズ（CSSスタイル）のみをインプレースで直接更新する軽量反映関数
function updateWidgetsPositionsOnly() {
  currentSettings.widgets.forEach(widget => {
    const frame = document.querySelector(`[data-id="${widget.id}"]`);
    if (frame) {
      // 現在操作中（ドラッグ中またはリサイズ中）のウィジェットは、マウスカーソルに遅延なくダイレクト追従させるためスタイル更新をスキップ
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

// --- 4.19. 右クリックコンテキストメニュー表示とスタイル適用のロジック ---
let activeMenuWidget = null;

// コンテキストメニューを非表示にする
function hideContextMenu() {
  if (elements.contextMenu) {
    elements.contextMenu.classList.add('hidden');
  }
  activeMenuWidget = null;
}

// コンテキストメニューを表示する（はみ出し自動調整付き）
function showContextMenu(clientX, clientY) {
  if (!elements.contextMenu) return;

  // 現在の不透明度を設定
  const opacity = (activeMenuWidget.settings && activeMenuWidget.settings.opacity !== undefined)
    ? activeMenuWidget.settings.opacity
    : 55;
  
  elements.widgetOpacityRange.value = opacity;
  elements.widgetOpacityValue.textContent = opacity;

  elements.contextMenu.classList.remove('hidden');

  // はみ出し補正のためにメニューの実サイズを取得
  const menuWidth = elements.contextMenu.offsetWidth || 200;
  const menuHeight = elements.contextMenu.offsetHeight || 120;
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

  elements.contextMenu.style.left = `${x}px`;
  elements.contextMenu.style.top = `${y}px`;
}

// 個別不透明度の適用ヘルパー
function applyWidgetOpacityStyle(frame, widget, opacity) {
  const isEdit = document.body.classList.contains('edit-mode');
  
  // 編集モード（edit-mode）中は、操作枠や角線をわかりやすく保つため最低30%の不透明度を維持する
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
function updateAllWidgetsOpacityStyles() {
  currentSettings.widgets.forEach(widget => {
    const frame = document.querySelector(`[data-id="${widget.id}"]`);
    if (frame) {
      const opacity = (widget.settings && widget.settings.opacity !== undefined) ? widget.settings.opacity : 55;
      applyWidgetOpacityStyle(frame, widget, opacity);
    }
  });
}

// ウィジェットのサイズに応じたレイアウトクラス（layout-small / layout-large）を付与するヘルパー
function applyAdaptiveLayoutClasses(frame, type, w, h) {
  if (type === 'digital-clock') {
    const isSmall = w < 5 || h < 3;
    frame.classList.toggle('layout-small', isSmall);
  } else if (type === 'analog-clock') {
    const isSmall = w < 5 || h < 5;
    frame.classList.toggle('layout-small', isSmall);
  } else if (type === 'calendar') {
    const isLarge = w >= 7 && h >= 5;
    frame.classList.toggle('layout-large', isLarge);
  } else if (type === 'memo') {
    const isLarge = w >= 5 && h >= 4;
    frame.classList.toggle('layout-large', isLarge);
  } else if (type === 'search-bar') {
    const isSmall = w < 12;
    frame.classList.toggle('layout-small', isSmall);
  }
}
