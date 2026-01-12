// Dashboard.js - Updated with Course Stats

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

// Initialize when page loads
window.onload = function() {
  console.log('Page loaded');
  
  const urlCategory = getCategoryFromUrl();
  console.log('URL Category:', urlCategory);
  
  if (urlCategory === 'science' || urlCategory === 'business') {
    currentCategory = urlCategory;
    showDashboard();
  } else {
    document.getElementById('categorySelector').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'none';
  }
};

// When user clicks category button
function selectCategory(category) {
  console.log('Selected category:', category);
  currentCategory = category;
  window.history.pushState({}, '', '?category=' + category);
  showDashboard();
}

// Switch to different category
function switchCategory() {
  window.location.href = '/';
}

// Show the main dashboard
async function showDashboard() {
  console.log('Showing dashboard for:', currentCategory);
  
  document.getElementById('categorySelector').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
  
  const header = document.getElementById('header');
  const badge = document.getElementById('categoryBadge');
  
  if (currentCategory === 'science') {
    header.className = 'header science-theme';
    badge.className = 'category-badge category-science';
    badge.textContent = '🔬 Science & IT';
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

// Load settings from server
async function loadConfig() {
  console.log('Loading config...');
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    
    if (json.success) {
      config = json.data;
      statuses = config.statuses || [];
      
      let eventName;
      if (currentCategory === 'science') {
        eventName = config.event_name_science || 'Science & Engineering Fair';
      } else {
        eventName = config.event_name_business || 'Business & Art Fair';
      }
      document.getElementById('eventName').textContent = eventName;
    }
  } catch (e) { 
    console.error('Error loading config:', e); 
  }
}

// Load registrations from server
async function loadData() {
  console.log('Loading data for category:', currentCategory);
  try {
    const res = await fetch('/api/registrations?category=' + currentCategory);
    const json = await res.json();
    
    if (json.success) {
      data = json.data;
      render();
    }
  } catch (e) { 
    console.error('Error loading data:', e); 
  }
}

// Load QR code
async function loadQR() {
  console.log('Loading QR for category:', currentCategory);
  try {
    const res = await fetch('/api/qrcode?category=' + currentCategory);
    const json = await res.json();
    
    if (json.success) {
      document.getElementById('qrCodeImage').src = json.data.qrCode;
      document.getElementById('registrationUrl').textContent = json.data.url;
      
      const title = currentCategory === 'science' 
        ? 'Scan to Register (Science & IT) 扫码登记 (理工科)'
        : 'Scan to Register (Business & Art) 扫码登记 (商科)';
      document.getElementById('qrTitle').textContent = title;
    }
  } catch (e) { 
    console.error('Error loading QR:', e); 
  }
}

// Render the table
function render(list) {
  if (!list) list = data;
  
  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('emptyState');
  const loading = document.getElementById('loadingState');

  loading.style.display = 'none';

  if (!list || list.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    updateStats();
    return;
  }

  empty.style.display = 'none';
  
  let html = '';
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const num = list.length - i;
    
    html += '<tr class="status-' + r.status + '">';
    html += '<td>' + num + '</td>';
    html += '<td>' + formatTime(r.timestamp) + '</td>';
    html += '<td><strong>' + esc(r.student_name) + '</strong></td>';
    html += '<td><a href="tel:' + r.phone_number + '" class="phone-link">📞 ' + esc(r.phone_number) + '</a></td>';
    html += '<td>' + esc(r.programme) + '</td>';
    html += '<td><select class="status-select" onchange="setStatus(' + r.id + ', this.value)">';
    
    for (let j = 0; j < statuses.length; j++) {
      const s = statuses[j];
      const selected = r.status === s.value ? ' selected' : '';
      html += '<option value="' + s.value + '"' + selected + '>' + s.label + '</option>';
    }
    
    html += '</select></td>';
    html += '<td><input class="remark-input" value="' + esc(r.remark || '') + '" onchange="setRemark(' + r.id + ', this.value)" placeholder="..."></td>';
    html += '<td>' + formatTime(r.time_in) + '</td>';
    html += '<td><button class="btn btn-danger btn-sm" onclick="confirmDelete(' + r.id + ')">🗑️</button></td>';
    html += '</tr>';
  }
  
  tbody.innerHTML = html;
  updateStats();
}

