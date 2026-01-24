// Dashboard.js v3
// No password, filter instead of search, sorted list

const socket = io();
let data = [];
let config = {};
let statuses = [];
let currentCategory = null;
let currentFilter = '';
let programmes = [];

// Debounce for remark updates
const remarkTimers = {};
const REMARK_DEBOUNCE = 1000;

// =====================
// INITIALIZATION
// =====================

window.onload = function() {
  console.log('Dashboard loaded');
  
  const urlCategory = getCategoryFromUrl();
  
  if (urlCategory === 'science' || urlCategory === 'business') {
    currentCategory = urlCategory;
    showDashboard();
  } else {
    document.getElementById('categorySelector').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'none';
  }
};

function getCategoryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('category');
}

function selectCategory(category) {
  currentCategory = category;
  window.history.pushState({}, '', '?category=' + category);
  showDashboard();
}

function switchCategory() {
  window.location.href = '/';
}

async function showDashboard() {
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
  populateFilter();
  setupSocket();
}

// =====================
// DATA LOADING
// =====================

async function loadConfig() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    
    if (json.success) {
      config = json.data;
      statuses = config.statuses || [];
      
      let eventName;
      if (currentCategory === 'science') {
        eventName = config.event_name_science || 'Science & IT';
        programmes = config.programmes_science || [];
      } else {
        eventName = config.event_name_business || 'Business & Art';
        programmes = config.programmes_business || [];
      }
      
      if (typeof programmes === 'string') {
        programmes = JSON.parse(programmes);
      }
      
      document.getElementById('eventName').textContent = eventName;
    }
  } catch (e) { 
    console.error('Error loading config:', e); 
  }
}

async function loadData() {
  setConnectionStatus('syncing');
  
  try {
    const res = await fetch('/api/registrations?category=' + currentCategory);
    const json = await res.json();
    
    if (json.success) {
      data = json.data || [];
      render();
      setConnectionStatus('synced');
    } else {
      setConnectionStatus('error');
    }
  } catch (e) { 
    console.error('Error loading data:', e);
    setConnectionStatus('error');
  }
}

async function loadQR() {
  try {
    const res = await fetch('/api/qrcode?category=' + currentCategory);
    const json = await res.json();
    
    if (json.success) {
      document.getElementById('qrCodeImage').src = json.data.qrCode;
      document.getElementById('registrationUrl').textContent = json.data.url;
      
      const title = currentCategory === 'science' 
        ? 'Scan to Register (Science & IT) 扫码登记'
        : 'Scan to Register (Business & Art) 扫码登记';
      document.getElementById('qrTitle').textContent = title;
    }
  } catch (e) { 
    console.error('Error loading QR:', e); 
  }
}

// =====================
// FILTER
// =====================

function populateFilter() {
  const select = document.getElementById('filterSelect');
  select.innerHTML = '<option value="">All Programmes 所有课程</option>';
  
  programmes.forEach(function(p) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    select.appendChild(opt);
  });
}

function applyFilter() {
  currentFilter = document.getElementById('filterSelect').value;
  render();
}

// =====================
// SORTING & RENDERING
// =====================

function getSortPriority(status) {
  // Priority: Urgent > Waiting/Inside > Consulting > Ended/NoAnswer
  const priorities = {
    'urgent': 1,
    'waiting': 2,
    'inside': 2,
    'consulting': 3,
    'ended': 4,
    'noanswer': 4
  };
  return priorities[status] || 5;
}

function sortData(list) {
  return list.slice().sort(function(a, b) {
    const priorityA = getSortPriority(a.status);
    const priorityB = getSortPriority(b.status);
    
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    // Same priority - sort by timestamp (older first for urgent/waiting)
    return 0; // Keep original order within same priority
  });
}

function render() {
  let list = data;
  
  // Apply filter
  if (currentFilter) {
    list = list.filter(function(r) {
      return r.programme === currentFilter;
    });
  }
  
  // Sort by priority
  list = sortData(list);
  
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
  
  // Find original indices for display numbers
  const originalIndices = {};
  data.forEach(function(r, i) {
    originalIndices[r.id] = data.length - i;
  });
  
  let html = '';
  list.forEach(function(r) {
    const num = originalIndices[r.id] || '?';
    
    html += '<tr class="status-' + r.status + '" data-id="' + r.id + '">';
    html += '<td>' + num + '</td>';
    html += '<td>' + esc(r.timestamp) + '</td>';
    html += '<td><strong>' + esc(r.student_name) + '</strong></td>';
    html += '<td><a href="tel:' + r.phone_number + '" class="phone-link">📞 ' + esc(r.phone_number) + '</a></td>';
    html += '<td>' + esc(r.programme) + '</td>';
    html += '<td><select class="status-select" onchange="setStatus(\'' + r.id + '\', this.value)">';
    
    statuses.forEach(function(s) {
      const selected = r.status === s.value ? ' selected' : '';
      html += '<option value="' + s.value + '"' + selected + '>' + s.label + '</option>';
    });
    
    html += '</select></td>';
    html += '<td><div class="remark-wrapper">';
    html += '<input class="remark-input" id="remark_' + r.id + '" value="' + esc(r.remark || '') + '" ';
    html += 'onkeyup="debouncedSetRemark(\'' + r.id + '\')" placeholder="...">';
    html += '<span class="remark-saving" id="saving_' + r.id + '"></span>';
    html += '</div></td>';
    html += '<td>' + esc(r.time_in || '-') + '</td>';
    html += '</tr>';
  });
  
  tbody.innerHTML = html;
  updateStats();
}

