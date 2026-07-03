/* -------------------------------------------------------------
 * Chrome Wallpaper - Storage Module
 * ------------------------------------------------------------- */

// ストレージのポリフィル (Chrome Extension Storage と Web LocalStorage の両対応)
export const storage = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? {
  get: (defaults, callback) => {
    chrome.storage.local.get(Object.keys(defaults), (result) => {
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
          result[key] = val;
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

// IndexedDB 制御用 (ローカル動画の永続保存用)
const DB_NAME = 'ChromeWallpaperDB';
const DB_VERSION = 1;
const STORE_NAME = 'wallpapers';
const KEY_NAME = 'user_video';

export function openDB() {
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

export function saveVideoBlob(blob) {
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

export function loadVideoBlob() {
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

export function deleteVideoBlob() {
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
