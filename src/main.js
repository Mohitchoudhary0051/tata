/**
 * SafeForm — Offline-First Form & Scam Checker
 * ──────────────────────────────────────────────
 * Three functions:
 *   1. Offline-First Complaint Form (with outbox + sync)
 *   2. On-Device Scam Message Checker (zero network requests)
 *   3. Anonymous Sponsor Dashboard (demo data, k-anonymity)
 *
 * Built with plain JavaScript. No heavy frameworks.
 * Designed for low-end phones with weak or no internet.
 */

import './style.css';
import { saveDraft, loadDraft, submitToOutbox, getOutboxItems, saveScamReport, getScamReports } from './db.js';
import { initSyncService, requestSync, syncOutbox, syncItemNow } from './sync.js';
import { checkMessage, VERDICT_COLORS } from './scamChecker.js';

// ─── Internationalisation skeleton ────────────────────────────────────
// English strings first. Add more languages by adding keys here.
const STRINGS = {
  en: {
    appName: 'SafeForm',
    tabForm: 'Form',
    tabChecker: 'Scam Checker',
    tabDashboard: 'Dashboard',
    online: 'Online',
    offline: 'Offline',
    formTitle: 'Submit a Complaint',
    formName: 'Your name',
    formPhone: 'Phone number',
    formComplaint: 'Describe the issue',
    formRegion: 'Your region / district',
    formSubmit: 'Submit',
    formSaved: 'Draft saved automatically',
    privacyNotice: 'This form will send only your complaint text and region. Your name and phone are stored on this device only and are not sent to the server.',
    outboxTitle: 'Submitted Forms',
    outboxEmpty: 'No forms submitted yet.',
    statusPending: 'Pending',
    statusSent: 'Sent',
    statusFailed: 'Failed — tap to retry',
    statusSaved: 'Saved',
    checkerTitle: 'Check a Message',
    checkerPlaceholder: 'Paste or type a suspicious message here…',
    checkerButton: 'Check Message',
    checkerDisclaimer: 'This check runs entirely on your device. No data is sent anywhere.',
    noRedFlagsNote: 'This does not mean the message is safe. Stay alert for new scam patterns.',
    reportScam: 'Report this scam type anonymously',
    reportSent: 'Report sent — thank you!',
    dashTitle: 'Sponsor Dashboard',
    dashDemo: 'Demo data — not real reports',
    dashSynced: 'Forms synced',
    dashScamReports: 'Scam reports by type',
    dashRegion: 'Activity by region',
    dashMinCount: 'Regions shown only when count ≥ 5',
    langLabel: 'Language',
  }
};

let currentLang = 'en';
function t(key) {
  return (STRINGS[currentLang] && STRINGS[currentLang][key]) || STRINGS.en[key] || key;
}

// ─── App state ────────────────────────────────────────────────────────
let activeTab = 'form';         // 'form' | 'checker' | 'dashboard'
let isOnline = navigator.onLine;
let outboxItems = [];
let checkerResult = null;
let checkerInput = '';
let reportSent = false;
let scamReports = [];
let draftSaveTimeout = null;
let lastSubmission = null;

// ─── HTML sanitiser ───────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Render ───────────────────────────────────────────────────────────
const appEl = document.getElementById('app');

