// Admin.js v3 - Password protected, with delete functionality

let config = {};
let programmesScience = [];
let programmesBusiness = [];
let clearCategory = null;
let correctPassword = 'xmumsr010';
let records = [];

// =====================
// PASSWORD
// =====================

function isAuthenticated() {
  return sessionStorage.getItem('admin_auth') === 'true';
}

function setAuthenticated() {
  sessionStorage.setItem('admin_auth', 'true');
}

function logout() {
  sessionStorage.removeItem('admin_auth');
  location.reload();
}

async function loadPassword() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    
    if (json.success && json.data && json.data.dashboard_password) {
      correctPassword = json.data.dashboard_password;
    }
  } catch (e) {}
}

function checkPassword() {
  const input = document.getElementById('passwordInput');
  const error = document.getElementById('passwordError');
  
  if (input.value === correctPassword) {
    setAuthenticated();
    document.getElementById('passwordOverlay').classList.add('hidden');
    document.getElementById('mainContent').style.display = 'block';
    loadSettings();
    loadRecords();
  } else {
    input.classList.add('error');
    error.classList.add('show');
    input.value = '';
    setTimeout(function() { input.classList.remove('error'); }, 500);
  }
}

// =====================
// INIT
// =====================

window.onload = async function() {
  await loadPassword();
  
  if (isAuthenticated()) {
    document.getElementById('passwordOverlay').classList.add('hidden');
    document.getElementById('mainContent').style.display = 'block';
    loadSettings();
    loadRecords();
  } else {
    document.getElementById('passwordInput').focus();
  }
};

// =====================
// SETTINGS
// =====================

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    
    if (json.success) {
      config = json.data;
      
      document.getElementById('eventNameScience').value = config.event_name_science || '';
      programmesScience = config.programmes_science || [];
      if (typeof programmesScience === 'string') programmesScience = JSON.parse(programmesScience);
      renderProgrammes('science');
      
      document.getElementById('eventNameBusiness').value = config.event_name_business || '';
      programmesBusiness = config.programmes_business || [];
      if (typeof programmesBusiness === 'string') programmesBusiness = JSON.parse(programmesBusiness);
      renderProgrammes('business');
      
      document.getElementById('dashboardPassword').value = config.dashboard_password || '';
    }
  } catch (e) { console.error(e); }
}

function renderProgrammes(category) {
  const list = category === 'science' ? programmesScience : programmesBusiness;
  const listId = category === 'science' ? 'programmesScience' : 'programmesBusiness';
  
  document.getElementById(listId).innerHTML = list.map(function(p, i) {
    return '<li><span>' + p + '</span><button class="btn btn-danger btn-sm" onclick="removeProgramme(\'' + category + '\', ' + i + ')">✕</button></li>';
  }).join('');
}

async function saveSetting(key, inputId) {
  const value = document.getElementById(inputId).value;
  if (!value) { alert('Enter a value'); return; }
  
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: key, value: value })
  });
  
  alert('Saved!');
}

async function savePassword() {
  const value = document.getElementById('dashboardPassword').value;
  if (!value || value.length < 4) { 
    alert('Password must be at least 4 characters'); 
    return; 
  }
  
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'dashboard_password', value: value })
  });
  
  correctPassword = value;
  alert('Password saved!');
}

async function addProgramme(category) {
  const inputId = category === 'science' ? 'newProgrammeScience' : 'newProgrammeBusiness';
  const input = document.getElementById(inputId);
  const value = input.value.trim();
  
  if (!value) { alert('Enter programme name'); return; }
  
  const list = category === 'science' ? programmesScience : programmesBusiness;
  if (list.indexOf(value) >= 0) { alert('Already exists'); return; }
  
  list.push(value);
  
  const key = category === 'science' ? 'programmes_science' : 'programmes_business';
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: key, value: JSON.stringify(list) })
  });
  
  input.value = '';
  renderProgrammes(category);
}

async function removeProgramme(category, index) {
  if (!confirm('Remove this programme?')) return;
  
  const list = category === 'science' ? programmesScience : programmesBusiness;
  list.splice(index, 1);
  
  const key = category === 'science' ? 'programmes_science' : 'programmes_business';
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: key, value: JSON.stringify(list) })
  });
  
  renderProgrammes(category);
}

// =====================
// RECORDS MANAGEMENT
// =====================

async function loadRecords() {
  const category = document.getElementById('manageCategory').value;
  
  try {
    const res = await fetch('/api/registrations?category=' + category);
    const json = await res.json();
    
    if (json.success) {
      records = json.data || [];
      renderRecords();
    }
  } catch (e) { console.error(e); }
}

function renderRecords() {
  const container = document.getElementById('recordsTable');
  
  if (records.length === 0) {
    container.innerHTML = '<p>No records found</p>';
    return;
  }
  
  let html = '<table class="data-table"><thead><tr>';
  html += '<th>#</th><th>Name</th><th>Phone</th><th>Programme</th><th>Status</th><th>Action</th>';
  html += '</tr></thead><tbody>';
  
  records.forEach(function(r, i) {
    html += '<tr>';
    html += '<td>' + (records.length - i) + '</td>';
    html += '<td>' + esc(r.student_name) + '</td>';
    html += '<td>' + esc(r.phone_number) + '</td>';
    html += '<td>' + esc(r.programme) + '</td>';
    html += '<td>' + esc(r.status) + '</td>';
    html += '<td><button class="delete-btn" onclick="deleteRecord(\'' + r.id + '\')">🗑️ Delete</button></td>';
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  container.innerHTML = html;
}

async function deleteRecord(id) {
  if (!confirm('Delete this record?')) return;
  
  try {
    await fetch('/api/registrations/' + id, { method: 'DELETE' });
    loadRecords();
  } catch (e) {
    alert('Failed to delete');
  }
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// =====================
// EXPORT & CLEAR
// =====================

function exportCSV(category) {
  window.location.href = '/api/admin/export/csv?category=' + category;
}

function showClearModal(category) {
  clearCategory = category;
  const messages = {
    'science': 'Clear all SCIENCE data?',
    'business': 'Clear all BUSINESS data?',
    'all': 'Clear ALL data?'
  };
  document.getElementById('clearMessage').textContent = messages[category] + ' Type DELETE:';
  document.getElementById('clearModal').classList.add('active');
  document.getElementById('confirmText').value = '';
}

function closeModal() {
  document.getElementById('clearModal').classList.remove('active');
}

async function confirmClear() {
  if (document.getElementById('confirmText').value !== 'DELETE') {
    alert('Type DELETE');
    return;
  }
  
  const body = clearCategory === 'all' ? {} : { category: clearCategory };
  await fetch('/api/admin/clear', { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  alert('Data cleared!');
  closeModal();
  loadRecords();
}