// =====================
// STATISTICS
// =====================

function updateStats() {
  if (!data) data = [];
  
  // Waiting = 'waiting' + 'urgent'
  const waitingList = data.filter(function(r) { 
    return r.status === 'waiting' || r.status === 'urgent'; 
  });
  
  // Inside = 'consulting' + 'inside'
  const insideList = data.filter(function(r) { 
    return r.status === 'consulting' || r.status === 'inside'; 
  });
  
  document.getElementById('waitingCount').textContent = waitingList.length;
  document.getElementById('insideCount').textContent = insideList.length;
  
  // Calculate course waiting counts
  const courseCounts = {};
  waitingList.forEach(function(r) {
    if (r.programme) {
      courseCounts[r.programme] = (courseCounts[r.programme] || 0) + 1;
    }
  });
  
  const sortedCourses = Object.keys(courseCounts).map(function(course) {
    return { name: course, count: courseCounts[course] };
  }).sort(function(a, b) { return b.count - a.count; });
  
  // Update Top 3
  const topContent = document.getElementById('topCoursesContent');
  if (sortedCourses.length === 0) {
    topContent.innerHTML = '<div class="no-waiting">No one waiting</div>';
  } else {
    let html = '';
    sortedCourses.slice(0, 3).forEach(function(c, i) {
      html += '<div class="top-course-item">';
      html += '<span class="top-course-rank rank-' + (i + 1) + '">' + (i + 1) + '</span>';
      html += '<span class="top-course-name" title="' + esc(c.name) + '">' + esc(c.name) + '</span>';
      html += '<span class="top-course-count">' + c.count + '</span>';
      html += '</div>';
    });
    topContent.innerHTML = html;
  }
  
  // Update Longest Wait
  updateLongestWait(waitingList);
}

function updateLongestWait(waitingList) {
  const content = document.getElementById('longestWaitContent');
  
  if (waitingList.length === 0) {
    content.innerHTML = '<div class="no-long-wait">✓ All good</div>';
    return;
  }
  
  // Find the one waiting longest (earliest timestamp)
  // waitingList is already filtered to waiting/urgent status
  let oldest = null;
  let oldestTime = null;
  let oldestIndex = 0;
  
  waitingList.forEach(function(r) {
    // Parse timestamp to compare
    const time = parseTimestamp(r.timestamp);
    if (time && (!oldestTime || time < oldestTime)) {
      oldestTime = time;
      oldest = r;
    }
  });
  
  if (!oldest) {
    content.innerHTML = '<div class="no-long-wait">✓ All good</div>';
    return;
  }
  
  // Find the # number
  const idx = data.findIndex(function(r) { return r.id === oldest.id; });
  const num = idx >= 0 ? data.length - idx : '?';
  
  content.innerHTML = 
    '<div class="longest-wait-number">#' + num + '</div>' +
    '<div class="longest-wait-course" title="' + esc(oldest.programme) + '">' + esc(oldest.programme) + '</div>';
}

function parseTimestamp(ts) {
  if (!ts) return null;
  // Format: dd/MM/yyyy hh:mm:ss a
  try {
    const parts = ts.match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+):(\d+)\s+(AM|PM)/i);
    if (parts) {
      let hours = parseInt(parts[4]);
      if (parts[7].toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (parts[7].toUpperCase() === 'AM' && hours === 12) hours = 0;
      
      return new Date(
        parseInt(parts[3]), // year
        parseInt(parts[2]) - 1, // month
        parseInt(parts[1]), // day
        hours,
        parseInt(parts[5]),
        parseInt(parts[6])
      );
    }
  } catch (e) {}
  return null;
}

// =====================
// STATUS & REMARK UPDATES
// =====================