async function render() {
  outboxItems = await getOutboxItems();
  scamReports = await getScamReports();

  appEl.innerHTML = `
    <div class="sf-app">
      <!-- Top bar with online indicator and language switch -->
      <header class="sf-header" role="banner">
        <div class="sf-header-left">
          <h1 class="sf-logo">${t('appName')}</h1>
          <span class="sf-status-dot ${isOnline ? 'online' : 'offline'}" 
                role="status" aria-label="${isOnline ? t('online') : t('offline')}">
            <span class="sf-status-pulse"></span>
          </span>
          <span class="sf-status-label">${isOnline ? t('online') : t('offline')}</span>
        </div>
        <div class="sf-header-right">
          <label class="sf-lang-switch" for="lang-select">
            <span class="sf-lang-icon">🌐</span>
            <select id="lang-select" class="sf-lang-select">
              <option value="en" ${currentLang === 'en' ? 'selected' : ''}>English</option>
              <!-- More languages can be added here -->
            </select>
          </label>
        </div>
      </header>

      <!-- Tab navigation -->
      <nav class="sf-tabs" role="tablist">
        <button class="sf-tab ${activeTab === 'form' ? 'active' : ''}" 
                data-tab="form" role="tab" aria-selected="${activeTab === 'form'}" id="tab-form">
          📝 ${t('tabForm')}
        </button>
        <button class="sf-tab ${activeTab === 'checker' ? 'active' : ''}" 
                data-tab="checker" role="tab" aria-selected="${activeTab === 'checker'}" id="tab-checker">
          🔍 ${t('tabChecker')}
        </button>
        <button class="sf-tab ${activeTab === 'dashboard' ? 'active' : ''}" 
                data-tab="dashboard" role="tab" aria-selected="${activeTab === 'dashboard'}" id="tab-dashboard">
          📊 ${t('tabDashboard')}
        </button>
      </nav>

      <!-- Tab content -->
      <main class="sf-content" role="main">
        ${activeTab === 'form' ? renderFormTab() : ''}
        ${activeTab === 'checker' ? renderCheckerTab() : ''}
        ${activeTab === 'dashboard' ? renderDashboardTab() : ''}
      </main>
    </div>
  `;

  attachListeners();
}

// ─── Form Tab ─────────────────────────────────────────────────────────
function renderFormTab() {
  const pendingCount = outboxItems.filter(i => i.status === 'pending').length;
  const failedCount = outboxItems.filter(i => i.status === 'failed').length;

  // Sync state of lastSubmission if item updated in outboxItems
  if (lastSubmission) {
    const match = outboxItems.find(i => i.id === lastSubmission.id);
    if (match && match.status !== lastSubmission.status) {
      lastSubmission.status = match.status;
    }
  }

  return `
    <section class="sf-section" aria-labelledby="form-heading">
      <h2 id="form-heading" class="sf-section-title">${t('formTitle')}</h2>
      
      ${lastSubmission ? `
        <div class="sf-status-window sf-status-window-${lastSubmission.status}" role="alert">
          <div class="sf-status-window-header">
            <span class="sf-status-window-icon">${lastSubmission.status === 'pending' ? '⏳' : '✅'}</span>
            <div class="sf-status-window-titles">
              <strong class="sf-status-window-title">
                ${lastSubmission.status === 'pending' 
                  ? 'Form Saved Offline — Status: Pending' 
                  : 'Form Submitted & Sent — Status: Sent'}
              </strong>
              <span class="sf-status-window-subtitle">
                ${lastSubmission.status === 'pending'
                  ? 'No internet connection. Saved safely on this phone and will auto-sync when internet returns.'
                  : 'Your complaint has been successfully uploaded to the server.'}
              </span>
            </div>
            <button class="sf-status-window-close" id="close-status-window" type="button" title="Dismiss notification">✕</button>
          </div>
          <div class="sf-status-window-body">
            <span class="sf-badge ${lastSubmission.status === 'pending' ? 'sf-badge-pending' : 'sf-badge-sent'}">
              ${lastSubmission.status === 'pending' ? '⏳ Pending Sync' : '✅ Sent'}
            </span>
            <span class="sf-status-window-preview">${esc(lastSubmission.complaint.substring(0, 70))}${lastSubmission.complaint.length > 70 ? '…' : ''}</span>
          </div>
        </div>
      ` : ''}
      
      <form id="complaint-form" class="sf-form" novalidate>
        <div class="sf-field">
          <label for="field-name" class="sf-label">${t('formName')}</label>
          <input type="text" id="field-name" class="sf-input" autocomplete="name"
                 placeholder="${t('formName')}" maxlength="100" />
        </div>

        <div class="sf-field">
          <label for="field-phone" class="sf-label">${t('formPhone')}</label>
          <input type="tel" id="field-phone" class="sf-input" autocomplete="tel"
                 placeholder="${t('formPhone')}" maxlength="15" />
        </div>

        <div class="sf-field">
          <label for="field-complaint" class="sf-label">${t('formComplaint')} *</label>
          <textarea id="field-complaint" class="sf-textarea" rows="4" required
                    placeholder="${t('formComplaint')}" maxlength="2000"></textarea>
        </div>

        <div class="sf-field">
          <label for="field-region" class="sf-label">${t('formRegion')}</label>
          <input type="text" id="field-region" class="sf-input"
                 placeholder="${t('formRegion')}" maxlength="100" />
        </div>

        <p class="sf-privacy-notice">🔒 ${t('privacyNotice')}</p>

        <div class="sf-form-actions">
          <button type="submit" class="sf-btn sf-btn-primary" id="submit-btn">
            ${t('formSubmit')}
          </button>
          <span class="sf-autosave-hint" id="autosave-hint"></span>
        </div>
      </form>

      <!-- Outbox list -->
      <div class="sf-outbox">
        <h3 class="sf-outbox-title">
          ${t('outboxTitle')}
          ${pendingCount > 0 ? `<span class="sf-badge sf-badge-pending">${pendingCount} pending</span>` : ''}
          ${failedCount > 0 ? `<span class="sf-badge sf-badge-failed">${failedCount} failed</span>` : ''}
        </h3>

        ${outboxItems.length === 0 ? `
          <p class="sf-empty">${t('outboxEmpty')}</p>
        ` : `
          <ul class="sf-outbox-list" role="list">
            ${outboxItems.map(item => `
              <li class="sf-outbox-item sf-outbox-${item.status}" data-outbox-id="${item.id}" role="listitem">
                <div class="sf-outbox-content">
                  <span class="sf-outbox-text">${esc(item.complaint ? item.complaint.substring(0, 80) : '...')}${item.complaint && item.complaint.length > 80 ? '…' : ''}</span>
                  <span class="sf-outbox-meta">
                    ${item.region ? esc(item.region) + ' · ' : ''}
                    ${new Date(item.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                <div class="sf-outbox-actions">
                  <span class="sf-status-badge sf-status-${item.status}">
                    ${item.status === 'pending' ? '⏳ ' + t('statusPending') : ''}
                    ${item.status === 'sent' ? '✅ ' + t('statusSent') : ''}
                    ${item.status === 'failed' ? '❌ ' + t('statusFailed') : ''}
                  </span>
                  ${item.status !== 'sent' ? `
                    <button class="sf-btn-sync-now" data-id="${item.id}" type="button">🔄 Send Now</button>
                  ` : ''}
                </div>
              </li>
            `).join('')}
          </ul>
        `}
      </div>
    </section>
  `;
}

