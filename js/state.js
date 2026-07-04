/* -------------------------------------------------------------
 * Chrome Wallpaper - Shared State Module
 * ------------------------------------------------------------- */

export const DEFAULT_SHORTCUTS = [
  { name: 'Google', url: 'https://www.google.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'GitHub', url: 'https://github.com' }
];

export const DEFAULT_SETTINGS = {
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
export const WIDGET_RULES = {
  'search-bar':    { minW: 6, minH: 1, maxW: 24, maxH: 3 },
  'digital-clock': { minW: 3, minH: 2, maxW: 12, maxH: 5 },
  'analog-clock':  { minW: 3, minH: 3, maxW: 10, maxH: 10 },
  'calendar':      { minW: 4, minH: 4, maxW: 16, maxH: 8 },
  'memo':          { minW: 3, minH: 3, maxW: 16, maxH: 8 },
  'rss':           { minW: 6, minH: 1, maxW: 24, maxH: 8 }
};

export const LONG_PRESS_DELAY = 700; // 700ms 長押しで編集モード

// 変更可能なアプリのグローバル状態
export const appState = {
  currentSettings: { ...DEFAULT_SETTINGS },
  editingShortcutIndex: -1,
  localVideoBlobUrl: null,
  isShortcutDialogOpen: false,
  isEditMode: false,
  pressStartX: 0,
  pressStartY: 0,
  longPressTimer: null,
  cellW: 0,
  cellH: 0
};

// DOM要素の共通キャッシュ（初期状態はnull）
export const elements = {
  video: null,
  overlay: null,
  searchSection: null,
  shortcutsSection: null,
  shortcutsGrid: null,
  settingsToggle: null,
  settingsPanel: null,
  settingsClose: null,
  
  // 設定コントロール
  videoSourceRadios: null,
  urlInputContainer: null,
  videoUrlInput: null,
  saveUrlBtn: null,
  fileInputContainer: null,
  videoFileInput: null,
  opacitySlider: null,
  opacityValue: null,
  volumeSlider: null,
  volumeValue: null,
  speedSelect: null,
  showSearchCheckbox: null,
  showShortcutsCheckbox: null,

  // ショートカットダイアログ
  shortcutDialog: null,
  dialogTitle: null,
  shortcutNameInput: null,
  shortcutUrlInput: null,
  dialogCancelBtn: null,
  dialogSaveBtn: null,

  // ウィジェットレイヤー & コンテキストメニュー
  widgetsLayer: null,
  widgetContextMenu: null,
  widgetOpacityRange: null,
  widgetOpacityValue: null,
  deleteWidgetMenuBtn: null,
  rssSettingsContainer: null,
  widgetRssUrlInput: null,
  widgetRssSaveBtn: null,
  rssSpeedContainer: null,
  widgetRssSpeedRange: null,
  widgetRssSpeedValue: null,

  // ドロワー & タブ
  shortcutsDrawer: null,
  drawerTrigger: null,
  tabShortcutsBtn: null,
  tabWidgetsBtn: null,
  tabShortcutsContent: null,
  tabWidgetsContent: null,

  // 動的バインド用（検索バーなど）
  searchForm: null,
  searchInput: null,
  suggestList: null
};

// DOM構築完了後に要素を一括キャッシュ
export function initElements() {
  elements.video = document.getElementById('bg-video');
  elements.overlay = document.getElementById('bg-overlay');
  elements.searchSection = document.getElementById('search-section');
  elements.shortcutsSection = document.getElementById('shortcuts-section');
  elements.shortcutsGrid = document.getElementById('shortcuts-grid');
  elements.settingsToggle = document.getElementById('settings-toggle');
  elements.settingsPanel = document.getElementById('settings-panel');
  elements.settingsClose = document.getElementById('settings-close');

  elements.videoSourceRadios = document.getElementsByName('video-source');
  elements.urlInputContainer = document.getElementById('url-input-container');
  elements.videoUrlInput = document.getElementById('video-url-input');
  elements.saveUrlBtn = document.getElementById('save-url-btn');
  elements.fileInputContainer = document.getElementById('file-input-container');
  elements.videoFileInput = document.getElementById('video-file-input');
  elements.opacitySlider = document.getElementById('opacity-slider');
  elements.opacityValue = document.getElementById('opacity-value');
  elements.volumeSlider = document.getElementById('volume-slider');
  elements.volumeValue = document.getElementById('volume-value');
  elements.speedSelect = document.getElementById('speed-select');
  elements.showSearchCheckbox = document.getElementById('show-search-checkbox');
  elements.showShortcutsCheckbox = document.getElementById('show-shortcuts-checkbox');

  elements.shortcutDialog = document.getElementById('shortcut-dialog');
  elements.dialogTitle = document.getElementById('dialog-title');
  elements.shortcutNameInput = document.getElementById('shortcut-name-input');
  elements.shortcutUrlInput = document.getElementById('shortcut-url-input');
  elements.dialogCancelBtn = document.getElementById('dialog-cancel-btn');
  elements.dialogSaveBtn = document.getElementById('dialog-save-btn');

  elements.widgetsLayer = document.getElementById('widgets-layer');
  elements.widgetContextMenu = document.getElementById('widget-context-menu');
  elements.widgetOpacityRange = document.getElementById('widget-opacity-range');
  elements.widgetOpacityValue = document.getElementById('widget-opacity-value');
  elements.deleteWidgetMenuBtn = document.getElementById('widget-context-delete-btn');
  elements.rssSettingsContainer = document.getElementById('rss-settings-container');
  elements.widgetRssUrlInput = document.getElementById('widget-rss-url-input');
  elements.widgetRssSaveBtn = document.getElementById('widget-rss-save-btn');
  elements.rssSpeedContainer = document.getElementById('rss-speed-container');
  elements.widgetRssSpeedRange = document.getElementById('widget-rss-speed-range');
  elements.widgetRssSpeedValue = document.getElementById('widget-rss-speed-value');

  elements.shortcutsDrawer = document.getElementById('shortcuts-drawer');
  elements.drawerTrigger = document.getElementById('drawer-trigger');
  elements.tabShortcutsBtn = document.getElementById('tab-shortcuts-btn');
  elements.tabWidgetsBtn = document.getElementById('tab-widgets-btn');
  elements.tabShortcutsContent = document.getElementById('tab-shortcuts-content');
  elements.tabWidgetsContent = document.getElementById('tab-widgets-content');
}

// ヘルパー: HTMLエスケープ
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
