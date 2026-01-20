// Admin.js - With Password Protection

let config = {};
let programmesScience = [];
let programmesBusiness = [];
let clearCategory = null;
let correctPassword = 'openday2024';

// =====================
// PASSWORD PROTECTION
// =====================

function isAuthenticated() {
  return sessionStorage.getItem('dashboard_auth') === 'true';
}

function setAuthenticated() {
  sessionStorage.setItem('dashboard_auth', 'true');
}

function logout() {
  sessionStorage.removeItem('dashboard_auth');
  location.reload();
}

function checkPassword() {
  const input = document.getElementById('passwordInput');
  const error = document.getElementById('passwordError');
  
  if (input.value === correctPassword) {
    setAuthenticated();
    document.getElementById('passwordOverlay').classList.add('hidden');
    document.getElementById('mainContent').style.display = 'block';
    loadSettings();
  } else {
    input.classList.add('error');
    error.classList.add('show');
    input.value = '';
    setTimeout(function() { input.classList.remove('error'); }, 500);
  }
}

async function loadPassword() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    
    if (json.success && json.data && json.data.dashboard_password) {
      correctPassword = json.data.dashboard_password;
    } else if (json.data && json.data.dashboard_password) {
      correctPassword = json.data.dashboard_password;
    }
  } catch (e) {
    console.log('Using default password');
  }
}

// =====================
// INITIALIZATION
// =====================

window.onload = async function() {
  await loadPassword();
  
  if (isAuthenticated()) {
    document.getElementById('passwordOverlay').classList.add('hidden');
    document.getElementById('mainContent').style.display = 'block';
    loadSettings();
  } else {
    document.getElementById('passwordInput').focus();
  }
};

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    
    if (json.success) {
      config = json.data;
      
      // Science
      document.getElementById('eventNameScience').value = config.event_name_science || '';
      programmesScience = config.programmes_science || [];
      if (typeof programmesScience === 'string') {
        programmesScience = JSON.parse(programmesScience);
      }
      renderProgrammes('science');
      
      // Business
      document.getElementById('eventNameBusiness').value = config.event_name_business || '';
      programmesBusiness = config.programmes_business || [];
      if (typeof programmesBusiness === 'string') {
        programmesBusiness = JSON.parse(programmesBusiness);
      }
      renderProgrammes('business');
      
      // Shared
      document.getElementById('maxCapacity').value = config.max_capacity || 50;
      
      // Password (show current)
      document.getElementById('dashboardPassword').value = config.dashboard_password || '';
    }
  } catch (e) { 
    console.error(e); 
  }
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
  alert('Password saved! New password: ' + value);
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
  if (!confirm('Remove?')) return;
  
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

function exportCSV(category) {
  window.location.href = '/api/admin/export/csv?category=' + category;
}

function showClearModal(category) {
  clearCategory = category;
  const messages = {
    'science': 'Clear all SCIENCE data?',
    'business': 'Clear all BUSINESS data?',
    'all': 'Clear ALL data from BOTH categories?'
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
}
