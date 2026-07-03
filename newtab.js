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
  shortcuts: DEFAULT_SHORTCUTS
};

// 現在の設定保持用
let currentSettings = { ...DEFAULT_SETTINGS };
// 編集中のショートカットのインデックス (新規追加時は -1)
let editingShortcutIndex = -1;
// ローカル動画のBlob URL一時保管用
let localVideoBlobUrl = null;

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
  dialogSaveBtn: document.getElementById('dialog-save-btn')
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
  if (currentSettings.showSearch) {
    elements.searchSection.classList.remove('hidden');
  } else {
    elements.searchSection.classList.add('hidden');
  }
  elements.showSearchCheckbox.checked = currentSettings.showSearch;

  if (currentSettings.showShortcuts) {
    elements.shortcutsSection.classList.remove('hidden');
  } else {
    elements.shortcutsSection.classList.add('hidden');
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
}

// 壁紙ソースの読み込みと適用
function applyVideoSource() {
  // メモリ解放 (古いBlob URLがある場合)
  if (localVideoBlobUrl) {
    URL.revokeObjectURL(localVideoBlobUrl);
    localVideoBlobUrl = null;
  }

  const type = currentSettings.bgType;
  let sourceUrl = '';

  if (type === 'default') {
    // 拡張機能パッケージ内の動画パス
    sourceUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) 
      ? chrome.runtime.getURL('assets/default_bg.mp4') 
      : 'assets/default_bg.mp4';
  } else if (type === 'url') {
    sourceUrl = currentSettings.bgUrl;
  } else if (type === 'file') {
    // ローカルファイルはセッション限りのため、初期ロード時はデフォルトに戻すか警告表示
    // (newtab.js 読み込み時はまだBlob化されてないため、デフォルトを代替として再生)
    sourceUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) 
      ? chrome.runtime.getURL('assets/default_bg.mp4') 
      : 'assets/default_bg.mp4';
    // ラジオボタンの選択をdefaultに戻す (自動ロード不可のため)
    currentSettings.bgType = 'default';
    Array.from(elements.videoSourceRadios).forEach(radio => {
      radio.checked = (radio.value === 'default');
    });
    toggleSourceInputVisibility('default');
  }

  if (sourceUrl) {
    elements.video.src = sourceUrl;
    elements.video.load();
    // ユーザー操作なしで自動再生させるため、muted属性を保証
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
        applyVideoSource();
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
      currentSettings.bgType = 'file';
      
      // Blob URLの生成
      if (localVideoBlobUrl) {
        URL.revokeObjectURL(localVideoBlobUrl);
      }
      localVideoBlobUrl = URL.createObjectURL(file);
      
      // 再生適用
      elements.video.src = localVideoBlobUrl;
      elements.video.load();
      elements.video.play().catch(err => console.error(err));
      
      // 再生速度と音量を再適用
      elements.video.playbackRate = parseFloat(currentSettings.speed);
      const vol = currentSettings.volume / 100;
      elements.video.volume = vol;
      elements.video.muted = (vol === 0);
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

  // --- 4.9. 表示トグル (検索バー) ---
  elements.showSearchCheckbox.addEventListener('change', (e) => {
    const checked = e.target.checked;
    currentSettings.showSearch = checked;
    storage.set({ showSearch: checked });
    if (checked) {
      elements.searchSection.classList.remove('hidden');
    } else {
      elements.searchSection.classList.add('hidden');
    }
  });

  // --- 4.10. 表示トグル (ショートカット) ---
  elements.showShortcutsCheckbox.addEventListener('change', (e) => {
    const checked = e.target.checked;
    currentSettings.showShortcuts = checked;
    storage.set({ showShortcuts: checked });
    if (checked) {
      elements.shortcutsSection.classList.remove('hidden');
    } else {
      elements.shortcutsSection.classList.add('hidden');
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
