const socket = io();
let data = [];
let config = {};
let statuses = [];
let currentCategory = null;

// Get category from URL
function getCategoryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('category');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const urlCategory = getCategoryFromUrl();
  
  if (urlCategory === 'science' || urlCategory === 'business') {
    currentCategory = urlCategory;
    showDashboard();
  } else {
    // Show category selector
    document.getElementById('categorySelector').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'none';
  }
});

function selectCategory(category) {
  currentCategory = category;
  // Update URL
  window.history.pushState({}, '', `?category=${category}`);
  showDashboard();
}

function switchCategory() {
  document.getElementById('categorySelector').style.display = 'flex';
  document.getElementById('mainContent').style.display = 'none';
  
  // Update button styles
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.classList.remove('active-science', 'active-business');
  });
}

async function showDashboard() {
  document.getElementById('categorySelector').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
  
  // Update header theme
  const header = document.getElementById('header');
  const badge = document.getElementById('categoryBadge');
  
  if (currentCategory === 'science') {
    header.className = 'header science-theme';
    badge.className = 'category-badge category-science';
    badge.textContent = '🔬 Science & Engineering';
  } else {
    header.className = 'header business-theme';
    badge.className = 'category-badge category-business';
    badge.textContent = '💼 Business & Art';
  }
  
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
      
      // Set event name based on category
      let eventName;
      if (currentCategory === 'science') {
        eventName = config.event_name_science || 'Science & Engineering Fair';
      } else {
        eventName = config.event_name_business || 'Business & Art Fair';
      }
      document.getElementById('eventName').textContent = eventName;
    }
  } catch (e) { console.error(e); }
}

// Load registrations (filtered by category)
async function loadData() {
  try {
    const res = await fetch(`/api/registrations?category=${currentCategory}`);
    const json = await res.json();
    if (json.success) {
      data = json.data;
      render();
    }
  } catch (e) { console.error(e); }
}

// Load QR code (for current category)
async function loadQR() {
  try {
    const res = await fetch(`/api/qrcode?category=${currentCategory}`);
    const json = await res.json();
    if (json.success) {
      document.getElementById('qrCodeImage').src = json.data.qrCode;
      document.getElementById('registrationUrl').textContent = json.data.url;
      
      // Update QR title
      const title = currentCategory === 'science' 
        ? 'Scan to Register (Science & Engineering) 扫码登记 (理工科)'
        : 'Scan to Register (Business & Art) 扫码登记 (商业与艺术)';
      document.getElementById('qrTitle').textContent = title;
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
      <td>${formatTime(r.time_in)}</td>
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

  // Listen for new registrations in current category
  socket.on('new-registration', (r) => {
    if (r.category === currentCategory) {
      data.unshift(r);
      render();
      beep();
    }
  });

  socket.on('registration-updated', (r) => {
    if (r.category === currentCategory) {
      const idx = data.findIndex(x => x.id === r.id);
      if (idx >= 0) {
        data[idx] = r;
        render();
      }
    }
  });

  socket.on('registration-deleted', ({ id }) => {
    data = data.filter(x => x.id !== id);
    render();
  });

  socket.on('registrations-cleared', () => {
    data = [];
    render();
  });

  socket.on(`registrations-cleared-${currentCategory}`, () => {
    data = [];
    render();
  });

  socket.on('settings-updated', ({ key, value }) => {
    config[key] = value;
    if (key === `event_name_${currentCategory}`) {
      document.getElementById('eventName').textContent = value;
    }
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

function exportCSV() { 
  window.location.href = `/api/admin/export/csv?category=${currentCategory}`; 
}

function copyUrl() {
  navigator.clipboard.writeText(document.getElementById('registrationUrl').textContent);
  alert('Copied!');
}

function printQR() {
  const img = document.getElementById('qrCodeImage').src;
  const url = document.getElementById('registrationUrl').textContent;
  const title = currentCategory === 'science' 
    ? 'Science & Engineering 理工科' 
    : 'Business & Art 商业与艺术';
  
  const w = window.open();
  w.document.write(`<html><body style="text-align:center;padding:50px;">
    <h2>Scan to Register</h2>
    <h3>${title}</h3>
    <img src="${img}" style="width:300px;"><br><p>${url}</p>
    <script>setTimeout(()=>window.print(),500)<\/script>
  </body></html>`);
}

function formatTime(s) {
  if (!s) return '-';
  return s; // Time is already formatted from Google Sheets
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
