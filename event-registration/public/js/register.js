let currentCategory = 'science';

// Get category from URL
function getCategoryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('category') || 'science';
}

document.addEventListener('DOMContentLoaded', () => {
  currentCategory = getCategoryFromUrl();
  applyTheme();
  loadSettings();
  setupForm();
});

function applyTheme() {
  const body = document.getElementById('body');
  const indicator = document.getElementById('categoryIndicator');
  
  if (currentCategory === 'science') {
    body.classList.add('science-theme');
    indicator.textContent = '🔬 Science & Engineering 理工科';
  } else {
    body.classList.add('business-theme');
    indicator.textContent = '💼 Business & Art 商业与艺术';
  }
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    
    if (json.success) {
      // Set event name
      let eventName;
      let programmes;
      
      if (currentCategory === 'science') {
        eventName = json.data.event_name_science || 'Science & Engineering Fair';
        programmes = json.data.programmes_science || [];
      } else {
        eventName = json.data.event_name_business || 'Business & Art Fair';
        programmes = json.data.programmes_business || [];
      }
      
      document.getElementById('eventTitle').textContent = eventName;
      
      // Populate programmes
      const select = document.getElementById('programme');
      programmes.forEach(p => {
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
      programme: document.getElementById('programme').value,
      category: currentCategory
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
