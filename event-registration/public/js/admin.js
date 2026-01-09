let config = {};
let programmesScience = [];
let programmesBusiness = [];
let clearCategory = null;

document.addEventListener('DOMContentLoaded', loadSettings);

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    
    if (json.success) {
      config = json.data;
      
      // Science settings
      document.getElementById('eventNameScience').value = config.event_name_science || '';
      programmesScience = config.programmes_science || [];
      renderProgrammes('science');
      
      // Business settings
      document.getElementById('eventNameBusiness').value = config.event_name_business || '';
      programmesBusiness = config.programmes_business || [];
      renderProgrammes('business');
      
      // Shared settings
      document.getElementById('maxCapacity').value = config.max_capacity || 50;
    }
  } catch (e) { console.error(e); }
}

function renderProgrammes(category) {
  const list = category === 'science' ? programmesScience : programmesBusiness;
  const listId = category === 'science' ? 'programmesScience' : 'programmesBusiness';
  
  document.getElementById(listId).innerHTML = list.map((p, i) => `
    <li><span>${p}</span><button class="btn btn-danger btn-sm" onclick="removeProgramme('${category}', ${i})">✕</button></li>
  `).join('');
}

async function saveSetting(key, inputId) {
  const value = document.getElementById(inputId).value;
  if (!value) { alert('Enter a value'); return; }
  
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value })
  });
  
  alert('Saved!');
}

async function addProgramme(category) {
  const inputId = category === 'science' ? 'newProgrammeScience' : 'newProgrammeBusiness';
  const input = document.getElementById(inputId);
  const value = input.value.trim();
  
  if (!value) { alert('Enter programme name'); return; }
  
  const list = category === 'science' ? programmesScience : programmesBusiness;
  if (list.includes(value)) { alert('Already exists'); return; }
  
  list.push(value);
  
  const key = category === 'science' ? 'programmes_science' : 'programmes_business';
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value: JSON.stringify(list) })
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
    body: JSON.stringify({ key, value: JSON.stringify(list) })
  });
  
  renderProgrammes(category);
}

function exportCSV(category) {
  window.location.href = `/api/admin/export/csv?category=${category}`;
}

function showClearModal(category) {
  clearCategory = category;
  let message = 'Type DELETE to confirm:';
  
  if (category === 'science') {
    message = 'Clear all SCIENCE & ENGINEERING data? Type DELETE:';
  } else if (category === 'business') {
    message = 'Clear all BUSINESS & ART data? Type DELETE:';
  } else {
    message = 'Clear ALL data from BOTH categories? Type DELETE:';
  }
  
  document.getElementById('clearMessage').textContent = message;
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
