// Register.js - Fixed Version

let currentCategory = 'science';

// Get category from URL
function getCategoryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('category') || 'science';
}

// Initialize when page loads
window.onload = function() {
  console.log('Register page loaded');
  currentCategory = getCategoryFromUrl();
  console.log('Category:', currentCategory);
  
  applyTheme();
  loadSettings();
  setupForm();
};

// Apply color theme based on category
function applyTheme() {
  const body = document.getElementById('body');
  const indicator = document.getElementById('categoryIndicator');
  
  if (currentCategory === 'science') {
    body.className = 'register-page science-theme';
    indicator.textContent = '🔬 Science & Engineering 理工科';
  } else {
    body.className = 'register-page business-theme';
    indicator.textContent = '💼 Business & Art 商业与艺术';
  }
}

// Load settings and programmes from server
async function loadSettings() {
  console.log('Loading settings...');
  
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    console.log('Settings response:', json);
    
    if (json.success && json.data) {
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
      
      console.log('Event name:', eventName);
      console.log('Programmes:', programmes);
      
      document.getElementById('eventTitle').textContent = eventName;
      
      // Populate programmes dropdown
      const select = document.getElementById('programme');
      
      // Clear existing options (except the first "Select" option)
      while (select.options.length > 1) {
        select.remove(1);
      }
      
      // Add programmes
      if (Array.isArray(programmes)) {
        for (let i = 0; i < programmes.length; i++) {
          const opt = document.createElement('option');
          opt.value = programmes[i];
          opt.textContent = programmes[i];
          select.appendChild(opt);
        }
        console.log('Added', programmes.length, 'programmes to dropdown');
      } else {
        console.error('Programmes is not an array:', programmes);
      }
    } else {
      console.error('Invalid settings response:', json);
    }
  } catch (e) { 
    console.error('Error loading settings:', e); 
  }
}

// Setup form submission
function setupForm() {
  const form = document.getElementById('regForm');
  const btn = document.getElementById('submitBtn');

  form.onsubmit = async function(e) {
    e.preventDefault();
    console.log('Form submitted');
    
    btn.disabled = true;
    btn.textContent = '⏳ Submitting...';

    const payload = {
      student_name: document.getElementById('studentName').value.trim(),
      phone_number: document.getElementById('phoneNumber').value.trim(),
      programme: document.getElementById('programme').value,
      category: currentCategory
    };
    
    console.log('Payload:', payload);

    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      console.log('Registration response:', json);

      if (json.success) {
        document.getElementById('formCard').style.display = 'none';
        document.getElementById('successCard').style.display = 'block';
      } else {
        alert('Error: ' + (json.error || 'Unknown error'));
        btn.disabled = false;
        btn.textContent = '✅ Submit 提交';
      }
    } catch (err) {
      console.error('Registration error:', err);
      alert('Connection error. Please try again.');
      btn.disabled = false;
      btn.textContent = '✅ Submit 提交';
    }
  };
}

// Reset form for another registration
function resetForm() {
  document.getElementById('regForm').reset();
  document.getElementById('submitBtn').disabled = false;
  document.getElementById('submitBtn').textContent = '✅ Submit 提交';
  document.getElementById('formCard').style.display = 'block';
  document.getElementById('successCard').style.display = 'none';
}
