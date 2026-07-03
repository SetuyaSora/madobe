/* -------------------------------------------------------------
 * Chrome Wallpaper - Search Suggestions Module
 * ------------------------------------------------------------- */

import { appState, elements, escapeHtml } from './state.js';

let suggestDebounceTimer = null;
let currentSuggestList = [];
let activeSuggestIndex = -1;
let originalInputText = '';

// 入力イベントハンドラー (デバウンス処理)
export function handleSearchInput(e) {
  const query = e.target.value.trim();
  
  // デバウンスタイマーをリセット
  clearTimeout(suggestDebounceTimer);
  
  if (!query) {
    if (elements.suggestList) {
      elements.suggestList.innerHTML = '';
      elements.suggestList.classList.add('hidden');
    }
    activeSuggestIndex = -1;
    return;
  }
  
  // 150ms待ってからサジェストを更新
  suggestDebounceTimer = setTimeout(() => {
    updateSuggestList(query);
  }, 150);
}

// キーダウンイベントハンドラー (上下キーでの選択制御)
export function handleSearchKeydown(e) {
  if (!elements.suggestList || elements.suggestList.classList.contains('hidden') || currentSuggestList.length === 0) {
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
    }
  }
}

// サジェスト項目ハイライトの更新とテキスト入力欄への反映
export function updateActiveSuggestItem() {
  if (!elements.suggestList) return;
  const items = elements.suggestList.querySelectorAll('.suggest-item');
  items.forEach((item, idx) => {
    if (idx === activeSuggestIndex) {
      item.classList.add('active');
      elements.searchInput.value = currentSuggestList[idx].text;
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('active');
    }
  });

  if (activeSuggestIndex === -1) {
    elements.searchInput.value = originalInputText;
  }
}

// サジェストリストの取得と描画
export function updateSuggestList(query) {
  Promise.all([
    fetchHistorySuggests(query),
    fetchGoogleSuggests(query)
  ]).then(([historyItems, googleItems]) => {
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
    const searchWidget = appState.currentSettings.widgets.find(w => w.type === 'search-bar');
    const maxSuggestItems = (searchWidget && searchWidget.gridW < 12) ? 3 : 8;
    currentSuggestList = merged.slice(0, maxSuggestItems);
    activeSuggestIndex = -1;

    renderSuggestItems();
  }).catch(err => {
    console.error("サジェストデータの統合エラー:", err);
  });
}

// サジェストのDOM描画
export function renderSuggestItems() {
  if (!elements.suggestList) return;
  elements.suggestList.innerHTML = '';

  if (currentSuggestList.length === 0) {
    elements.suggestList.classList.add('hidden');
    return;
  }

  const clockIcon = `<svg class="suggest-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
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

    li.addEventListener('click', (e) => {
      e.preventDefault();
      if (item.type === 'history') {
        window.location.href = item.url;
      } else {
        elements.searchInput.value = item.text;
        elements.suggestList.classList.add('hidden');
        if (elements.searchForm) {
          elements.searchForm.submit();
        }
      }
    });

    elements.suggestList.appendChild(li);
  });

  elements.suggestList.classList.remove('hidden');
}

// Google検索サジェストの非同期取得
export function fetchGoogleSuggests(query) {
  const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`;
  
  return fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    })
    .then(data => {
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
export function fetchHistorySuggests(query) {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.history || !chrome.history.search) {
      resolve([]);
      return;
    }

    chrome.history.search({
      text: query,
      maxResults: 5
    }, (results) => {
      if (results && results.length > 0) {
        const items = results.map(item => {
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
