/* -------------------------------------------------------------
 * Chrome Wallpaper - Settings Controller Module
 * ------------------------------------------------------------- */

import { appState, elements, GRID_COLS, GRID_ROWS, DEFAULT_SETTINGS } from './state.js';
import { storage, loadVideoBlob, saveVideoBlob, deleteVideoBlob } from './storage.js';
import { renderShortcuts } from './shortcuts.js';
import { renderWidgets, saveWidgets, initWidgetsTimer } from './widgets.js';

// Google Fonts からフォントを動的にインポートし、CSS変数に適用する
export function applyFontFamily(fontFamily, customFontName) {
  let targetFont = fontFamily;
  if (fontFamily === 'custom') {
    targetFont = customFontName ? customFontName.trim() : '';
  }

  if (!targetFont) {
    document.documentElement.style.setProperty('--font-sans', "'Inter', sans-serif");
    return;
  }

  const linkId = 'dynamic-google-font';
  let linkEl = document.getElementById(linkId);
  
  const encodedFont = encodeURIComponent(targetFont);
  const fontUrl = `https://fonts.googleapis.com/css2?family=${encodedFont}:wght@300;400;500;700&display=swap`;

  if (!linkEl) {
    linkEl = document.createElement('link');
    linkEl.id = linkId;
    linkEl.rel = 'stylesheet';
    document.head.appendChild(linkEl);
  }
  
  linkEl.href = fontUrl;

  document.documentElement.style.setProperty('--font-sans', `"${targetFont}", sans-serif`);
}

// 壁紙ソースの読み込みと適用
export function applyVideoSource() {
  if (appState.localVideoBlobUrl) {
    URL.revokeObjectURL(appState.localVideoBlobUrl);
    appState.localVideoBlobUrl = null;
  }

  const type = appState.currentSettings.bgType;

  if (type === 'default') {
    const sourceUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) 
      ? chrome.runtime.getURL('assets/default_bg.mp4') 
      : 'assets/default_bg.mp4';
    setVideoSource(sourceUrl);
  } else if (type === 'url') {
    setVideoSource(appState.currentSettings.bgUrl);
  } else if (type === 'file') {
    loadVideoBlob().then(blob => {
      if (blob) {
        appState.localVideoBlobUrl = URL.createObjectURL(blob);
        setVideoSource(appState.localVideoBlobUrl);
      } else {
        console.warn("IndexedDBに動画Blobが見つかりません。デフォルトにフォールバックします。");
        appState.currentSettings.bgType = 'default';
        storage.set({ bgType: 'default' });
        applyVideoSource();
      }
    }).catch(err => {
      console.error("IndexedDBからの動画読み込みに失敗しました:", err);
      appState.currentSettings.bgType = 'default';
      storage.set({ bgType: 'default' });
      applyVideoSource();
    });
  }
}

// ビデオソースの設定と再生開始
export function setVideoSource(url) {
  if (url && elements.video) {
    elements.video.src = url;
    elements.video.load();
    
    const speed = parseFloat(appState.currentSettings.speed);
    const vol = appState.currentSettings.volume / 100;
    elements.video.volume = vol;
    elements.video.muted = (vol === 0);

    if (speed === 0) {
      elements.video.pause();
    } else {
      elements.video.playbackRate = speed;
      elements.video.play().catch(err => {
        console.warn("動画の自動再生がブロックされました。ユーザー操作を待ちます。", err);
      });
    }
  }
}

