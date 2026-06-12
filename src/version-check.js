const VERSION_URL = '/version.json';
const STORAGE_KEY = 'arena_client_version';
const CHECK_INTERVAL_MS = 60_000;

let currentVersion = null;
let checking = false;

async function clearClientCaches() {
  if (!('caches' in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  } catch {}
}

async function readServerVersion() {
  const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) throw new Error('version_unavailable');
  const data = await res.json();
  return String(data.version || '').trim();
}

async function applyVersionCheck(forceReload = false) {
  if (checking) return;
  checking = true;
  try {
    const serverVersion = await readServerVersion();
    if (!serverVersion) return;

    const storedVersion = localStorage.getItem(STORAGE_KEY);
    currentVersion = currentVersion || storedVersion || serverVersion;

    if (storedVersion && storedVersion !== serverVersion) {
      localStorage.setItem(STORAGE_KEY, serverVersion);
      await clearClientCaches();
      if (forceReload || document.visibilityState === 'visible') {
        window.location.reload();
      }
      return;
    }

    localStorage.setItem(STORAGE_KEY, serverVersion);
    currentVersion = serverVersion;
  } catch {
    // Falha silenciosa: sem internet/API, o jogo continua com a versao atual.
  } finally {
    checking = false;
  }
}

export function startVersionChecker() {
  applyVersionCheck(false);
  setInterval(() => applyVersionCheck(true), CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') applyVersionCheck(true);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      applyVersionCheck(true);
    });
  }
}
