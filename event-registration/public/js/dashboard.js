const socket = io();
let data = [];
let config = {};
let statuses = [];

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadConfig();
  await loadData();
  await loadQR();
  setupSearch();
  setupSocket();
}

// Load settings
async function loadConfig() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (json.success) {
      config = json.data;
      statuses = config.statuses || [];
      document.getElementById('eventName').textContent = config.event_name || 'Event Registration';
    }
  } catch (e) { console.error(e); }
}

// Load registrations
async function loadData() {
  try {
    const res = await fetch('/api/registrations');
    const json = await res.json();
    if (json.success) {
      data = json.data;
      render();
    }
  } catch (e) { console.error(e); }
}

// Load QR code
async function loadQR() {
  try {
    const res = await fetch('/api/qrcode');
    const json = await res.json();
    if (json.success) {
      document.getElementById('qrCodeImage').src = json.data.qrCode;
      document.getElementById('registrationUrl').textContent = json.data.url;
    }
  } catch (e) { console.error(e); }
}

// Render table
function render(list = data) {
  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('emptyState');
  const loading = document.getElementById('loadingState');

  loading.style.display = 'none';

  if (!list.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    updateStats();
    return;
  }

  empty.style.display = 'none';
  tbody.innerHTML = list.map((r, i) => `
    <tr class="status-${r.status}">
      <td>${list.length - i}</td>
      <td>${formatTime(r.timestamp)}</td>
      <td><strong>${esc(r.student_name)}</strong></td>
      <td><a href="tel:${r.phone_number}" class="phone-link">📞 ${esc(r.phone_number)}</a></td>
      <td>${esc(r.programme)}</td>
      <td>
        <select class="status-select" onchange="setStatus(${r.id}, this.value)">
          ${statuses.map(s => `<option value="${s.value}" ${r.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </td>
      <td><input class="remark-input" value="${esc(r.remark || '')}" onchange="setRemark(${r.id}, this.value)" placeholder="..."></td>
      <td>${r.time_in ? formatTime(r.time_in) : '-'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="confirmDelete(${r.id})">🗑️</button></td>
    </tr>
  `).join('');

  updateStats();
}

// Update stats
function updateStats() {
  const total = data.length;
  const waiting = data.filter(r => r.status === 'waiting').length;
  const inside = data.filter(r => r.status === 'inside').length;
  const max = parseInt(config.max_capacity) || 50;

  document.getElementById('totalCount').textContent = total;
  document.getElementById('waitingCount').textContent = waiting;
  document.getElementById('insideCount').textContent = inside;
  document.getElementById('availableSlots').textContent = Math.max(0, max - inside);
}

// API: Update status
async function setStatus(id, status) {
  await fetch(`/api/registrations/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
}

// API: Update remark
async function setRemark(id, remark) {
  await fetch(`/api/registrations/${id}/remark`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ remark })
  });
}

// Delete
let deleteId = null;
function confirmDelete(id) {
  deleteId = id;
  document.getElementById('deleteModal').classList.add('active');
  document.getElementById('confirmDelete').onclick = async () => {
    await fetch(`/api/registrations/${id}`, { method: 'DELETE' });
    closeModal();
  };
}

function closeModal() {
  document.getElementById('deleteModal').classList.remove('active');
}

// Socket events
function setupSocket() {
  const badge = document.getElementById('connectionStatus');

  socket.on('connect', () => badge.textContent = '🟢 Connected');
  socket.on('disconnect', () => badge.textContent = '🔴 Offline');

  socket.on('new-registration', (r) => {
    data.unshift(r);
    render();
    beep();
  });

  socket.on('registration-updated', (r) => {
    const idx = data.findIndex(x => x.id === r.id);
    if (idx >= 0) data[idx] = r;
    render();
  });

  socket.on('registration-deleted', ({ id }) => {
    data = data.filter(x => x.id !== id);
    render();
  });

  socket.on('registrations-cleared', () => {
    data = [];
    render();
  });

  socket.on('settings-updated', ({ key, value }) => {
    config[key] = value;
    if (key === 'event_name') document.getElementById('eventName').textContent = value;
    updateStats();
  });
}

// Search
function setupSearch() {
  document.getElementById('searchInput').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    if (!q) return render();
    render(data.filter(r =>
      r.student_name.toLowerCase().includes(q) ||
      r.phone_number.includes(q) ||
      r.programme.toLowerCase().includes(q)
    ));
  });
}

// Utilities
function refreshData() { loadData(); }
function exportCSV() { window.location.href = '/api/admin/export/csv'; }

function copyUrl() {
  navigator.clipboard.writeText(document.getElementById('registrationUrl').textContent);
  alert('Copied!');
}

function printQR() {
  const img = document.getElementById('qrCodeImage').src;
  const url = document.getElementById('registrationUrl').textContent;
  const w = window.open();
  w.document.write(`<html><body style="text-align:center;padding:50px;">
    <h2>Scan to Register</h2>
    <img src="${img}" style="width:250px;"><br><p>${url}</p>
    <script>setTimeout(()=>window.print(),500)<\/script>
  </body></html>`);
}

function formatTime(s) {
  if (!s) return '-';
  return new Date(s).toLocaleString('en-MY', { 
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function beep() {
  try {
    const c = new AudioContext();
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g);
    g.connect(c.destination);
    o.frequency.value = 880;
    g.gain.value = 0.1;
    o.start();
    o.stop(c.currentTime + 0.1);
  } catch (e) {}

}