// ─── Scam Checker Tab ─────────────────────────────────────────────────
function renderCheckerTab() {
  let resultHtml = '';

  if (checkerResult) {
    const colors = VERDICT_COLORS[checkerResult.verdict];
    const isClean = checkerResult.score === 0;

    resultHtml = `
      <div class="sf-result" style="background:${colors.bg}; border-color:${colors.border};">
        <div class="sf-result-header">
          <span class="sf-result-verdict" style="color:${colors.text};">
            ${checkerResult.verdict}
          </span>
          <span class="sf-result-score" style="background:${colors.badge};">
            Score: ${checkerResult.score}/100
          </span>
        </div>

        ${checkerResult.matchedRules.length > 0 ? `
          <ul class="sf-result-reasons">
            ${checkerResult.matchedRules.map(r => `
              <li class="sf-reason-item">
                <span class="sf-reason-icon">⚠️</span>
                <span>${esc(r.reason)}</span>
              </li>
            `).join('')}
          </ul>
        ` : ''}

        ${isClean ? `
          <p class="sf-result-note">ℹ️ ${t('noRedFlagsNote')}</p>
        ` : ''}

        ${checkerResult.score >= 30 ? `
          <div class="sf-report-section">
            <p class="sf-report-label">${t('reportScam')}</p>
            <div class="sf-report-row">
              <select id="report-type" class="sf-select">
                <option value="">— Select scam type —</option>
                <option value="OTP/Password theft">OTP / Password theft</option>
                <option value="Investment scam">Investment scam</option>
                <option value="Digital arrest">Digital arrest</option>
                <option value="Prize/Lottery">Prize / Lottery</option>
                <option value="KYC fraud">KYC fraud</option>
                <option value="Job scam">Job scam</option>
                <option value="Delivery scam">Delivery scam</option>
                <option value="Other">Other</option>
              </select>
              <input type="text" id="report-region" class="sf-input sf-input-sm" placeholder="Region / city" maxlength="100" />
              <button class="sf-btn sf-btn-secondary" id="report-btn" type="button">Report</button>
            </div>
            ${reportSent ? `<p class="sf-report-done">✅ ${t('reportSent')}</p>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  return `
    <section class="sf-section" aria-labelledby="checker-heading">
      <h2 id="checker-heading" class="sf-section-title">${t('checkerTitle')}</h2>
      <p class="sf-checker-disclaimer">🔒 ${t('checkerDisclaimer')}</p>

      <div class="sf-checker-form">
        <textarea id="checker-input" class="sf-textarea sf-textarea-lg" rows="5"
                  placeholder="${t('checkerPlaceholder')}" maxlength="5000">${esc(checkerInput)}</textarea>
        <button class="sf-btn sf-btn-primary sf-btn-block" id="check-btn" type="button">
          🔍 ${t('checkerButton')}
        </button>
      </div>

      ${resultHtml}
    </section>
  `;
}

// ─── Dashboard Tab ────────────────────────────────────────────────────
function renderDashboardTab() {
  // --- Count synced forms ---
  const syncedCount = outboxItems.filter(i => i.status === 'sent').length;
  const pendingCount = outboxItems.filter(i => i.status === 'pending').length;
  const totalForms = outboxItems.length;

  // --- Use demo data if no real reports ---
  const useDemoData = scamReports.length === 0;
  const demoReports = [
    { scamType: 'Investment scam', region: 'Mumbai' },
    { scamType: 'Investment scam', region: 'Delhi' },
    { scamType: 'Investment scam', region: 'Mumbai' },
    { scamType: 'Investment scam', region: 'Bangalore' },
    { scamType: 'Investment scam', region: 'Mumbai' },
    { scamType: 'Investment scam', region: 'Mumbai' },
    { scamType: 'Investment scam', region: 'Delhi' },
    { scamType: 'Digital arrest', region: 'Delhi' },
    { scamType: 'Digital arrest', region: 'Delhi' },
    { scamType: 'Digital arrest', region: 'Mumbai' },
    { scamType: 'Digital arrest', region: 'Delhi' },
    { scamType: 'Digital arrest', region: 'Delhi' },
    { scamType: 'OTP/Password theft', region: 'Bangalore' },
    { scamType: 'OTP/Password theft', region: 'Bangalore' },
    { scamType: 'OTP/Password theft', region: 'Bangalore' },
    { scamType: 'OTP/Password theft', region: 'Bangalore' },
    { scamType: 'OTP/Password theft', region: 'Bangalore' },
    { scamType: 'Prize/Lottery', region: 'Chennai' },
    { scamType: 'Prize/Lottery', region: 'Chennai' },
    { scamType: 'Prize/Lottery', region: 'Chennai' },
    { scamType: 'Prize/Lottery', region: 'Chennai' },
    { scamType: 'Prize/Lottery', region: 'Chennai' },
    { scamType: 'KYC fraud', region: 'Hyderabad' },
    { scamType: 'KYC fraud', region: 'Hyderabad' },
    { scamType: 'KYC fraud', region: 'Mumbai' },
    { scamType: 'Job scam', region: 'Delhi' },
    { scamType: 'Job scam', region: 'Delhi' },
  ];

  const reports = useDemoData ? demoReports : scamReports;

  // --- Scam reports by type ---
  const typeCounts = {};
  reports.forEach(r => {
    typeCounts[r.scamType] = (typeCounts[r.scamType] || 0) + 1;
  });
  const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  // --- Activity by region (k-anonymity: show only if count >= 5) ---
  const regionCounts = {};
  reports.forEach(r => {
    regionCounts[r.region] = (regionCounts[r.region] || 0) + 1;
  });
  const visibleRegions = Object.entries(regionCounts)
    .filter(([, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1]);

  // Find max values for bar widths
  const maxType = sortedTypes.length > 0 ? sortedTypes[0][1] : 1;
  const maxRegion = visibleRegions.length > 0 ? visibleRegions[0][1] : 1;

  return `
    <section class="sf-section" aria-labelledby="dash-heading">
      <h2 id="dash-heading" class="sf-section-title">${t('dashTitle')}</h2>

      ${useDemoData ? `
        <div class="sf-demo-banner">📋 ${t('dashDemo')}</div>
      ` : ''}

      <!-- Dashboard summary cards -->
      <div class="sf-dash-cards">
        <div class="sf-dash-card">
          <span class="sf-dash-card-value">${totalForms}</span>
          <span class="sf-dash-card-label">Forms Filled</span>
          <span class="sf-dash-card-sub">${syncedCount} sent · ${pendingCount} pending</span>
        </div>
        <div class="sf-dash-card">
          <span class="sf-dash-card-value">${syncedCount}</span>
          <span class="sf-dash-card-label">${t('dashSynced')}</span>
          <span class="sf-dash-card-sub">Synced to server</span>
        </div>
        <div class="sf-dash-card">
          <span class="sf-dash-card-value">${reports.length}</span>
          <span class="sf-dash-card-label">${t('dashScamReports')}</span>
          <span class="sf-dash-card-sub">${sortedTypes.length} types logged</span>
        </div>
      </div>

      <!-- Scam reports by type -->
      <div class="sf-dash-section">
        <h3 class="sf-dash-subtitle">${t('dashScamReports')}</h3>
        ${sortedTypes.length === 0 ? '<p class="sf-empty">No reports yet.</p>' : `
          <div class="sf-bar-chart">
            ${sortedTypes.map(([type, count]) => `
              <div class="sf-bar-row">
                <span class="sf-bar-label">${esc(type)}</span>
                <div class="sf-bar-track">
                  <div class="sf-bar-fill" style="width: ${Math.round((count / maxType) * 100)}%"></div>
                </div>
                <span class="sf-bar-value">${count}</span>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- Activity by region -->
      <div class="sf-dash-section">
        <h3 class="sf-dash-subtitle">${t('dashRegion')}</h3>
        <p class="sf-dash-note">${t('dashMinCount')}</p>
        ${visibleRegions.length === 0 ? '<p class="sf-empty">Not enough data to show regions.</p>' : `
          <div class="sf-bar-chart">
            ${visibleRegions.map(([region, count]) => `
              <div class="sf-bar-row">
                <span class="sf-bar-label">${esc(region)}</span>
                <div class="sf-bar-track">
                  <div class="sf-bar-fill sf-bar-fill-teal" style="width: ${Math.round((count / maxRegion) * 100)}%"></div>
                </div>
                <span class="sf-bar-value">${count}</span>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </section>
  `;
}

// ─── Event listeners ──────────────────────────────────────────────────
function attachListeners() {
  // Tab switching
  document.querySelectorAll('.sf-tab').forEach(btn => {
    btn.onclick = () => {
      activeTab = btn.dataset.tab;
      checkerResult = null;
      reportSent = false;
      render();
    };
  });

  // Language switch
  const langSelect = document.getElementById('lang-select');
  if (langSelect) {
    langSelect.onchange = (e) => {
      currentLang = e.target.value;
      render();
    };
  }

  // ── Form tab listeners ──
  if (activeTab === 'form') {
    const form = document.getElementById('complaint-form');
    const fields = ['field-name', 'field-phone', 'field-complaint', 'field-region'];

    // Load draft into fields
    loadDraft().then(draft => {
      const nameEl = document.getElementById('field-name');
      const phoneEl = document.getElementById('field-phone');
      const complaintEl = document.getElementById('field-complaint');
      const regionEl = document.getElementById('field-region');

      if (nameEl && !nameEl.value) nameEl.value = draft.name || '';
      if (phoneEl && !phoneEl.value) phoneEl.value = draft.phone || '';
      if (complaintEl && !complaintEl.value) complaintEl.value = draft.complaint || '';
      if (regionEl && !regionEl.value) regionEl.value = draft.region || '';
    });

    // Auto-save on every input change
    fields.forEach(fieldId => {
      const el = document.getElementById(fieldId);
      if (el) {
        el.addEventListener('input', () => {
          // Debounce saves to avoid excessive writes
          clearTimeout(draftSaveTimeout);
          draftSaveTimeout = setTimeout(() => {
            const data = {
              name: document.getElementById('field-name')?.value || '',
              phone: document.getElementById('field-phone')?.value || '',
              complaint: document.getElementById('field-complaint')?.value || '',
              region: document.getElementById('field-region')?.value || ''
            };
            saveDraft(data);

            // Show autosave hint
            const hint = document.getElementById('autosave-hint');
            if (hint) {
              hint.textContent = '✓ ' + t('formSaved');
              hint.classList.add('visible');
              setTimeout(() => hint.classList.remove('visible'), 2000);
            }
          }, 300);
        });
      }
    });

    // Close status notification window
    const closeBtn = document.getElementById('close-status-window');
    if (closeBtn) {
      closeBtn.onclick = () => {
        lastSubmission = null;
        render();
      };
    }

    // Submit form
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const complaintEl = document.getElementById('field-complaint');
        const complaint = complaintEl?.value?.trim();

        if (!complaint) {
          if (complaintEl) {
            complaintEl.classList.add('sf-input-error');
            complaintEl.focus();
          }
          return;
        }

        // Cancel any pending draft autosave
        clearTimeout(draftSaveTimeout);

        const data = {
          name: document.getElementById('field-name')?.value?.trim() || '',
          phone: document.getElementById('field-phone')?.value?.trim() || '',
          complaint,
          region: document.getElementById('field-region')?.value?.trim() || ''
        };

        // 1. Save to IndexedDB outbox & clear draft
        const record = await submitToOutbox(data);

        // 2. Clear input values in DOM immediately
        const nameEl = document.getElementById('field-name');
        const phoneEl = document.getElementById('field-phone');
        const regionEl = document.getElementById('field-region');
        if (nameEl) nameEl.value = '';
        if (phoneEl) phoneEl.value = '';
        if (complaintEl) {
          complaintEl.value = '';
          complaintEl.classList.remove('sf-input-error');
        }
        if (regionEl) regionEl.value = '';

        // 3. Instantly set state to Pending & render UI immediately
        lastSubmission = {
          id: record.id,
          status: 'pending',
          complaint: data.complaint,
          region: data.region,
          createdAt: new Date()
        };

        // Render immediately so user instantly sees "Pending" status card & outbox item
        await render();

        // Scroll to status alert smoothly
        setTimeout(() => {
          const alertEl = document.querySelector('.sf-status-window');
          if (alertEl) alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);

        // 4. Trigger background sync without blocking UI rendering
        if (navigator.onLine) {
          syncOutbox().then(syncRes => {
            if (syncRes && syncRes.successCount > 0) {
              render();
            }
          });
        } else {
          requestSync();
        }
      };
    }

    // Manual sync for pending or failed items
    document.querySelectorAll('.sf-btn-sync-now').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        btn.textContent = '⏳ Sending…';
        btn.disabled = true;
        await syncItemNow(id);
        render();
      };
    });

    document.querySelectorAll('.sf-outbox-item:not(.sf-outbox-sent)').forEach(item => {
      item.onclick = async () => {
        const id = Number(item.dataset.outboxId);
        if (id) {
          await syncItemNow(id);
          render();
        }
      };
    });
  }

  // ── Scam checker tab listeners ──
  if (activeTab === 'checker') {
    const checkBtn = document.getElementById('check-btn');
    const checkerTextarea = document.getElementById('checker-input');

    if (checkBtn) {
      checkBtn.onclick = () => {
        const text = checkerTextarea?.value || '';
        checkerInput = text;
        if (text.trim()) {
          checkerResult = checkMessage(text);
        } else {
          checkerResult = null;
        }
        reportSent = false;
        render();

        // Re-focus the result area
        setTimeout(() => {
          const resultEl = document.querySelector('.sf-result');
          if (resultEl) resultEl.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      };
    }

    // Report button
    const reportBtn = document.getElementById('report-btn');
    if (reportBtn) {
      reportBtn.onclick = async () => {
        const scamType = document.getElementById('report-type')?.value;
        const region = document.getElementById('report-region')?.value?.trim();
        if (scamType) {
          await saveScamReport(scamType, region || 'Unknown');
          reportSent = true;
          render();
        }
      };
    }
  }
}

// ─── Online/Offline tracking & Automatic Sync ──────────────────────────
window.addEventListener('online', async () => {
  isOnline = true;
  await syncOutbox();
  render();
});

window.addEventListener('offline', () => {
  isOnline = false;
  render();
});

// Periodic sync poll for reliable offline -> online transition
setInterval(async () => {
  if (navigator.onLine) {
    const hasPending = outboxItems.some(i => i.status === 'pending' || i.status === 'failed');
    if (hasPending) {
      await syncOutbox();
      render();
    }
  }
}, 4000);

// ─── Initialise ───────────────────────────────────────────────────────
initSyncService((status) => {
  // Re-render when sync state changes to update badges
  if (status.status === 'completed' || status.status === 'error' || status.status === 'online') {
    render();
  }
});

render();