// Update statistics - NEW LOGIC
function updateStats() {
  if (!data) data = [];
  
  // Count waiting (includes both "waiting" and "urgent" status)
  const waitingList = data.filter(function(r) { 
    return r.status === 'waiting' || r.status === 'urgent'; 
  });
  
  const insideList = data.filter(function(r) { 
    return r.status === 'inside'; 
  });
  
  // Update simple counts
  document.getElementById('waitingCount').textContent = waitingList.length;
  document.getElementById('insideCount').textContent = insideList.length;
  
  // Calculate course waiting counts
  const courseCounts = {};
  for (let i = 0; i < waitingList.length; i++) {
    const programme = waitingList[i].programme;
    if (programme) {
      if (!courseCounts[programme]) {
        courseCounts[programme] = 0;
      }
      courseCounts[programme]++;
    }
  }
  
  // Convert to array and sort by count (descending)
  const sortedCourses = [];
  for (const course in courseCounts) {
    sortedCourses.push({
      name: course,
      count: courseCounts[course]
    });
  }
  sortedCourses.sort(function(a, b) {
    return b.count - a.count;
  });
  
  // Update Top 3 Courses
  const topCoursesContent = document.getElementById('topCoursesContent');
  if (sortedCourses.length === 0) {
    topCoursesContent.innerHTML = '<div class="no-waiting">No one waiting 暂无等候</div>';
  } else {
    let html = '';
    const top3 = sortedCourses.slice(0, 3);
    for (let i = 0; i < top3.length; i++) {
      const course = top3[i];
      const rankClass = 'rank-' + (i + 1);
      html += '<div class="top-course-item">';
      html += '<span class="top-course-rank ' + rankClass + '">' + (i + 1) + '</span>';
      html += '<span class="top-course-name" title="' + esc(course.name) + '">' + esc(course.name) + '</span>';
      html += '<span class="top-course-count">' + course.count + '</span>';
      html += '</div>';
    }
    topCoursesContent.innerHTML = html;
  }
  
  // Update Longest Queue
  const longestQueueCount = document.getElementById('longestQueueCount');
  const longestQueueName = document.getElementById('longestQueueName');
  
  if (sortedCourses.length === 0) {
    longestQueueCount.textContent = '0';
    longestQueueName.textContent = 'No queue 无队伍';
  } else {
    const longest = sortedCourses[0];
    longestQueueCount.textContent = longest.count;
    longestQueueName.textContent = longest.name;
    longestQueueName.title = longest.name; // Tooltip for full name
  }
}

// Update status via API
async function setStatus(id, status) {
  console.log('Setting status:', id, status);
  try {
    await fetch('/api/registrations/' + id + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status })
    });
  } catch (e) {
    console.error('Error setting status:', e);
    alert('Failed to update status');
  }
}

// Update remark via API
async function setRemark(id, remark) {
  console.log('Setting remark:', id, remark);
  try {
    await fetch('/api/registrations/' + id + '/remark', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remark: remark })
    });
  } catch (e) {
    console.error('Error setting remark:', e);
  }
}

// Delete registration
let deleteId = null;

function confirmDelete(id) {
  deleteId = id;
  document.getElementById('deleteModal').classList.add('active');
  document.getElementById('confirmDelete').onclick = async function() {
    await fetch('/api/registrations/' + id, { method: 'DELETE' });
    closeModal();
  };
}

function closeModal() {
  document.getElementById('deleteModal').classList.remove('active');
}

// Socket.IO setup
function setupSocket() {
  const badge = document.getElementById('connectionStatus');

  socket.on('connect', function() { 
    badge.textContent = '🟢 Connected'; 
  });
  
  socket.on('disconnect', function() { 
    badge.textContent = '🔴 Offline'; 
  });

  socket.on('new-registration', function(r) {
    console.log('New registration:', r);
    if (r.category === currentCategory) {
      data.unshift(r);
      render();
      beep();
    }
  });

  socket.on('registration-updated', function(r) {
    console.log('Registration updated:', r);
    if (r.category === currentCategory) {
      for (let i = 0; i < data.length; i++) {
        if (data[i].id === r.id) {
          data[i] = r;
          break;
        }
      }
      render();
    }
  });

  socket.on('registration-deleted', function(info) {
    console.log('Registration deleted:', info);
    data = data.filter(function(x) { return x.id !== info.id; });
    render();
  });

  socket.on('registrations-cleared', function() {
    console.log('All registrations cleared');
    data = [];
    render();
  });

  socket.on('settings-updated', function(info) {
    console.log('Settings updated:', info);
    config[info.key] = info.value;
    if (info.key === 'event_name_' + currentCategory) {
      document.getElementById('eventName').textContent = info.value;
    }
    updateStats();
  });
}

// Search functionality
function setupSearch() {
  const input = document.getElementById('searchInput');
  input.addEventListener('input', function(e) {
    const q = e.target.value.toLowerCase();
    if (!q) {
      render(data);
      return;
    }
    const filtered = data.filter(function(r) {
      return r.student_name.toLowerCase().indexOf(q) >= 0 ||
             r.phone_number.indexOf(q) >= 0 ||
             r.programme.toLowerCase().indexOf(q) >= 0;
    });
    render(filtered);
  });
}

// Refresh data
function refreshData() { 
  loadData(); 
}

// Export CSV
function exportCSV() { 
  window.location.href = '/api/admin/export/csv?category=' + currentCategory; 
}

// Copy URL to clipboard
function copyUrl() {
  const url = document.getElementById('registrationUrl').textContent;
  navigator.clipboard.writeText(url);
  alert('Copied!');
}

// Print QR code
function printQR() {
  const img = document.getElementById('qrCodeImage').src;
  const url = document.getElementById('registrationUrl').textContent;
  const title = currentCategory === 'science' 
    ? 'Science & IT 理工科' 
    : 'Business & Art 商科';
  
  const w = window.open();
  w.document.write('<html><body style="text-align:center;padding:50px;">');
  w.document.write('<h2>Scan to Register</h2>');
  w.document.write('<h3>' + title + '</h3>');
  w.document.write('<img src="' + img + '" style="width:300px;"><br>');
  w.document.write('<p>' + url + '</p>');
  w.document.write('<script>setTimeout(function(){window.print();},500)</script>');
  w.document.write('</body></html>');
}

// Format time
function formatTime(s) {
  if (!s) return '-';
  return s;
}

// Escape HTML
function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Play notification sound
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
