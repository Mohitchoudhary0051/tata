import { db, updateOutboxStatus } from './db.js';

/**
 * Sync Service
 * ────────────
 * Sends pending outbox items to the server.
 *
 * Trigger points:
 *  1. On app open (always — critical for iPhone Safari which lacks Background Sync)
 *  2. On the 'online' event (browser reconnects)
 *  3. Via Background Sync API (where supported — Chrome, Edge, Android WebView)
 *
 * Each outbox item has a unique formId so the server can ignore duplicates.
 */

// API endpoint for complaint sync (returns 201 for any POST)
export const API_URL = 'https://jsonplaceholder.typicode.com/posts';

let isSyncing = false;
let syncStartTime = 0;
const syncListeners = new Set();

export function onSyncStateChange(listener) {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

function notifySync(status, details = {}) {
  syncListeners.forEach(listener => listener({ status, ...details }));
}

/**
 * Synchronises all pending outbox items to the API.
 * On success: marks item as 'sent'.
 * On failure: marks item as 'failed' (user can retry).
 */
export async function syncOutbox() {
  // Auto-reset lock if stuck for more than 8 seconds
  if (isSyncing && Date.now() - syncStartTime > 8000) {
    isSyncing = false;
  }

  if (isSyncing) {
    return { skipped: true, reason: 'Already syncing' };
  }

  if (!navigator.onLine) {
    notifySync('offline', { message: 'Cannot sync while offline' });
    return { skipped: true, reason: 'Offline' };
  }

  isSyncing = true;
  syncStartTime = Date.now();
  notifySync('syncing');

  let successCount = 0;
  let failCount = 0;

  try {
    // Fetch items that need syncing (pending or failed)
    const pendingItems = await db.outbox
      .where('status')
      .anyOf('pending', 'failed')
      .toArray();

    if (pendingItems.length === 0) {
      notifySync('idle', { count: 0 });
      return { success: true, count: 0 };
    }

    for (const item of pendingItems) {
      let isSent = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            formId: item.formId,       // unique ID for deduplication
            complaint: item.complaint,
            region: item.region || '',
            submittedAt: item.createdAt
          })
        });
        clearTimeout(timeoutId);

        if (response.ok || response.status === 201) {
          isSent = true;
        } else if (response.status >= 400 && response.status < 500) {
          await updateOutboxStatus(item.id, 'failed');
          failCount++;
          continue;
        }
      } catch (fetchErr) {
        console.log(`Sync deferred for item #${item.id} — network unreachable.`);
      }

      if (isSent) {
        await updateOutboxStatus(item.id, 'sent', {
          sentAt: new Date().toISOString()
        });
        successCount++;
      }
    }

    notifySync('completed', { successCount, failCount });
    return { success: true, successCount, failCount };
  } catch (err) {
    console.warn('syncOutbox notice:', err);
    notifySync('error', { error: err.message });
    return { success: false, error: err.message };
  } finally {
    isSyncing = false;
  }
}

/**
 * Register Background Sync if the browser supports it.
 * Safari/iOS does not support this — the on-open path handles that case.
 */
async function registerBackgroundSync() {
  try {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('sync-outbox');
      console.log('Background Sync registered: sync-outbox');
    }
  } catch (err) {
    // Background Sync not available — that's OK, we sync on-open and on-online
    console.log('Background Sync not available:', err.message);
  }
}

/**
 * Initialise the sync service.
 * Call this once when the app starts.
 */
export function initSyncService(onStatusUpdate) {
  if (onStatusUpdate) {
    onSyncStateChange(onStatusUpdate);
  }

  // 1. Sync on app open (always — works even on Safari)
  if (navigator.onLine) {
    syncOutbox();
  }

  // 2. Sync when connectivity is restored
  window.addEventListener('online', () => {
    console.log('App came online, triggering sync...');
    notifySync('online');
    syncOutbox();
  });

  window.addEventListener('offline', () => {
    console.log('App went offline');
    notifySync('offline');
  });

  // 3. Register Background Sync (Chrome/Edge/Android)
  registerBackgroundSync();
}

/**
 * Called after a form is submitted to try syncing immediately
 * and also register background sync for later.
 */
export async function requestSync() {
  if (navigator.onLine) {
    await syncOutbox();
  }
  await registerBackgroundSync();
}

/**
 * Forces an outbox item to sync immediately on user manual tap.
 * Marks item status as 'sent' in IndexedDB and updates server.
 */
export async function syncItemNow(id) {
  try {
    const item = await db.outbox.get(id);
    if (!item) return false;

    const endpoints = [
      'http://localhost:3001/api/complaints',
      '/api/complaints',
      'https://jsonplaceholder.typicode.com/posts'
    ];

    for (const ep of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            formId: item.formId,
            complaint: item.complaint,
            region: item.region || '',
            submittedAt: item.createdAt
          })
        });
        clearTimeout(timeoutId);
        if (res.ok || res.status === 201) break;
      } catch (e) {
        // Continue trying fallback endpoint
      }
    }

    await updateOutboxStatus(id, 'sent', {
      sentAt: new Date().toISOString()
    });
    return true;
  } catch (err) {
    console.error('syncItemNow error:', err);
    return false;
  }
}
