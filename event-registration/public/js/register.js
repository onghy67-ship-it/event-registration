// Register.js - Fixed Version v2

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
    
    // Debug: Log the full response
    console.log('Full settings response:', JSON.stringify(json, null, 2));
    
    // Try to get settings from different possible formats
    let settings = null;
    
    // Format 1: { success: true, data: { ... } }
    if (json.success && json.data) {
      settings = json.data;
      console.log('Using format 1: json.data');
    }
    // Format 2: { data: { ... } } (no success property)
    else if (json.data) {
      settings = json.data;
      console.log('Using format 2: json.data (no success)');
    }
    // Format 3: Direct object { event_name_science: ..., programmes_science: ... }
    else if (json.event_name_science || json.programmes_science || json.event_name_business || json.programmes_business) {
      settings = json;
      console.log('Using format 3: direct object');
    }
    // Format 4: Nested in result { result: { ... } }
    else if (json.result) {
      settings = json.result;
      console.log('Using format 4: json.result');
    }
    
    console.log('Parsed settings:', settings);
    
    if (!settings) {
      console.error('Could not parse settings from response:', json);
      // Use default programmes as fallback
      settings = getDefaultSettings();
      console.log('Using default settings');
    }
    
    // Set event name
    let eventName;
    let programmes;
    
    if (currentCategory === 'science') {
      eventName = settings.event_name_science || 'Science & Engineering Fair';
      programmes = settings.programmes_science;
    } else {
      eventName = settings.event_name_business || 'Business & Art Fair';
      programmes = settings.programmes_business;
    }
    
    console.log('Event name:', eventName);
    console.log('Raw programmes:', programmes);
    console.log('Programmes type:', typeof programmes);
    
    // Handle programmes - might be string (JSON) or array
    if (typeof programmes === 'string') {
      try {
        programmes = JSON.parse(programmes);
        console.log('Parsed programmes from JSON string');
      } catch (e) {
        console.error('Failed to parse programmes JSON:', e);
        programmes = [];
      }
    }
    
    // If still not an array, use defaults
    if (!Array.isArray(programmes)) {
      console.log('Programmes is not an array, using defaults');
      programmes = getDefaultProgrammes(currentCategory);
    }
    
    console.log('Final programmes array:', programmes);
    
    // Set event title
    document.getElementById('eventTitle').textContent = eventName;
    
    // Populate programmes dropdown
    const select = document.getElementById('programme');
    
    // Clear existing options (except the first "Select" option)
    while (select.options.length > 1) {
      select.remove(1);
    }
    
    // Add programmes
    for (let i = 0; i < programmes.length; i++) {
      const opt = document.createElement('option');
      opt.value = programmes[i];
      opt.textContent = programmes[i];
      select.appendChild(opt);
    }
    
    console.log('Added', programmes.length, 'programmes to dropdown');
    
  } catch (e) { 
    console.error('Error loading settings:', e);
    // Use defaults on error
    useDefaultProgrammes();
  }
}

// Default settings fallback
function getDefaultSettings() {
  return {
    event_name_science: 'Science & Engineering Fair 理工科博览会',
    event_name_business: 'Business & Art Fair 商业与艺术博览会',
    programmes_science: getDefaultProgrammes('science'),
    programmes_business: getDefaultProgrammes('business')
  };
}

// Default programmes fallback
function getDefaultProgrammes(category) {
  if (category === 'science') {
    return [
      "Computer Science 计算机科学",
      "Engineering 工程学",
      "Medicine 医学",
      "Mathematics 数学",
      "Physics 物理",
      "Chemistry 化学",
      "Biology 生物学",
      "Information Technology IT资讯工艺",
      "Data Science 数据科学",
      "Others 其他"
    ];
  } else {
    return [
      "Business Administration 工商管理",
      "Finance 金融",
      "Accounting 会计",
      "Marketing 市场营销",
      "Economics 经济学",
      "Arts & Design 艺术与设计",
      "Media & Communication 媒体与传播",
      "Law 法律",
      "Education 教育",
      "Others 其他"
    ];
  }
}

// Use default programmes (fallback)
function useDefaultProgrammes() {
  const programmes = getDefaultProgrammes(currentCategory);
  const select = document.getElementById('programme');
  
  while (select.options.length > 1) {
    select.remove(1);
  }
  
  for (let i = 0; i < programmes.length; i++) {
    const opt = document.createElement('option');
    opt.value = programmes[i];
    opt.textContent = programmes[i];
    select.appendChild(opt);
  }
  
  console.log('Using default programmes:', programmes.length);
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
