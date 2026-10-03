import Dexie from 'dexie';

export const db = new Dexie('SafeFormDB');

/**
 * Database schema:
 *   drafts  — auto-saved form state (single active draft)
 *   outbox  — submitted forms waiting to sync
 *   reports — anonymous scam reports (type + region only)
 *
 * Every outbox entry gets a unique formId (UUID) so the server
 * can ignore duplicates if the same form is sent twice.
 */
db.version(2).stores({
  drafts:  'id',
  outbox:  '++id, formId, status, createdAt',
  reports: '++id, scamType, region, createdAt'
});

export const DRAFT_KEY = 'active_draft';

// ─── UUID helper ──────────────────────────────────────────────────────
// Works in all modern browsers; falls back to Math.random for older ones
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: v4-like UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Draft operations ─────────────────────────────────────────────────

/**
 * Auto-saves form fields to IndexedDB immediately.
 * Called on every input change so nothing is lost if the app closes.
 */
export async function saveDraft(data) {
  try {
    await db.drafts.put({
      id: DRAFT_KEY,
      name: data.name || '',
      phone: data.phone || '',
      complaint: data.complaint || '',
      region: data.region || '',
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to save draft:', err);
  }
}

/**
 * Loads the active draft from IndexedDB.
 */
export async function loadDraft() {
  try {
    const draft = await db.drafts.get(DRAFT_KEY);
    return draft || { name: '', phone: '', complaint: '', region: '' };
  } catch (err) {
    console.error('Failed to load draft:', err);
    return { name: '', phone: '', complaint: '', region: '' };
  }
}

/**
 * Clears the active draft after successful submission.
 */
export async function clearDraft() {
  try {
    await db.drafts.delete(DRAFT_KEY);
  } catch (err) {
    console.error('Failed to clear draft:', err);
  }
}

// ─── Outbox operations ────────────────────────────────────────────────

/**
 * Submits form data into the outbox with 'pending' status.
 * Generates a unique formId so the server can deduplicate.
 * Clears the draft after adding to outbox.
 */
export async function submitToOutbox(data) {
  const formId = generateId();
  const record = {
    formId,
    name: data.name,
    phone: data.phone,
    complaint: data.complaint,
    region: data.region || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
    sentAt: null
  };

  const id = await db.outbox.add(record);
  await clearDraft();
  return { id, ...record };
}

/**
 * Gets all outbox items, newest first.
 */
export async function getOutboxItems() {
  try {
    const items = await db.outbox.toArray();
    return items.sort((a, b) => b.id - a.id);
  } catch (err) {
    console.error('Failed to get outbox items:', err);
    return [];
  }
}

/**
 * Update the status of a single outbox item.
 */
export async function updateOutboxStatus(id, status, extra = {}) {
  try {
    await db.outbox.update(id, { status, ...extra });
  } catch (err) {
    console.error('Failed to update outbox item:', err);
  }
}

// ─── Scam report operations ──────────────────────────────────────────
// Reports send ONLY scam type + region. Never the message text.

/**
 * Save an anonymous scam report.
 */
export async function saveScamReport(scamType, region) {
  try {
    await db.reports.add({
      scamType,
      region: region || 'Unknown',
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to save scam report:', err);
  }
}

/**
 * Get all scam reports (for dashboard aggregation).
 */
export async function getScamReports() {
  try {
    return await db.reports.toArray();
  } catch (err) {
    console.error('Failed to get scam reports:', err);
    return [];
  }
}