// ソースごとの入力UI表示切り替え
export function toggleSourceInputVisibility(type) {
  if (!elements.urlInputContainer || !elements.fileInputContainer) return;
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

// 全ての設定をDOM/動画プレイヤーへ適用・初期同期
export function applyAllSettings() {
  // 初回起動時の 48x24 グリッドへの自動データマイグレーション
  if (!appState.currentSettings.gridVersion || appState.currentSettings.gridVersion < 2) {
    if (appState.currentSettings.widgets && appState.currentSettings.widgets.length > 0) {
      appState.currentSettings.widgets.forEach(widget => {
        widget.gridX = (widget.gridX || 0) * 2;
        widget.gridY = (widget.gridY || 0) * 2;
        widget.gridW = (widget.gridW || 4) * 2;
        widget.gridH = (widget.gridH || 3) * 2;
      });
    }
    appState.currentSettings.gridVersion = 2;
    storage.set({ 
      widgets: appState.currentSettings.widgets,
      gridVersion: 2
    });
  }

  // 1. 壁紙ソースの適用
  applyVideoSource();

  // 2. 音量適用
  const vol = appState.currentSettings.volume / 100;
  if (elements.video) {
    elements.video.volume = vol;
    elements.video.muted = (vol === 0);
  }
  if (elements.volumeSlider) {
    elements.volumeSlider.value = appState.currentSettings.volume;
    elements.volumeValue.textContent = `${appState.currentSettings.volume}%`;
  }

  // 3. 再生速度適用
  const speedVal = parseFloat(appState.currentSettings.speed);
  if (elements.video) {
    if (speedVal === 0) {
      elements.video.pause();
    } else {
      elements.video.playbackRate = speedVal;
      elements.video.play().catch(e => console.log(e));
    }
  }
  if (elements.speedSelect) {
    elements.speedSelect.value = appState.currentSettings.speed;
  }

  // 4. 暗度 (オーバーレイ不透明度) 適用
  if (elements.overlay) {
    elements.overlay.style.backgroundColor = `rgba(0, 0, 0, ${appState.currentSettings.overlayOpacity / 100})`;
  }
  if (elements.opacitySlider) {
    elements.opacitySlider.value = appState.currentSettings.overlayOpacity;
    elements.opacityValue.textContent = `${appState.currentSettings.overlayOpacity}%`;
  }

  // 5. 表示項目トグル適用（不要のためトグル同期処理を削除。drawerTriggerは常に表示）
  if (elements.drawerTrigger) {
    elements.drawerTrigger.classList.remove('hidden');
  }

  // 6. 設定パネルのUIの同期
  if (elements.videoSourceRadios) {
    Array.from(elements.videoSourceRadios).forEach(radio => {
      radio.checked = (radio.value === appState.currentSettings.bgType);
    });
  }
  if (elements.videoUrlInput) {
    elements.videoUrlInput.value = appState.currentSettings.bgUrl || '';
  }
  toggleSourceInputVisibility(appState.currentSettings.bgType);

  // 7. フォント設定の適用と同期
  const savedFontFamily = appState.currentSettings.fontFamily || 'Inter';
  const savedCustomFontName = appState.currentSettings.customFontName || '';
  
  applyFontFamily(savedFontFamily, savedCustomFontName);

  if (elements.fontFamilySelect) {
    elements.fontFamilySelect.value = savedFontFamily;
  }
  if (elements.customFontInput) {
    elements.customFontInput.value = savedCustomFontName;
  }
  if (elements.customFontGroup) {
    if (savedFontFamily === 'custom') {
      elements.customFontGroup.classList.remove('hidden');
    } else {
      elements.customFontGroup.classList.add('hidden');
    }
  }

  // 7. ショートカットの描画
  renderShortcuts();

  // 8. ウィジェットの描画とタイマー開始
  renderWidgets();
  initWidgetsTimer();
}

// 設定のエクスポート (JSONダウンロード)
function exportSettings() {
  const settingsCopy = { ...appState.currentSettings };
  const dataStr = JSON.stringify(settingsCopy, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
  const exportFileDefaultName = 'madobe-settings.json';
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
}

// 設定のインポート
function importSettings(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON structure');
      }

      const newSettings = { ...appState.currentSettings };
      const keysToImport = [
        'bgType', 'bgUrl', 'volume', 'speed', 'overlayOpacity',
        'fontFamily', 'customFontName', 'gridVersion', 'shortcuts', 'widgets'
      ];
      
      keysToImport.forEach(key => {
        if (parsed[key] !== undefined) {
          newSettings[key] = parsed[key];
        }
      });

      const isFileWarningNeeded = (newSettings.bgType === 'file');

      storage.set(newSettings, () => {
        appState.currentSettings = newSettings;
        applyAllSettings();
        
        if (isFileWarningNeeded) {
          alert('設定をインポートしました！\n※壁紙ソースが「ローカルファイル」に設定されているため、動画を再生するには設定画面から動画ファイルを再度選択してください。');
        } else {
          alert('設定をインポートしました！');
        }
        if (elements.importFileInput) {
          elements.importFileInput.value = '';
        }
      });
    } catch (err) {
      console.error(err);
      alert('設定ファイルのインポートに失敗しました。ファイルが壊れている可能性があります。');
      if (elements.importFileInput) {
        elements.importFileInput.value = '';
      }
    }
  };
  reader.readAsText(file);
}

