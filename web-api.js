// ============================================================
//  web-api.js
//  Reemplaza al preload.js de Electron cuando la app corre en el
//  navegador / instalada como PWA. Expone el mismo "window.api"
//  que usa app.js, pero guardando todo en IndexedDB del navegador
//  y sincronizando con Google Drive (scope drive.file: la app solo
//  ve el archivo que ella misma crea, nada más de tu Drive).
// ============================================================

// ---- Cambiá esto por tu propio Client ID si alguna vez armás otro proyecto ----
const DRIVE_CLIENT_ID = '795562810807-k18r1qvg41o4gtmqv8u6f0pus211togf.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FILE_NAME = 'calendario-universitario-data.json';

// ===================== IndexedDB =====================
const DB_NAME = 'calendario-universitario';
const DB_VERSION = 1;
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('attachments')) db.createObjectStore('attachments');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function idbGet(store, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(store, key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

function defaultData() {
  return {
    events: [],
    notes: {},
    noteLists: {},
    tasks: [],
    categories: [
      { id: 'c1', name: 'Clases', color: '#007aff' },
      { id: 'c2', name: 'Exámenes', color: '#ff3b30' },
      { id: 'c3', name: 'Trabajos', color: '#ff9500' },
      { id: 'c4', name: 'Estudios', color: '#34c759' },
      { id: 'c5', name: 'Personal', color: '#af52de' },
      { id: 'c6', name: 'Universidad', color: '#5856d6' },
      { id: 'c7', name: 'Salud', color: '#ff2d92' },
      { id: 'c8', name: 'Reuniones', color: '#5ac8fa' }
    ],
    settings: { weekStart: 1, defaultView: 'month', showWeekNumbers: false, timeFormat: '24h' },
    version: 2
  };
}

// ===================== Google Drive (OAuth vía Google Identity Services) =====================
let tokenClient = null;
let accessToken = null;
let accessTokenExpiry = 0;

function gsiReady() {
  return new Promise((resolve) => {
    if (window.google && window.google.accounts) return resolve();
    const check = setInterval(() => {
      if (window.google && window.google.accounts) { clearInterval(check); resolve(); }
    }, 100);
  });
}

async function ensureTokenClient() {
  await gsiReady();
  if (tokenClient) return tokenClient;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: () => {} // se pisa en cada request puntual
  });
  return tokenClient;
}

