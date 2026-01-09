const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const { initializeDatabase, registrations, settings, DEFAULTS } = require('./database');

// Create Express app
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('trust proxy', true);

// Initialize database
initializeDatabase();

// Get base URL for QR code
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
// Export CSV with Malaysia timezone
app.get('/api/admin/export/csv', (req, res) => {
  try {
    const data = registrations.getAll();
    const eventName = settings.get('event_name') || 'event';
    const date = new Date().toISOString().split('T')[0];
    const filename = `${eventName.replace(/[^a-z0-9]/gi, '_')}_${date}.csv`;
    
    // Function to format time in Malaysia timezone
    const formatMYTime = (dateStr) => {
      if (!dateStr) return '';
      return new Date(dateStr).toLocaleString('en-MY', {
        timeZone: 'Asia/Kuala_Lumpur',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    };
    
    const headers = ['ID', 'Timestamp', 'Name', 'Phone', 'Programme', 'Status', 'Remark', 'Time In'];
    const rows = [headers.join(',')];
    
    data.forEach(r => {
      rows.push([
        r.id,
        `"${formatMYTime(r.timestamp)}"`,
        `"${r.student_name}"`,
        `"${r.phone_number}"`,
        `"${r.programme}"`,
        r.status,
        `"${r.remark || ''}"`,
        `"${formatMYTime(r.time_in)}"`
      ].join(','));
    });
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv');
    res.send(rows.join('\n'));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create registration
app.post('/api/registrations', (req, res) => {
  try {
    const { student_name, phone_number, programme } = req.body;
    
    if (!student_name || !phone_number || !programme) {
      return res.status(400).json({ success: false, error: 'All fields required' });
    }
    
    const newReg = registrations.create({ student_name, phone_number, programme });
    io.emit('new-registration', newReg);
    res.json({ success: true, data: newReg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update status
app.patch('/api/registrations/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const validStatuses = DEFAULTS.statuses.map(s => s.value);
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    
    const updated = registrations.updateStatus(id, status);
    io.emit('registration-updated', updated);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update remark
app.patch('/api/registrations/:id/remark', (req, res) => {
  try {
    const { id } = req.params;
    const { remark } = req.body;
    
    const updated = registrations.updateRemark(id, remark);
    io.emit('registration-updated', updated);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete registration
app.delete('/api/registrations/:id', (req, res) => {
  try {
    registrations.delete(req.params.id);
    io.emit('registration-deleted', { id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get stats
app.get('/api/stats', (req, res) => {
  try {
    const inside = registrations.getInsideCount();
    const max = parseInt(settings.get('max_capacity')) || DEFAULTS.maxCapacity;
    res.json({
      success: true,
      data: { insideCount: inside, maxCapacity: max, availableSlots: Math.max(0, max - inside) }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get settings
app.get('/api/settings', (req, res) => {
  try {
    res.json({ success: true, data: settings.getAll() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update settings
app.post('/api/settings', (req, res) => {
  try {
    const { key, value } = req.body;
    settings.set(key, value);
    io.emit('settings-updated', { key, value });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Clear all registrations
app.post('/api/admin/clear', (req, res) => {
  try {
    registrations.clearAll();
    io.emit('registrations-cleared');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export CSV
app.get('/api/admin/export/csv', (req, res) => {
  try {
    const data = registrations.getAll();
    const eventName = settings.get('event_name') || 'event';
    const date = new Date().toISOString().split('T')[0];
    const filename = `${eventName.replace(/[^a-z0-9]/gi, '_')}_${date}.csv`;
    
    const headers = ['ID', 'Timestamp', 'Name', 'Phone', 'Programme', 'Status', 'Remark', 'Time In'];
    const rows = [headers.join(',')];
    
    data.forEach(r => {
      rows.push([
        r.id,
        `"${r.timestamp}"`,
        `"${r.student_name}"`,
        `"${r.phone_number}"`,
        `"${r.programme}"`,
        r.status,
        `"${r.remark || ''}"`,
        `"${r.time_in || ''}"`
      ].join(','));
    });
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv');
    res.send(rows.join('\n'));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export JSON
app.get('/api/admin/export/json', (req, res) => {
  try {
    res.json(registrations.getAll());
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generate QR code
app.get('/api/qrcode', async (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    const regUrl = `${baseUrl}/register.html`;
    
    const qrCode = await QRCode.toDataURL(regUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000', light: '#fff' }
    });
    
    res.json({ success: true, data: { qrCode, url: regUrl } });
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
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   🎉 Event Registration System is LIVE!           ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log(`║   Port: ${PORT}                                       ║`);
  console.log('║   Dashboard:    /                                 ║');
  console.log('║   Registration: /register.html                    ║');
  console.log('║   Admin Panel:  /admin.html                       ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');

});