// 設定初期化ダイアログの表示
function showResetDialog() {
  if (!elements.resetDialog || !elements.resetConfirmInput || !elements.resetExecuteBtn) return;
  elements.resetConfirmInput.value = '';
  elements.resetExecuteBtn.disabled = true;
  elements.resetDialog.classList.remove('hidden');
  elements.resetConfirmInput.focus();
}

function handleResetInput(e) {
  if (!elements.resetExecuteBtn) return;
  const val = e.target.value.trim();
  elements.resetExecuteBtn.disabled = (val !== 'リセット');
}

function closeResetDialog() {
  if (elements.resetDialog) {
    elements.resetDialog.classList.add('hidden');
  }
}

function executeReset() {
  deleteVideoBlob().catch(err => console.error(err));
  const defaultCopy = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  
  storage.set(defaultCopy, () => {
    appState.currentSettings = defaultCopy;
    applyAllSettings();
    closeResetDialog();
    alert('設定を初期状態にリセットしました。');
  });
}

// 設定変更関連イベントリスナーの初期化
export function initSettings() {
  // Visibility API による省電力・軽量化 (最重要)
  document.addEventListener('visibilitychange', () => {
    if (!elements.video) return;
    if (document.hidden) {
      elements.video.pause();
      console.log('Tab backgrounded: Video paused for performance.');
    } else {
      const speed = parseFloat(appState.currentSettings.speed);
      if (speed > 0) {
        elements.video.playbackRate = speed;
        elements.video.play().catch(e => console.log('Playback resume failed:', e));
        console.log('Tab foregrounded: Video resumed.');
      } else {
        elements.video.pause();
        console.log('Tab foregrounded: Video remains paused as speed is 0.');
      }
    }
  });

  // 設定パネル開閉
  if (elements.settingsToggle) {
    elements.settingsToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.settingsPanel.classList.toggle('hidden');
    });
  }

  if (elements.settingsClose) {
    elements.settingsClose.addEventListener('click', () => {
      elements.settingsPanel.classList.add('hidden');
    });
  }

  document.addEventListener('click', (e) => {
    if (elements.settingsPanel && !elements.settingsPanel.classList.contains('hidden') && 
        !elements.settingsPanel.contains(e.target) && 
        !elements.settingsToggle.contains(e.target)) {
      elements.settingsPanel.classList.add('hidden');
    }
  });

  // 壁紙ソースのラジオボタン変更
  if (elements.videoSourceRadios) {
    Array.from(elements.videoSourceRadios).forEach(radio => {
      radio.addEventListener('change', (e) => {
        const type = e.target.value;
        toggleSourceInputVisibility(type);

        if (type === 'default') {
          appState.currentSettings.bgType = 'default';
          storage.set({ bgType: 'default' });
          deleteVideoBlob().catch(err => console.error(err));
          applyVideoSource();
        } else if (type === 'file') {
          loadVideoBlob().then(blob => {
            if (blob) {
              appState.currentSettings.bgType = 'file';
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
  }

  // 外部URLの適用
  if (elements.saveUrlBtn) {
    elements.saveUrlBtn.addEventListener('click', () => {
      const url = elements.videoUrlInput.value.trim();
      if (url) {
        appState.currentSettings.bgType = 'url';
        appState.currentSettings.bgUrl = url;
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
  }

  // ローカルファイル選択
  if (elements.videoFileInput) {
    elements.videoFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        saveVideoBlob(file).then(() => {
          appState.currentSettings.bgType = 'file';
          storage.set({ bgType: 'file' }, () => {
            applyVideoSource();
          });
        }).catch(err => {
          console.error("IndexedDBへの動画保存に失敗しました:", err);
          alert("動画の保存に失敗しました。容量が大きい（またはブラウザの空き容量不足）可能性があります。");
        });
      }
    });
  }

  // 暗度 (不透明度) スライダー
  if (elements.opacitySlider) {
    elements.opacitySlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      appState.currentSettings.overlayOpacity = val;
      elements.opacityValue.textContent = `${val}%`;
      if (elements.overlay) {
        elements.overlay.style.backgroundColor = `rgba(0, 0, 0, ${val / 100})`;
      }
    });

    elements.opacitySlider.addEventListener('change', () => {
      storage.set({ overlayOpacity: appState.currentSettings.overlayOpacity });
    });
  }

  // 音量スライダー
  if (elements.volumeSlider) {
    elements.volumeSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      appState.currentSettings.volume = val;
      elements.volumeValue.textContent = `${val}%`;
      
      if (elements.video) {
        const vol = val / 100;
        elements.video.volume = vol;
        elements.video.muted = (vol === 0);
      }
    });

    elements.volumeSlider.addEventListener('change', () => {
      storage.set({ volume: appState.currentSettings.volume });
    });
  }

  // 再生速度
  if (elements.speedSelect) {
    elements.speedSelect.addEventListener('change', (e) => {
      const speed = parseFloat(e.target.value);
      appState.currentSettings.speed = speed;
      if (elements.video) {
        if (speed === 0) {
          elements.video.pause();
        } else {
          elements.video.playbackRate = speed;
          elements.video.play().catch(err => console.log(err));
        }
      }
      storage.set({ speed: speed });
    });
  }

  // 表示トグル（不要のため削除）

  // フォントの種類切り替えリスナー
  if (elements.fontFamilySelect) {
    elements.fontFamilySelect.addEventListener('change', (e) => {
      const family = e.target.value;
      appState.currentSettings.fontFamily = family;
      storage.set({ fontFamily: family });

      if (family === 'custom') {
        if (elements.customFontGroup) {
          elements.customFontGroup.classList.remove('hidden');
        }
      } else {
        if (elements.customFontGroup) {
          elements.customFontGroup.classList.add('hidden');
        }
        applyFontFamily(family, '');
      }
    });
  }

  // カスタムフォント適用ボタンのクリックリスナー
  if (elements.saveFontBtn && elements.customFontInput) {
    const handleCustomFontApply = () => {
      const customName = elements.customFontInput.value.trim();
      appState.currentSettings.customFontName = customName;
      storage.set({ customFontName: customName });
      
      applyFontFamily('custom', customName);
    };

    elements.saveFontBtn.addEventListener('click', handleCustomFontApply);
    
    elements.customFontInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleCustomFontApply();
      }
    });
  }

  // 設定のエクスポート
  if (elements.exportBtn) {
    elements.exportBtn.addEventListener('click', exportSettings);
  }

  // 設定のインポートトリガー
  if (elements.importBtnTrigger) {
    elements.importBtnTrigger.addEventListener('click', () => {
      if (elements.importFileInput) {
        elements.importFileInput.click();
      }
    });
  }

  // インポート実行
  if (elements.importFileInput) {
    elements.importFileInput.addEventListener('change', importSettings);
  }

  // 初期化（リセット）ダイアログ開閉
  if (elements.resetBtn) {
    elements.resetBtn.addEventListener('click', showResetDialog);
  }

  if (elements.resetCancelBtn) {
    elements.resetCancelBtn.addEventListener('click', closeResetDialog);
  }

  if (elements.resetConfirmInput) {
    elements.resetConfirmInput.addEventListener('input', handleResetInput);
    
    // Enterキーで初期化実行（リセットと正しく入力されている場合のみ）
    elements.resetConfirmInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !elements.resetExecuteBtn.disabled) {
        executeReset();
      }
    });
  }

  if (elements.resetExecuteBtn) {
    elements.resetExecuteBtn.addEventListener('click', executeReset);
  }
}
