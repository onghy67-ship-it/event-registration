document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadSettings();
  setupForm();
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (json.success) {
      document.getElementById('eventTitle').textContent = json.data.event_name || 'Event Registration';
      
      const select = document.getElementById('programme');
      (json.data.programmes || []).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        select.appendChild(opt);
      });
    }
  } catch (e) { console.error(e); }
}

function setupForm() {
  const form = document.getElementById('regForm');
  const btn = document.getElementById('submitBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    btn.disabled = true;
    btn.textContent = '⏳ Submitting...';

    const payload = {
      student_name: document.getElementById('studentName').value.trim(),
      phone_number: document.getElementById('phoneNumber').value.trim(),
      programme: document.getElementById('programme').value
    };

    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json.success) {
        document.getElementById('formCard').style.display = 'none';
        document.getElementById('successCard').style.display = 'block';
      } else {
        alert('Error: ' + (json.error || 'Unknown'));
        btn.disabled = false;
        btn.textContent = '✅ Submit 提交';
      }
    } catch (err) {
      alert('Connection error');
      btn.disabled = false;
      btn.textContent = '✅ Submit 提交';
    }
  });
}

function resetForm() {
  document.getElementById('regForm').reset();
  document.getElementById('submitBtn').disabled = false;
  document.getElementById('submitBtn').textContent = '✅ Submit 提交';
  document.getElementById('formCard').style.display = 'block';
  document.getElementById('successCard').style.display = 'none';
}