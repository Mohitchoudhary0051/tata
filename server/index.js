import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const COMPLAINTS_FILE = path.join(DATA_DIR, 'complaints.json');
const SCAMS_FILE = path.join(DATA_DIR, 'scams.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error(`[Data Load Error] ${filePath}:`, err.message);
  }
  return defaultValue;
}

function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`[Data Save Error] ${filePath}:`, err.message);
  }
}

// Memory cache synced with disk
let complaints = loadJson(COMPLAINTS_FILE, []);
let scamReports = loadJson(SCAMS_FILE, []);
const processedFormIds = new Set(complaints.map(c => c.formId).filter(Boolean));

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

// ─── 1. Developer Dashboard & Status ──────────────────────────────────
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>SafeForm Backend API</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; margin: 0; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { color: #14b8a6; margin-bottom: 0.5rem; }
        .badge { background: #059669; padding: 4px 10px; border-radius: 9999px; font-weight: bold; font-size: 0.85rem; }
        .card { background: #1e293b; border-radius: 12px; padding: 1.5rem; margin-top: 1.5rem; border: 1px solid #334155; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem; }
        .stat-val { font-size: 2rem; font-weight: bold; color: #38bdf8; }
        .stat-lbl { color: #94a3b8; font-size: 0.9rem; }
        code { background: #020617; padding: 2px 6px; border-radius: 4px; color: #f43f5e; font-family: monospace; }
        ul { line-height: 1.8; }
        a { color: #38bdf8; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>SafeForm Backend API <span class="badge">Running</span></h1>
        <p>Offline-First Complaint & Scam Analytics API Server</p>

        <div class="grid">
          <div class="card">
            <div class="stat-val">${complaints.length}</div>
            <div class="stat-lbl">Registered Complaints</div>
          </div>
          <div class="card">
            <div class="stat-val">${scamReports.length}</div>
            <div class="stat-lbl">Scam Reports</div>
          </div>
          <div class="card">
            <div class="stat-val">${processedFormIds.size}</div>
            <div class="stat-lbl">Unique Form IDs</div>
          </div>
        </div>

        <div class="card">
          <h3>Available API Endpoints</h3>
          <ul>
            <li><code>POST /api/complaints</code> — Submit single complaint (auto-deduplicated)</li>
            <li><code>POST /api/complaints/batch</code> — Bulk sync multiple outbox complaints</li>
            <li><code>GET  /api/complaints</code> — List all complaints (<a href="/api/complaints" target="_blank">View JSON</a>)</li>
            <li><code>POST /api/scams</code> — Log anonymous scam report</li>
            <li><code>GET  /api/scams</code> — List all scam reports (<a href="/api/scams" target="_blank">View JSON</a>)</li>
            <li><code>GET  /api/scams/analytics</code> — Aggregated scam stats (<a href="/api/scams/analytics" target="_blank">View Analytics</a>)</li>
            <li><code>GET  /api/export/csv</code> — Download complaints export (<a href="/api/export/csv">Download CSV</a>)</li>
            <li><code>GET  /api/health</code> — System health check</li>
          </ul>
        </div>
      </div>
    </body>
    </html>
  `);
});

// ─── 2. System Health ──────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    totalComplaints: complaints.length,
    totalScamReports: scamReports.length,
    timestamp: new Date().toISOString()
  });
});

// ─── 3. Submit Complaint (Single) ──────────────────────────────────────
app.post(['/api/complaints', '/posts'], (req, res) => {
  const { formId, complaint, region, submittedAt } = req.body;

  if (!complaint || typeof complaint !== 'string' || !complaint.trim()) {
    return res.status(400).json({ success: false, error: 'Complaint description is required' });
  }

  // Deduplication check using formId
  if (formId && processedFormIds.has(formId)) {
    console.log(`[Deduplicate] Skipping duplicate formId: ${formId}`);
    return res.json({
      success: true,
      deduplicated: true,
      message: 'Complaint already recorded',
      formId
    });
  }

  const record = {
    id: complaints.length + 1,
    formId: formId || `srv-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    complaint: complaint.trim(),
    region: (region || 'Unknown').trim(),
    submittedAt: submittedAt || new Date().toISOString(),
    receivedAt: new Date().toISOString()
  };

  complaints.unshift(record);
  if (record.formId) processedFormIds.add(record.formId);
  saveJson(COMPLAINTS_FILE, complaints);

  console.log(`[Complaint Recorded] #${record.id} in ${record.region}`);
  return res.status(201).json({
    success: true,
    message: 'Complaint submitted successfully',
    id: record.id,
    formId: record.formId
  });
});

// ─── 4. Submit Complaints (Batch Bulk Sync) ────────────────────────────
app.post('/api/complaints/batch', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, error: 'Expected "items" array' });
  }

  let processedCount = 0;
  let skippedCount = 0;

  for (const item of items) {
    if (!item.complaint || !item.complaint.trim()) continue;

    if (item.formId && processedFormIds.has(item.formId)) {
      skippedCount++;
      continue;
    }

    const record = {
      id: complaints.length + 1,
      formId: item.formId || `srv-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      complaint: item.complaint.trim(),
      region: (item.region || 'Unknown').trim(),
      submittedAt: item.submittedAt || item.createdAt || new Date().toISOString(),
      receivedAt: new Date().toISOString()
    };

    complaints.unshift(record);
    if (record.formId) processedFormIds.add(record.formId);
    processedCount++;
  }

  saveJson(COMPLAINTS_FILE, complaints);

  return res.json({
    success: true,
    processedCount,
    skippedCount,
    totalComplaints: complaints.length
  });
});

// ─── 5. Get Complaints List ────────────────────────────────────────────
app.get('/api/complaints', (req, res) => {
  const { region, limit = 100 } = req.query;
  let results = complaints;

  if (region) {
    results = results.filter(c => c.region.toLowerCase() === String(region).toLowerCase());
  }

  res.json({
    success: true,
    count: results.length,
    complaints: results.slice(0, Number(limit))
  });
});

// ─── 6. Anonymous Scam Reports ─────────────────────────────────────────
app.post('/api/scams', (req, res) => {
  const { scamType, region, createdAt } = req.body;

  if (!scamType) {
    return res.status(400).json({ success: false, error: 'Scam type is required' });
  }

  const report = {
    id: scamReports.length + 1,
    scamType: String(scamType).trim(),
    region: (region || 'Unknown').trim(),
    createdAt: createdAt || new Date().toISOString()
  };

  scamReports.unshift(report);
  saveJson(SCAMS_FILE, scamReports);

  console.log(`[Scam Logged] ${report.scamType} in ${report.region}`);
  return res.status(201).json({
    success: true,
    message: 'Scam report registered',
    id: report.id
  });
});

// ─── 7. Get Scam Reports & Aggregated Analytics ───────────────────────
app.get('/api/scams', (req, res) => {
  res.json({
    success: true,
    count: scamReports.length,
    scams: scamReports
  });
});

app.get('/api/scams/analytics', (req, res) => {
  const typeCounts = {};
  const regionCounts = {};

  scamReports.forEach(r => {
    typeCounts[r.scamType] = (typeCounts[r.scamType] || 0) + 1;
    regionCounts[r.region] = (regionCounts[r.region] || 0) + 1;
  });

  // Filter regions with count >= 5 (k-anonymity)
  const safeRegions = Object.fromEntries(
    Object.entries(regionCounts).filter(([, count]) => count >= 5)
  );

  res.json({
    success: true,
    totalReports: scamReports.length,
    byType: typeCounts,
    byRegionFiltered: safeRegions
  });
});

// ─── 8. Export CSV Endpoint ───────────────────────────────────────────
app.get('/api/export/csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="complaints_export.csv"');

  let csv = 'ID,FormID,Region,Complaint,SubmittedAt,ReceivedAt\n';
  complaints.forEach(c => {
    const escapedText = `"${c.complaint.replace(/"/g, '""')}"`;
    csv += `${c.id},"${c.formId}","${c.region}",${escapedText},"${c.submittedAt}","${c.receivedAt}"\n`;
  });

  res.send(csv);
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Express Backend Server active on http://localhost:${PORT}`);
  console.log(`📊 Developer Dashboard: http://localhost:${PORT}/`);
  console.log(`======================================================\n`);
});