function requestAccessToken(interactive) {
  return new Promise(async (resolve, reject) => {
    const client = await ensureTokenClient();
    client.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      accessToken = resp.access_token;
      accessTokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000 - 60000;
      localStorage.setItem('drive-connected', '1');
      resolve(accessToken);
    };
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

async function getValidAccessToken(interactive) {
  if (accessToken && Date.now() < accessTokenExpiry) return accessToken;
  try {
    return await requestAccessToken(interactive);
  } catch (e) {
    if (!interactive) return null; // el intento silencioso falló, no forzamos login solo
    throw e;
  }
}

async function driveFindFile(token) {
  const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)&spaces=drive`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return (data.files && data.files[0]) || null;
}
async function driveGetMeta(token, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,modifiedTime`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
async function driveUpload(token, content, fileId) {
  const metadata = { name: DRIVE_FILE_NAME, mimeType: 'application/json' };
  const boundary = 'onesecond' + Date.now();
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
  const res = await fetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  return res.json();
}
async function driveDownload(token, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  return res.text();
}

function getSyncState() {
  try { return JSON.parse(localStorage.getItem('drive-sync-state') || '{}'); } catch (e) { return {}; }
}
function setSyncState(s) { localStorage.setItem('drive-sync-state', JSON.stringify(s)); }

async function driveSyncNow() {
  const token = await getValidAccessToken(false);
  if (!token) return { ok: false, error: 'No conectado a Google Drive' };

  let state = getSyncState();
  let remote = state.fileId ? { id: state.fileId } : await driveFindFile(token);
  if (!remote) remote = await driveFindFile(token);
  if (remote && remote.id && !remote.modifiedTime) remote = await driveGetMeta(token, remote.id);

  const localMtime = parseInt(localStorage.getItem('calendario-last-local-change') || '0');

  if (remote && remote.id) {
    const remoteTime = remote.modifiedTime ? new Date(remote.modifiedTime).getTime() : 0;
    const lastKnownRemote = state.lastRemoteModified ? new Date(state.lastRemoteModified).getTime() : 0;
    const remoteChanged = remoteTime > lastKnownRemote;
    const localChanged = localMtime > (state.lastLocalSyncMtime || 0);

    if (remoteChanged && !localChanged) {
      const content = await driveDownload(token, remote.id);
      await idbSet('kv', 'data', JSON.parse(content));
      localStorage.setItem('calendario-last-local-change', String(Date.now()));
      setSyncState({ fileId: remote.id, lastRemoteModified: remote.modifiedTime, lastLocalSyncMtime: Date.now() });
      return { ok: true, action: 'downloaded' };
    }
    const data = await idbGet('kv', 'data') || defaultData();
    const content = JSON.stringify(data);
    const uploaded = await driveUpload(token, content, remote.id);
    if (uploaded.error) return { ok: false, error: uploaded.error.message || 'Error subiendo a Drive' };
    const meta = await driveGetMeta(token, uploaded.id);
    setSyncState({ fileId: uploaded.id, lastRemoteModified: meta.modifiedTime, lastLocalSyncMtime: localMtime });
    return { ok: true, action: 'uploaded' };
  }

  const data = await idbGet('kv', 'data') || defaultData();
  const content = JSON.stringify(data);
  const uploaded = await driveUpload(token, content, null);
  if (uploaded.error) return { ok: false, error: uploaded.error.message || 'Error subiendo a Drive' };
  const meta = await driveGetMeta(token, uploaded.id);
  setSyncState({ fileId: uploaded.id, lastRemoteModified: meta.modifiedTime, lastLocalSyncMtime: localMtime });
  return { ok: true, action: 'uploaded-new' };
}

let syncListeners = [];
let syncDebounce;
function scheduleSync() {
  if (localStorage.getItem('drive-connected') !== '1') return;
  clearTimeout(syncDebounce);
  syncDebounce = setTimeout(async () => {
    const result = await driveSyncNow().catch(e => ({ ok: false, error: e.message }));
    syncListeners.forEach(cb => cb(result));
  }, 4000);
}

// ===================== window.api =====================
window.api = {
  async loadData() {
    const data = await idbGet('kv', 'data');
    return data || defaultData();
  },
  async saveData(data) {
    await idbSet('kv', 'data', data);
    localStorage.setItem('calendario-last-local-change', String(Date.now()));
    scheduleSync();
    return true;
  },
  async getDataPath() { return 'Este navegador (guardado local) + Google Drive'; },
  async getDataDir() { return 'Este navegador (guardado local) + Google Drive'; },
  async openDataFolder() {
    alert('En la versión de celular/web tus datos viven en el navegador y se sincronizan con Google Drive. No hay una "carpeta" para abrir como en la compu.');
  },
  async openAttachments() {
    alert('Los adjuntos en esta versión se guardan dentro del navegador.');
  },
  async exportData(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'calendario-backup.json';
    a.click();
    return { ok: true };
  },
  async importData() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = () => {
        const file = input.files[0];
        if (!file) { resolve({ ok: false }); return; }
        const reader = new FileReader();
        reader.onload = () => {
          try { resolve({ ok: true, data: JSON.parse(reader.result) }); }
          catch (e) { resolve({ ok: false, error: e.message }); }
        };
        reader.readAsText(file);
      };
      input.click();
    });
  },
  async exportNote({ content, title }) {
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title || 'nota'}.txt`;
    a.click();
    return { ok: true };
  },
  async exportPdf(html) {
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
    return { ok: true };
  },
  async saveAttachment({ name, buffer }) {
    const id = `${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const blob = new Blob([new Uint8Array(buffer)]);
    await idbSet('attachments', id, { name, blob });
    return { ok: true, path: id, name: id };
  },
  async openAttachment(id) {
    const rec = await idbGet('attachments', id);
    if (!rec) return { ok: false };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(rec.blob);
    a.download = rec.name;
    a.click();
    return { ok: true };
  },
  async showNotification({ title, body }) {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') new Notification(title, { body });
    else if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') new Notification(title, { body });
    }
    return true;
  },
  async windowMin() {},
  async windowMax() {},
  async windowClose() {},

  // ----- Google Drive -----
  async driveConnect() {
    try {
      await requestAccessToken(true);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
  async driveStatus() {
    const connected = localStorage.getItem('drive-connected') === '1';
    const state = getSyncState();
    return { connected, lastSync: state.lastRemoteModified || null };
  },
  async driveDisconnect() {
    localStorage.removeItem('drive-connected');
    localStorage.removeItem('drive-sync-state');
    accessToken = null;
    if (window.google && google.accounts && google.accounts.oauth2 && accessToken) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    return { ok: true };
  },
  async driveSyncNow() {
    try { return await driveSyncNow(); }
    catch (e) { return { ok: false, error: e.message }; }
  },
  onDriveSyncResult(cb) { syncListeners.push(cb); }
};

// Si ya estaba conectado en una sesión anterior, probamos renovar el
// token en silencio (sin mostrar ventana de login) y sincronizar antes
// de que la app termine de cargar.
(async () => {
  if (localStorage.getItem('drive-connected') === '1') {
    await getValidAccessToken(false).catch(() => {});
    await driveSyncNow().catch(() => {});
  }
})();
