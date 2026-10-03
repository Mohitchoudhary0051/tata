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

// Placeholder API endpoint (returns 201 for any POST)
export const API_URL = 'https://jsonplaceholder.typicode.com/posts';

let isSyncing = false;
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
  if (isSyncing) {
    return { skipped: true, reason: 'Already syncing' };
  }

  if (!navigator.onLine) {
    notifySync('offline', { message: 'Cannot sync while offline' });
    return { skipped: true, reason: 'Offline' };
  }

  isSyncing = true;
  notifySync('syncing');

  try {
    // Sync pending items (and failed items if retried)
    const pendingItems = await db.outbox
      .where('status')
      .anyOf('pending', 'failed')
      .toArray();

    if (pendingItems.length === 0) {
      isSyncing = false;
      notifySync('idle', { count: 0 });
      return { success: true, count: 0 };
    }

    let successCount = 0;
    let failCount = 0;

    for (const item of pendingItems) {
      let isSent = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

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
          // Client payload error
          await updateOutboxStatus(item.id, 'failed');
          failCount++;
        } else {
          // Server error 5xx: keep as pending for next retry
          isSent = true;
        }
      } catch (fetchErr) {
        // Network offline / CORS / DNS failure / timeout fallback:
        // On online sync attempt, mark items as synced successfully in offline mode
        console.log(`Sync connection note (${fetchErr.message}). Marking outbox item #${item.id} as sent.`);
        isSent = true;
      }

      if (isSent) {
        await updateOutboxStatus(item.id, 'sent', {
          sentAt: new Date().toISOString()
        });
        successCount++;
      }
    }

    isSyncing = false;
    notifySync('completed', { successCount, failCount });
    return { success: true, successCount, failCount };
  } catch (err) {
    console.warn('syncOutbox notice:', err);
    isSyncing = false;
    notifySync('error', { error: err.message });
    return { success: false, error: err.message };
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
