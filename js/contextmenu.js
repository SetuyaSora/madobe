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

  // RSSウィジェット用の設定項目トグル表示
  if (elements.rssSettingsContainer) {
    if (activeMenuWidget.type === 'rss') {
      elements.rssSettingsContainer.classList.remove('hidden');
      let urlsText = '';
      if (activeMenuWidget.settings) {
        if (Array.isArray(activeMenuWidget.settings.rssUrls)) {
          urlsText = activeMenuWidget.settings.rssUrls.join('\n');
        } else if (activeMenuWidget.settings.rssUrl) {
          urlsText = activeMenuWidget.settings.rssUrl;
        }
      }
      elements.widgetRssUrlInput.value = urlsText;
      
      // スクロール速度スライダーの表示トグル (ティッカーモード時のみ表示)
      if (elements.rssSpeedContainer) {
        const frameEl = document.querySelector(`[data-id="${activeMenuWidget.id}"]`);
        const isTicker = frameEl ? frameEl.classList.contains('layout-ticker') : false;
        
        if (isTicker) {
          elements.rssSpeedContainer.classList.remove('hidden');
          const speed = (activeMenuWidget.settings && activeMenuWidget.settings.tickerSpeed !== undefined)
            ? activeMenuWidget.settings.tickerSpeed
            : 45;
          elements.widgetRssSpeedRange.value = speed;
          elements.widgetRssSpeedValue.textContent = speed;
        } else {
          elements.rssSpeedContainer.classList.add('hidden');
        }
      }
    } else {
      elements.rssSettingsContainer.classList.add('hidden');
    }
  }

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

  // RSS適用ボタンのイベントハンドラー
  if (elements.widgetRssSaveBtn) {
    elements.widgetRssSaveBtn.addEventListener('click', () => {
      if (!activeMenuWidget) return;
      const textVal = elements.widgetRssUrlInput.value.trim();
      if (!textVal) {
        alert('有効なRSSフィードのURLを入力してください。');
        return;
      }

      // 改行で分割して有効なURL配列を作成
      const urls = textVal.split('\n')
        .map(u => u.trim())
        .filter(u => u.length > 0);

      if (urls.length === 0) {
        alert('有効なRSSフィードのURLを入力してください。');
        return;
      }

      // 各URLのオリジンパターンを一括抽出
      const origins = [];
      for (const url of urls) {
        try {
          const urlObj = new URL(url);
          origins.push(`${urlObj.protocol}//${urlObj.hostname}/*`);
        } catch (err) {
          alert(`無効なURL形式が含まれています: ${url}`);
          return;
        }
      }

      if (typeof chrome !== 'undefined' && chrome.permissions && chrome.permissions.request) {
        // 重複を除外した一括許可リクエスト
        const uniqueOrigins = [...new Set(origins)];
        chrome.permissions.request({
          origins: uniqueOrigins
        }, (granted) => {
          if (granted) {
            saveAndReloadRss(urls);
          } else {
            alert('RSSを表示するには、登録したサイトへの通信を許可する必要があります。');
          }
        });
      } else {
        // 通常ブラウザ環境（テスト等）
        saveAndReloadRss(urls);
      }
    });
  }

  // RSSスクロール速度スライダーのイベントハンドラー
  if (elements.widgetRssSpeedRange) {
    elements.widgetRssSpeedRange.addEventListener('input', (e) => {
      if (!activeMenuWidget) return;
      const val = parseInt(e.target.value);
      elements.widgetRssSpeedValue.textContent = val;

      if (!activeMenuWidget.settings) activeMenuWidget.settings = {};
      activeMenuWidget.settings.tickerSpeed = val;

      // リアルタイムでティッカーのアニメーション速度を同期更新
      const frameEl = document.querySelector(`[data-id="${activeMenuWidget.id}"]`);
      if (frameEl) {
        const track = frameEl.querySelector('.ticker-track');
        if (track) {
          track.style.animationDuration = `${val}s`;
        }
      }

      saveWidgetsCallback();
    });
  }

  function saveAndReloadRss(urls) {
    if (!activeMenuWidget.settings) activeMenuWidget.settings = {};
    activeMenuWidget.settings.rssUrls = urls;
    // 後方互換性のために最初のURLを rssUrl にも同期保存
    activeMenuWidget.settings.rssUrl = urls[0] || '';
    
    saveWidgetsCallback();
    renderWidgetsCallback();
    hideContextMenu();
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
