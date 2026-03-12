const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;

// ⚠️ REPLACE WITH YOUR GOOGLE APPS SCRIPT URL!
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyZ-gT1ZZUPqYOdmZ9YZW0boDZSuAsAnZbDF28Z6tBMl2xXAwkkO-ya1_fzyEZqx0QK/exec';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('trust proxy', true);

// =====================
// REQUEST QUEUE SYSTEM
// =====================

class RequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.lastRequestTime = {};
  }
  
  async add(key, requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ key, requestFn, resolve, reject });
      this.process();
    });
  }
  
  async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const { key, requestFn, resolve, reject } = this.queue.shift();
    
    try {
      // Add small delay between requests to same record
      const lastTime = this.lastRequestTime[key] || 0;
      const timeSince = Date.now() - lastTime;
      if (timeSince < 500) {
        await new Promise(r => setTimeout(r, 500 - timeSince));
      }
      
      const result = await requestFn();
      this.lastRequestTime[key] = Date.now();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.processing = false;
      // Process next item
      setTimeout(() => this.process(), 100);
    }
  }
}

const requestQueue = new RequestQueue();

// =====================
// GOOGLE SCRIPT HELPER
// =====================

async function callGoogleScript(params, retries = 3) {
  const url = new URL(GOOGLE_SCRIPT_URL);
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null) {
      url.searchParams.append(key, params[key]);
    }
  });
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(url.toString(), {
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      const result = await response.json();
      
      if (result.success || result.data) {
        return result;
      }
      
      // If error, retry
      if (attempt < retries) {
        console.log(`Retry attempt ${attempt + 1} for:`, params.action);
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }
  }
  
  return { success: false, error: 'Failed after retries' };
}

// Get base URL for QR
function getBaseUrl(req) {
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL;
  }
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${protocol}://${host}`;
}

// =====================
// API ROUTES
// =====================

// Get all registrations
app.get('/api/registrations', async (req, res) => {
  const category = req.query.category;
  const result = await callGoogleScript({ action: 'getAll', category });
  res.json(result);
});

// Create registration
app.post('/api/registrations', async (req, res) => {
  const { student_name, phone_number, programme, category } = req.body;
  
  if (!student_name || !phone_number || !programme) {
    return res.status(400).json({ success: false, error: 'All fields required' });
  }
  
  const result = await requestQueue.add('create', () => 
    callGoogleScript({
      action: 'add',
      student_name,
      phone_number,
      programme,
      category: category || 'science'
    })
  );
  
  if (result.success && result.data) {
    io.emit('new-registration', result.data);
  }
  
  res.json(result);
});

// Update status
app.patch('/api/registrations/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  const result = await requestQueue.add(`status_${id}`, () =>
    callGoogleScript({
      action: 'updateStatus',
      id,
      status
    })
  );
  
  if (result.success && result.data) {
    io.emit('registration-updated', result.data);
  }
  
  res.json(result);
});

// Update remark - WITH CONFLICT DETECTION
app.patch('/api/registrations/:id/remark', async (req, res) => {
  const { id } = req.params;
  const { remark, expectedVersion, appendMode } = req.body;
  
  const result = await requestQueue.add(`remark_${id}`, () =>
    callGoogleScript({
      action: 'updateRemark',
      id,
      remark: remark || '',
      expectedVersion: expectedVersion || '',
      appendMode: appendMode ? 'true' : 'false'
    })
  );
  
  if (result.success && result.data) {
    io.emit('registration-updated', result.data);
  }
  
  res.json(result);
});

// Delete registration
app.delete('/api/registrations/:id', async (req, res) => {
  const { id } = req.params;
  
  const result = await requestQueue.add(`delete_${id}`, () =>
    callGoogleScript({
      action: 'delete',
      id
    })
  );
  
  if (result.success) {
    io.emit('registration-deleted', { id });
  }
  
  res.json(result);
});

// Get settings
app.get('/api/settings', async (req, res) => {
  const result = await callGoogleScript({ action: 'getSettings' });
  res.json(result);
});

// Update settings
app.post('/api/settings', async (req, res) => {
  const { key, value } = req.body;
  
  const result = await requestQueue.add('settings', () =>
    callGoogleScript({
      action: 'saveSettings',
      key,
      value: typeof value === 'object' ? JSON.stringify(value) : value
    })
  );
  
  if (result.success) {
    io.emit('settings-updated', { key, value });
  }
  
  res.json(result);
});

// Clear registrations
app.post('/api/admin/clear', async (req, res) => {
  const { category } = req.body;
  
  const result = await requestQueue.add('clear', () =>
    callGoogleScript({ 
      action: 'clear',
      category 
    })
  );
  
  if (result.success) {
    io.emit('registrations-cleared', { category });
  }
  
  res.json(result);
});

// Export CSV
app.get('/api/admin/export/csv', async (req, res) => {
  const category = req.query.category;
  const result = await callGoogleScript({ action: 'getAll', category });
  
  if (!result.success) {
    return res.status(500).json(result);
  }
  
  const data = result.data;
  const settingsResult = await callGoogleScript({ action: 'getSettings' });
  
  let eventName = 'event';
  if (category === 'science') {
    eventName = settingsResult.data?.event_name_science || 'Science';
  } else if (category === 'business') {
    eventName = settingsResult.data?.event_name_business || 'Business';
  }
  
  const date = new Date().toISOString().split('T')[0];
  const filename = `${eventName.replace(/[^a-z0-9]/gi, '_')}_${date}.csv`;
  
  const headers = ['#', 'Timestamp', 'Name', 'Phone', 'Programme', 'Category', 'Status', 'Remark', 'Time In'];
  const rows = [headers.join(',')];
  
  data.forEach((r, i) => {
    rows.push([
      i + 1,
      `"${r.timestamp}"`,
      `"${r.student_name}"`,
      `"${r.phone_number}"`,
      `"${r.programme}"`,
      r.category,
      r.status,
      `"${(r.remark || '').replace(/"/g, '""')}"`,
      `"${r.time_in || ''}"`
    ].join(','));
  });
  
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send('\ufeff' + rows.join('\n')); // BOM for Excel compatibility
});

// QR Code
app.get('/api/qrcode', async (req, res) => {
  try {
    const category = req.query.category || 'science';
    const baseUrl = getBaseUrl(req);
    const regUrl = `${baseUrl}/register.html?category=${category}`;
    
    const qrCode = await QRCode.toDataURL(regUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000', light: '#fff' }
    });
    
    res.json({ success: true, data: { qrCode, url: regUrl, category } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Page routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// =====================
// SOCKET.IO
// =====================

io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);
  
  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    socket.emit('heartbeat', { time: Date.now() });
  }, 20000);
  
  socket.on('heartbeat-response', () => {
    // Client is alive
  });
  
  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
    clearInterval(heartbeat);
  });
});

// =====================
// START SERVER
// =====================

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   🎉 Event Registration System v4                         ║');
  console.log('║   With Queue System & Conflict Detection                  ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log(`║   Port: ${PORT}                                              ║`);
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
});

