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
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/library/d/1lC3r5M42OqAXk7SG5sfhS-ECyukXihV_d4pDH81RArCrVBThcxEIrbiw/2';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('trust proxy', true);

// Helper: Call Google Apps Script
async function callGoogleScript(params) {
  const url = new URL(GOOGLE_SCRIPT_URL);
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null) {
      url.searchParams.append(key, params[key]);
    }
  });
  
  try {
    const response = await fetch(url.toString());
    return await response.json();
  } catch (error) {
    console.error('Google Script Error:', error);
    return { success: false, error: error.message };
  }
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

// Get all registrations (with optional category filter)
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
  
  const result = await callGoogleScript({
    action: 'add',
    student_name,
    phone_number,
    programme,
    category: category || 'science'
  });
  
  if (result.success) {
    io.emit('new-registration', result.data);
    io.emit(`new-registration-${category || 'science'}`, result.data);
  }
  
  res.json(result);
});

// Update status
app.patch('/api/registrations/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  const result = await callGoogleScript({
    action: 'updateStatus',
    id,
    status
  });
  
  if (result.success) {
    io.emit('registration-updated', result.data);
  }
  
  res.json(result);
});

// Update remark
app.patch('/api/registrations/:id/remark', async (req, res) => {
  const { id } = req.params;
  const { remark } = req.body;
  
  const result = await callGoogleScript({
    action: 'updateRemark',
    id,
    remark: remark || ''
  });
  
  if (result.success) {
    io.emit('registration-updated', result.data);
  }
  
  res.json(result);
});

// Delete registration
app.delete('/api/registrations/:id', async (req, res) => {
  const { id } = req.params;
  
  const result = await callGoogleScript({
    action: 'delete',
    id
  });
  
  if (result.success) {
    io.emit('registration-deleted', { id: parseInt(id) });
  }
  
  res.json(result);
});

// Get stats
app.get('/api/stats', async (req, res) => {
  const category = req.query.category;
  const regResult = await callGoogleScript({ action: 'getAll', category });
  const settingsResult = await callGoogleScript({ action: 'getSettings' });
  
  if (regResult.success && settingsResult.success) {
    const inside = regResult.data.filter(r => r.status === 'inside').length;
    const max = parseInt(settingsResult.data.max_capacity) || 50;
    
    res.json({
      success: true,
      data: { insideCount: inside, maxCapacity: max, availableSlots: Math.max(0, max - inside) }
    });
  } else {
    res.json({ success: false, error: 'Failed to get stats' });
  }
});

// Get settings
app.get('/api/settings', async (req, res) => {
  const result = await callGoogleScript({ action: 'getSettings' });
  res.json(result);
});

// Update settings
app.post('/api/settings', async (req, res) => {
  const { key, value } = req.body;
  
  const result = await callGoogleScript({
    action: 'saveSettings',
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : value
  });
  
  if (result.success) {
    io.emit('settings-updated', { key, value });
  }
  
  res.json(result);
});

// Clear registrations (with optional category)
app.post('/api/admin/clear', async (req, res) => {
  const { category } = req.body;
  
  const result = await callGoogleScript({ 
    action: 'clear',
    category 
  });
  
  if (result.success) {
    if (category) {
      io.emit(`registrations-cleared-${category}`);
    } else {
      io.emit('registrations-cleared');
    }
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
    eventName = settingsResult.data?.event_name_science || 'Science_Engineering';
  } else if (category === 'business') {
    eventName = settingsResult.data?.event_name_business || 'Business_Art';
  }
  
  const date = new Date().toISOString().split('T')[0];
  const filename = `${eventName.replace(/[^a-z0-9]/gi, '_')}_${date}.csv`;
  
  const headers = ['ID', 'Timestamp', 'Name', 'Phone', 'Programme', 'Category', 'Status', 'Remark', 'Time In'];
  const rows = [headers.join(',')];
  
  data.forEach(r => {
    rows.push([
      r.id,
      `"${r.timestamp}"`,
      `"${r.student_name}"`,
      `"${r.phone_number}"`,
      `"${r.programme}"`,
      r.category,
      r.status,
      `"${r.remark || ''}"`,
      `"${r.time_in || ''}"`
    ].join(','));
  });
  
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'text/csv');
  res.send(rows.join('\n'));
});

// QR Code (with category)
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

// Socket.IO
io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);
  socket.on('disconnect', () => console.log(`❌ Client disconnected: ${socket.id}`));
});

// Start server
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   🎉 Event Registration System (Multi-Category Edition)   ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log(`║   Port: ${PORT}                                              ║`);
  console.log('║                                                           ║');
  console.log('║   SCIENCE/ENGINEERING:                                    ║');
  console.log('║   Dashboard: /?category=science                           ║');
  console.log('║   Register:  /register.html?category=science              ║');
  console.log('║                                                           ║');
  console.log('║   BUSINESS/ART:                                           ║');
  console.log('║   Dashboard: /?category=business                          ║');
  console.log('║   Register:  /register.html?category=business             ║');
  console.log('║                                                           ║');
  console.log('║   Admin: /admin.html                                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
});
