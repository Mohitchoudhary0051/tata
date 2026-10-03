import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const COMPLAINTS_FILE = path.join(DATA_DIR, 'complaints.json');
const SCAMS_FILE = path.join(DATA_DIR, 'scams.json');

// Ensure data directory and files exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
  }
  return defaultValue;
}

function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing to ${filePath}:`, err.message);
  }
}

// In-memory data initialized from disk
let complaints = loadJson(COMPLAINTS_FILE, []);
let scams = loadJson(SCAMS_FILE, []);
const processedFormIds = new Set(complaints.map(c => c.formId).filter(Boolean));

const PORT = process.env.PORT || 3001;

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1e6) { // 1MB limit
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  console.log(`[Backend Server] ${req.method} ${pathname}`);

  try {
    // 1. Health check
    if (req.method === 'GET' && pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        totalComplaints: complaints.length,
        totalScamReports: scams.length
      }));
      return;
    }

    // 2. Submit Complaint Endpoint (POST /api/complaints)
    if (req.method === 'POST' && (pathname === '/api/complaints' || pathname === '/posts')) {
      const payload = await parseJsonBody(req);
      const { formId, complaint, region, submittedAt } = payload;

      if (!complaint || typeof complaint !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Complaint text is required' }));
        return;
      }

      // Deduplication check using formId
      if (formId && processedFormIds.has(formId)) {
        console.log(`[Backend] Deduplicated duplicate submission for formId: ${formId}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          deduplicated: true,
          message: 'Complaint already processed',
          formId
        }));
        return;
      }

      const record = {
        id: complaints.length + 1,
        formId: formId || `srv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        complaint: complaint.trim(),
        region: (region || 'Unknown').trim(),
        submittedAt: submittedAt || new Date().toISOString(),
        receivedAt: new Date().toISOString()
      };

      complaints.unshift(record);
      if (record.formId) processedFormIds.add(record.formId);
      saveJson(COMPLAINTS_FILE, complaints);

      console.log(`[Backend] Saved complaint #${record.id} (Region: ${record.region})`);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Complaint submitted successfully',
        id: record.id,
        formId: record.formId
      }));
      return;
    }

    // 3. Get Complaints List (GET /api/complaints)
    if (req.method === 'GET' && pathname === '/api/complaints') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        count: complaints.length,
        complaints
      }));
      return;
    }

    // 4. Submit Anonymous Scam Report (POST /api/scams)
    if (req.method === 'POST' && pathname === '/api/scams') {
      const payload = await parseJsonBody(req);
      const { scamType, region, createdAt } = payload;

      if (!scamType) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Scam type is required' }));
        return;
      }

      const report = {
        id: scams.length + 1,
        scamType,
        region: region || 'Unknown',
        createdAt: createdAt || new Date().toISOString()
      };

      scams.unshift(report);
      saveJson(SCAMS_FILE, scams);

      console.log(`[Backend] Saved scam report #${report.id} (${report.scamType} in ${report.region})`);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Scam report logged', id: report.id }));
      return;
    }

    // 5. Get Scam Reports List (GET /api/scams)
    if (req.method === 'GET' && pathname === '/api/scams') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        count: scams.length,
        scams
      }));
      return;
    }

    // 404 Not Found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Endpoint not found' }));

  } catch (err) {
    console.error('[Backend Error]', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`SafeForm Backend API Server running on port ${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  - POST http://localhost:${PORT}/api/complaints`);
  console.log(`  - GET  http://localhost:${PORT}/api/complaints`);
  console.log(`  - POST http://localhost:${PORT}/api/scams`);
  console.log(`  - GET  http://localhost:${PORT}/api/scams`);
  console.log(`  - GET  http://localhost:${PORT}/api/health`);
  console.log(`======================================================\n`);
});
