let config = {};
let programmes = [];

document.addEventListener('DOMContentLoaded', loadSettings);

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (json.success) {
      config = json.data;
      programmes = config.programmes || [];
      document.getElementById('eventName').value = config.event_name || '';
      document.getElementById('maxCapacity').value = config.max_capacity || 50;
      renderList();
    }
  } catch (e) { console.error(e); }
}

function renderList() {
  document.getElementById('programmeList').innerHTML = programmes.map((p, i) => `
    <li><span>${p}</span><button class="btn btn-danger btn-sm" onclick="removeProg(${i})">✕</button></li>
  `).join('');
}

async function save(key, value) {
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value })
  });
}

async function saveEventName() {
  const v = document.getElementById('eventName').value.trim();
  if (!v) return alert('Enter name');
  await save('event_name', v);
  alert('Saved!');
}

async function saveCapacity() {
  const v = parseInt(document.getElementById('maxCapacity').value);
  if (!v || v < 1) return alert('Invalid');
  await save('max_capacity', v);
  alert('Saved!');
}

async function addProgramme() {
  const input = document.getElementById('newProgramme');
  const v = input.value.trim();
  if (!v) return alert('Enter name');
  if (programmes.includes(v)) return alert('Exists');
  programmes.push(v);
  await save('programmes', programmes);
  input.value = '';
  renderList();
}

async function removeProg(i) {
  if (!confirm('Remove?')) return;
  programmes.splice(i, 1);
  await save('programmes', programmes);
  renderList();
}

function exportCSV() { window.location.href = '/api/admin/export/csv'; }
function exportJSON() { window.location.href = '/api/admin/export/json'; }

function showClearModal() {
  document.getElementById('clearModal').classList.add('active');
  document.getElementById('confirmText').value = '';
}

function closeModal() {
  document.getElementById('clearModal').classList.remove('active');
}

async function confirmClear() {
  if (document.getElementById('confirmText').value !== 'DELETE') {
    return alert('Type DELETE to confirm');
  }
  await fetch('/api/admin/clear', { method: 'POST' });
  alert('All data cleared!');
  closeModal();
}