/* -------------------------------------------------------------
 * Chrome Wallpaper - Shortcuts Drawer & CRUD Module
 * ------------------------------------------------------------- */

import { appState, elements, escapeHtml } from './state.js';
import { storage } from './storage.js';

// ドメイン名に基づいて一意のグラデーション背景を生成
export function getRandomGradient(str) {
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

// ドロワーを開く
export function openShortcutsDrawer() {
  if (appState.currentSettings.showShortcuts && elements.shortcutsDrawer) {
    elements.shortcutsDrawer.classList.add('open');
  }
}

// ドロワーを閉じる
export function closeShortcutsDrawer() {
  if (elements.shortcutsDrawer) {
    elements.shortcutsDrawer.classList.remove('open');
  }
}

// ショートカット追加・編集ダイアログを開く
export function openShortcutDialog(index = -1) {
  appState.isShortcutDialogOpen = true;
  if (elements.shortcutsDrawer) {
    elements.shortcutsDrawer.classList.add('open');
  }

  appState.editingShortcutIndex = index;
  if (index === -1) {
    elements.dialogTitle.textContent = 'ショートカットを追加';
    elements.shortcutNameInput.value = '';
    elements.shortcutUrlInput.value = '';
  } else {
    elements.dialogTitle.textContent = 'ショートカットを編集';
    const item = appState.currentSettings.shortcuts[index];
    elements.shortcutNameInput.value = item.name;
    elements.shortcutUrlInput.value = item.url;
  }
  elements.shortcutDialog.classList.remove('hidden');
  elements.shortcutNameInput.focus();
}

// ダイアログを閉じる
export function closeShortcutDialog() {
  elements.shortcutDialog.classList.add('hidden');
  appState.editingShortcutIndex = -1;
  appState.isShortcutDialogOpen = false;
  closeShortcutsDrawer();
}

// ショートカットを削除
export function deleteShortcut(index) {
  if (confirm(`「${appState.currentSettings.shortcuts[index].name}」を削除しますか？`)) {
    appState.currentSettings.shortcuts.splice(index, 1);
    storage.set({ shortcuts: appState.currentSettings.shortcuts }, () => {
      renderShortcuts();
    });
  }
}

// ショートカットのレンダリング
export function renderShortcuts() {
  if (!elements.shortcutsGrid) return;
  elements.shortcutsGrid.innerHTML = '';
  const shortcuts = appState.currentSettings.shortcuts || [];

  shortcuts.forEach((item, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'shortcut-item';
    
    let domain = '';
    try {
      domain = new URL(item.url).hostname;
    } catch(e) {
      domain = item.url;
    }

    const initial = item.name ? item.name.charAt(0) : '?';
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

    const link = itemEl.querySelector('.shortcut-link');
    link.addEventListener('click', (e) => {
      if (e.target.closest('.shortcut-actions')) {
        e.preventDefault();
      }
    });

    const editBtn = itemEl.querySelector('.edit-btn');
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openShortcutDialog(index);
    });

    const deleteBtn = itemEl.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteShortcut(index);
    });

    elements.shortcutsGrid.appendChild(itemEl);
  });

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

// ドロワーとダイアログイベントのバインド初期化
export function initShortcuts() {
  if (elements.drawerTrigger) {
    elements.drawerTrigger.addEventListener('mouseenter', openShortcutsDrawer);
  }

  if (elements.shortcutsDrawer) {
    elements.shortcutsDrawer.addEventListener('mouseleave', () => {
      if (!appState.isShortcutDialogOpen) {
        closeShortcutsDrawer();
      }
    });
  }

  if (elements.dialogCancelBtn) {
    elements.dialogCancelBtn.addEventListener('click', closeShortcutDialog);
  }

  if (elements.dialogSaveBtn) {
    elements.dialogSaveBtn.addEventListener('click', () => {
      const name = elements.shortcutNameInput.value.trim();
      let url = elements.shortcutUrlInput.value.trim();

      if (!name || !url) {
        alert('名前とURLを入力してください。');
        return;
      }

      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }

      if (appState.editingShortcutIndex === -1) {
        appState.currentSettings.shortcuts.push({ name, url });
      } else {
        appState.currentSettings.shortcuts[appState.editingShortcutIndex] = { name, url };
      }

      storage.set({ shortcuts: appState.currentSettings.shortcuts }, () => {
        renderShortcuts();
        closeShortcutDialog();
      });
    });
  }

  if (elements.shortcutDialog) {
    elements.shortcutDialog.addEventListener('click', (e) => {
      if (e.target === elements.shortcutDialog) {
        closeShortcutDialog();
      }
    });
  }
}