async function setStatus(id, status) {
  setConnectionStatus('syncing');
  
  try {
    const res = await fetch('/api/registrations/' + id + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status })
    });
    
    const json = await res.json();
    
    if (json.success) {
      setConnectionStatus('synced');
    } else {
      setConnectionStatus('error');
      alert('Failed to update status');
    }
  } catch (e) {
    console.error('Error setting status:', e);
    setConnectionStatus('error');
    alert('Failed to update status');
  }
}

function debouncedSetRemark(id) {
  // Show saving indicator
  const savingEl = document.getElementById('saving_' + id);
  if (savingEl) savingEl.textContent = '...';
  
  // Clear existing timer
  if (remarkTimers[id]) {
    clearTimeout(remarkTimers[id]);
  }
  
  // Set new timer
  remarkTimers[id] = setTimeout(function() {
    const input = document.getElementById('remark_' + id);
    if (input) {
      setRemark(id, input.value);
    }
  }, REMARK_DEBOUNCE);
}

async function setRemark(id, remark) {
  setConnectionStatus('syncing');
  const savingEl = document.getElementById('saving_' + id);
  
  try {
    const res = await fetch('/api/registrations/' + id + '/remark', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remark: remark })
    });
    
    const json = await res.json();
    
    if (json.success) {
      setConnectionStatus('synced');
      if (savingEl) savingEl.textContent = '✓';
      setTimeout(function() { if (savingEl) savingEl.textContent = ''; }, 1000);
    } else {
      setConnectionStatus('error');
      if (savingEl) savingEl.textContent = '✗';
    }
  } catch (e) {
    console.error('Error setting remark:', e);
    setConnectionStatus('error');
    if (savingEl) savingEl.textContent = '✗';
  }
}

// =====================
// CONNECTION STATUS
// =====================

function setConnectionStatus(status) {
  const el = document.getElementById('connectionStatus');
  const indicator = el.querySelector('.sync-indicator');
  
  indicator.className = 'sync-indicator ' + status;
  
  if (status === 'syncing') {
    el.innerHTML = '<span class="sync-indicator syncing"></span> Syncing...';
  } else if (status === 'synced') {
    el.innerHTML = '<span class="sync-indicator synced"></span> Connected';
  } else {
    el.innerHTML = '<span class="sync-indicator error"></span> Error';
  }
}

// =====================
// SOCKET.IO
// =====================

function setupSocket() {
  socket.on('connect', function() { 
    setConnectionStatus('synced');
  });
  
  socket.on('disconnect', function() { 
    setConnectionStatus('error');
  });
  
  socket.on('ping', function() {
    socket.emit('pong');
  });

  socket.on('new-registration', function(r) {
    if (r.category === currentCategory) {
      // Check for duplicates
      const exists = data.find(function(d) { return d.id === r.id; });
      if (!exists) {
        data.unshift(r);
        render();
        beep();
      }
    }
  });

  socket.on('registration-updated', function(r) {
    if (r.category === currentCategory) {
      let found = false;
      for (let i = 0; i < data.length; i++) {
        if (data[i].id === r.id) {
          data[i] = r;
          found = true;
          break;
        }
      }
      if (found) render();
    }
  });

  socket.on('registration-deleted', function(info) {
    data = data.filter(function(x) { return x.id !== info.id; });
    render();
  });

  socket.on('registrations-cleared', function(info) {
    if (!info.category || info.category === currentCategory) {
      data = [];
      render();
    }
  });

  socket.on('settings-updated', function(info) {
    config[info.key] = info.value;
    if (info.key === 'event_name_' + currentCategory) {
      document.getElementById('eventName').textContent = info.value;
    }
  });
}

// =====================
// UTILITIES
// =====================

function refreshData() { 
  loadData(); 
}

function copyUrl() {
  const url = document.getElementById('registrationUrl').textContent;
  navigator.clipboard.writeText(url);
  alert('Copied!');
}

function printQR() {
  const img = document.getElementById('qrCodeImage').src;
  const url = document.getElementById('registrationUrl').textContent;
  const title = currentCategory === 'science' ? 'Science & IT 理工科' : 'Business & Art 商科';
  
  const w = window.open();
  w.document.write('<html><body style="text-align:center;padding:50px;">');
  w.document.write('<h2>Scan to Register</h2><h3>' + title + '</h3>');
  w.document.write('<img src="' + img + '" style="width:300px;"><br><p>' + url + '</p>');
  w.document.write('<script>setTimeout(function(){window.print();},500)</script></body></html>');
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function beep() {
  try {
    const c = new AudioContext();
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.frequency.value = 880; g.gain.value = 0.1;
    o.start(); o.stop(c.currentTime + 0.1);
  } catch (e) {}
}
