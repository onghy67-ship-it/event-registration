// Dashboard.js v5 - Complete Version
// Features: Conflict-safe remarks, Long wait alerts, Offline mode

const socket = io();
let data = [];
let config = {};
let statuses = [];
let currentCategory = null;
let currentFilter = '';
let programmes = [];

// =====================
// CONFIGURATION
// =====================

const CONFIG = {
  LONG_WAIT_THRESHOLD: 13 * 60 * 1000, // 13 minutes in milliseconds
  ALERT_CHECK_INTERVAL: 30000,          // Check every 30 seconds
  REMARK_SAVE_DELAY: 1500,              // Save remark after 1.5s of no typing
  OFFLINE_SYNC_INTERVAL: 5000,          // Try to sync every 5 seconds when offline
  HEARTBEAT_INTERVAL: 25000             // Socket heartbeat
};

// =====================
// STATE MANAGEMENT
// =====================

const remarkState = {};
let isOnline = navigator.onLine;
let offlineQueue = [];
let alertedRecords = new Set(); // Track which records we've already alerted
let longWaitCheckInterval = null;

// =====================
// INITIALIZATION
// =====================

window.onload = function() {
  console.log('Dashboard v5 loaded');
  
  // Setup online/offline detection
  setupOfflineDetection();
  
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
  startLongWaitChecker();
}

// =====================
// OFFLINE MODE
// =====================

function setupOfflineDetection() {
  // Listen for online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // Initial check
  updateConnectionStatus();
}

function handleOnline() {
  console.log('🟢 Back online');
  isOnline = true;
  updateConnectionStatus();
  
  // Sync any queued changes
  syncOfflineQueue();
  
  // Refresh data
  loadData();
}

function handleOffline() {
  console.log('🔴 Gone offline');
  isOnline = false;
  updateConnectionStatus();
  showNotification('📴 Offline Mode', 'Changes will sync when connection is restored.', 'warning');
}

function updateConnectionStatus() {
  const statusEl = document.getElementById('connectionStatus');
  const indicator = '<span class="sync-indicator ' + (isOnline ? 'synced' : 'offline') + '"></span>';
  
  if (isOnline) {
    statusEl.innerHTML = indicator + ' Online';
    statusEl.className = 'status-badge online';
  } else {
    statusEl.innerHTML = indicator + ' Offline';
    statusEl.className = 'status-badge offline';
  }
}

function queueOfflineAction(action) {
  offlineQueue.push({
    action: action,
    timestamp: Date.now()
  });
  
  // Store in localStorage for persistence
  try {
    localStorage.setItem('offlineQueue_' + currentCategory, JSON.stringify(offlineQueue));
  } catch (e) {
    console.error('Failed to save offline queue:', e);
  }
  
  console.log('Queued offline action:', action);
}

function loadOfflineQueue() {
  try {
    const saved = localStorage.getItem('offlineQueue_' + currentCategory);
    if (saved) {
      offlineQueue = JSON.parse(saved);
    }
  } catch (e) {
    offlineQueue = [];
  }
}

async function syncOfflineQueue() {
  if (!isOnline || offlineQueue.length === 0) return;
  
  console.log('Syncing', offlineQueue.length, 'offline actions...');
  showNotification('🔄 Syncing', 'Synchronizing offline changes...', 'info');
  
  const queue = [...offlineQueue];
  offlineQueue = [];
  
  let successCount = 0;
  let failCount = 0;
  
  for (const item of queue) {
    try {
      const result = await processOfflineAction(item.action);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
        // Re-queue failed actions
        offlineQueue.push(item);
      }
    } catch (e) {
      console.error('Sync error:', e);
      failCount++;
      offlineQueue.push(item);
    }
  }
  
  // Save remaining failed items
  try {
    localStorage.setItem('offlineQueue_' + currentCategory, JSON.stringify(offlineQueue));
  } catch (e) {}
  
  if (failCount === 0) {
    showNotification('✅ Synced', successCount + ' changes synchronized successfully!', 'success');
  } else {
    showNotification('⚠️ Partial Sync', successCount + ' synced, ' + failCount + ' failed. Will retry.', 'warning');
  }
  
  // Refresh data
  loadData();
}

async function processOfflineAction(action) {
  switch (action.type) {
    case 'updateStatus':
      return await fetch('/api/registrations/' + action.id + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action.status })
      }).then(r => r.json());
      
    case 'updateRemark':
      return await fetch('/api/registrations/' + action.id + '/remark', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remark: action.remark })
      }).then(r => r.json());
      
    default:
      return { success: false };
  }
}

// =====================
// LONG WAIT ALERT SYSTEM
// =====================

function startLongWaitChecker() {
  // Clear existing interval
  if (longWaitCheckInterval) {
    clearInterval(longWaitCheckInterval);
  }
  
  // Check immediately
  checkLongWaits();
  
  // Then check periodically
  longWaitCheckInterval = setInterval(checkLongWaits, CONFIG.ALERT_CHECK_INTERVAL);
}

function checkLongWaits() {
  if (!data || data.length === 0) return;
  
  const now = Date.now();
  const waitingStatuses = ['waiting', 'urgent'];
  
  data.forEach(function(record) {
    // Only check waiting/urgent statuses
    if (!waitingStatuses.includes(record.status)) {
      // Remove from alerted set if status changed
      alertedRecords.delete(record.id);
      return;
    }
    
    // Skip if already alerted
    if (alertedRecords.has(record.id)) return;
    
    // Parse timestamp
    const recordTime = parseTimestamp(record.timestamp);
    if (!recordTime) return;
    
    const waitTime = now - recordTime.getTime();
    
    // Check if waiting longer than threshold
    if (waitTime >= CONFIG.LONG_WAIT_THRESHOLD) {
      triggerLongWaitAlert(record, waitTime);
      alertedRecords.add(record.id);
    }
  });
  
  // Update visual indicators
  updateLongWaitVisuals();
}

function triggerLongWaitAlert(record, waitTime) {
  const minutes = Math.floor(waitTime / 60000);
  const num = getRecordNumber(record.id);
  
  // Show popup notification
  showNotification(
    '⏰ Long Wait Alert!',
    '#' + num + ' ' + record.student_name + ' has been waiting ' + minutes + ' minutes!\nCourse: ' + record.programme,
    'alert'
  );
  
  // Play alert sound
  playAlertSound();
  
  // Flash the row
  flashRow(record.id);
}

function updateLongWaitVisuals() {
  const now = Date.now();
  const waitingStatuses = ['waiting', 'urgent'];
  
  data.forEach(function(record) {
    const row = document.querySelector('tr[data-id="' + record.id + '"]');
    if (!row) return;
    
    // Remove existing long-wait class
    row.classList.remove('long-wait');
    
    // Only check waiting/urgent
    if (!waitingStatuses.includes(record.status)) return;
    
    const recordTime = parseTimestamp(record.timestamp);
    if (!recordTime) return;
    
    const waitTime = now - recordTime.getTime();
    
    if (waitTime >= CONFIG.LONG_WAIT_THRESHOLD) {
      row.classList.add('long-wait');
    }
  });
}

function flashRow(id) {
  const row = document.querySelector('tr[data-id="' + id + '"]');
  if (!row) return;
  
  row.classList.add('flash-alert');
  
  // Remove after animation
  setTimeout(function() {
    row.classList.remove('flash-alert');
  }, 5000);
}

function getRecordNumber(id) {
  const idx = data.findIndex(function(r) { return r.id === id; });
  return idx >= 0 ? data.length - idx : '?';
}

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Play 3 beeps
    [0, 200, 400].forEach(function(delay) {
      setTimeout(function() {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.2;
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }, delay);
    });
  } catch (e) {
    console.log('Audio not supported');
  }
}

// =====================
// NOTIFICATION SYSTEM
// =====================

function showNotification(title, message, type) {
  // Remove existing notifications
  const existing = document.querySelectorAll('.notification-popup');
  existing.forEach(function(el) { el.remove(); });
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'notification-popup notification-' + type;
  notification.innerHTML = 
    '<div class="notification-content">' +
    '<strong>' + title + '</strong>' +
    '<p>' + message.replace(/\n/g, '<br>') + '</p>' +
    '<button onclick="this.parentElement.parentElement.remove()">×</button>' +
    '</div>';
  
  document.body.appendChild(notification);
  
  // Auto remove after 10 seconds (except alerts)
  if (type !== 'alert') {
    setTimeout(function() {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 10000);
  }
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
    if (!isOnline) {
      // Try to use cached data
      loadCachedConfig();
    }
  }
}

function loadCachedConfig() {
  try {
    const cached = localStorage.getItem('config_' + currentCategory);
    if (cached) {
      const parsed = JSON.parse(cached);
      config = parsed.config;
      statuses = parsed.statuses;
      programmes = parsed.programmes;
      document.getElementById('eventName').textContent = parsed.eventName;
    }
  } catch (e) {}
}

function cacheConfig() {
  try {
    localStorage.setItem('config_' + currentCategory, JSON.stringify({
      config: config,
      statuses: statuses,
      programmes: programmes,
      eventName: document.getElementById('eventName').textContent
    }));
  } catch (e) {}
}

async function loadData() {
  setConnectionIndicator('syncing');
  
  try {
    const res = await fetch('/api/registrations?category=' + currentCategory);
    const json = await res.json();
    
    if (json.success) {
      data = json.data || [];
      
      // Cache data for offline use
      cacheData();
      cacheConfig();
      
      render();
      setConnectionIndicator('synced');
      
      // Load any offline queue
      loadOfflineQueue();
      
      // Check long waits
      checkLongWaits();
    } else {
      setConnectionIndicator('error');
    }
  } catch (e) { 
    console.error('Error loading data:', e);
    
    if (!isOnline) {
      // Load cached data
      loadCachedData();
      setConnectionIndicator('offline');
    } else {
      setConnectionIndicator('error');
    }
  }
}

function cacheData() {
  try {
    localStorage.setItem('data_' + currentCategory, JSON.stringify(data));
    localStorage.setItem('data_timestamp_' + currentCategory, Date.now().toString());
  } catch (e) {}
}

function loadCachedData() {
  try {
    const cached = localStorage.getItem('data_' + currentCategory);
    const timestamp = localStorage.getItem('data_timestamp_' + currentCategory);
    
    if (cached) {
      data = JSON.parse(cached);
      render();
      
      const age = Date.now() - parseInt(timestamp || '0');
      const ageMinutes = Math.floor(age / 60000);
      
      showNotification('📦 Offline Data', 'Showing cached data from ' + ageMinutes + ' minutes ago.', 'info');
    }
  } catch (e) {}
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

function setConnectionIndicator(status) {
  const el = document.getElementById('connectionStatus');
  
  const indicators = {
    'syncing': '<span class="sync-indicator syncing"></span> Syncing...',
    'synced': '<span class="sync-indicator synced"></span> Online',
    'offline': '<span class="sync-indicator offline"></span> Offline',
    'error': '<span class="sync-indicator error"></span> Error'
  };
  
  el.innerHTML = indicators[status] || indicators['error'];
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
// SORTING
// =====================

function getSortPriority(status) {
  // Priority: Urgent > Waiting > Inside > Consulting > Ended/NoAnswer
  const priorities = {
    'urgent': 1,
    'waiting': 2,
    'inside': 3,
    'consulting': 4,
    'ended': 5,
    'noanswer': 5
  };
  return priorities[status] || 6;
}

function sortData(list) {
  return list.slice().sort(function(a, b) {
    const priorityA = getSortPriority(a.status);
    const priorityB = getSortPriority(b.status);
    
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    return 0;
  });
}

// =====================
// RENDERING
// =====================

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
  
  // Check for long waits
  const now = Date.now();
  
  let html = '';
  list.forEach(function(r) {
    const num = originalIndices[r.id] || '?';
    
    // Initialize remark state
    initRemarkState(r.id, r.remark || '', r.version || '');
    
    // Check if long wait
    let longWaitClass = '';
    if (r.status === 'waiting' || r.status === 'urgent') {
      const recordTime = parseTimestamp(r.timestamp);
      if (recordTime && (now - recordTime.getTime()) >= CONFIG.LONG_WAIT_THRESHOLD) {
        longWaitClass = ' long-wait';
      }
    }
    
    html += '<tr class="status-' + r.status + longWaitClass + '" data-id="' + r.id + '">';
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
    html += 'onkeyup="debouncedSetRemark(\'' + r.id + '\')" onblur="saveRemark(\'' + r.id + '\')" placeholder="Add remark...">';
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
  
  // Waiting count = 'urgent' + 'waiting'
  const waitingList = data.filter(function(r) { 
    return r.status === 'waiting' || r.status === 'urgent'; 
  });
  
  // Inside count = 'inside' + 'consulting'
  const insideList = data.filter(function(r) { 
    return r.status === 'inside' || r.status === 'consulting'; 
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
  
  let oldest = null;
  let oldestTime = null;
  
  waitingList.forEach(function(r) {
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
  
  const idx = data.findIndex(function(r) { return r.id === oldest.id; });
  const num = idx >= 0 ? data.length - idx : '?';
  
  // Calculate wait time
  const waitMinutes = Math.floor((Date.now() - oldestTime.getTime()) / 60000);
  const waitClass = waitMinutes >= 13 ? 'long-wait-number alert' : 'longest-wait-number';
  
  content.innerHTML = 
    '<div class="' + waitClass + '">#' + num + ' (' + waitMinutes + 'm)</div>' +
    '<div class="longest-wait-course" title="' + esc(oldest.programme) + '">' + esc(oldest.programme) + '</div>';
}

function parseTimestamp(ts) {
  if (!ts) return null;
  try {
    const parts = ts.match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+):(\d+)\s+(AM|PM)/i);
    if (parts) {
      let hours = parseInt(parts[4]);
      if (parts[7].toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (parts[7].toUpperCase() === 'AM' && hours === 12) hours = 0;
      
      return new Date(
        parseInt(parts[3]),
        parseInt(parts[2]) - 1,
        parseInt(parts[1]),
        hours,
        parseInt(parts[5]),
        parseInt(parts[6])
      );
    }
  } catch (e) {}
  return null;
}

// =====================
// STATUS UPDATES
// =====================

async function setStatus(id, status) {
  // Optimistic update
  const record = data.find(function(r) { return r.id === id; });
  if (record) {
    record.status = status;
    render();
  }
  
  // Clear from alerted if status changed from waiting
  if (status !== 'waiting' && status !== 'urgent') {
    alertedRecords.delete(id);
  }
  
  if (!isOnline) {
    // Queue for later
    queueOfflineAction({ type: 'updateStatus', id: id, status: status });
    showNotification('📦 Queued', 'Status change saved offline. Will sync when online.', 'info');
    return;
  }
  
  setConnectionIndicator('syncing');
  
  try {
    const res = await fetch('/api/registrations/' + id + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status })
    });
    
    const json = await res.json();
    
    if (json.success) {
      setConnectionIndicator('synced');
    } else {
      setConnectionIndicator('error');
      showNotification('❌ Error', 'Failed to update status. Please try again.', 'error');
    }
  } catch (e) {
    console.error('Error setting status:', e);
    setConnectionIndicator('error');
    
    // Queue for offline sync
    queueOfflineAction({ type: 'updateStatus', id: id, status: status });
  }
}

// =====================
// REMARK UPDATES - WITH CONFLICT HANDLING
// =====================

function initRemarkState(id, remark, version) {
  if (!remarkState[id]) {
    remarkState[id] = {
      original: remark,
      current: remark,
      version: version,
      saving: false,
      timer: null
    };
  } else {
    // Update version if changed from server
    if (version && version !== remarkState[id].version) {
      remarkState[id].original = remark;
      remarkState[id].version = version;
    }
  }
}

function debouncedSetRemark(id) {
  const input = document.getElementById('remark_' + id);
  const savingEl = document.getElementById('saving_' + id);
  
  if (!input) return;
  
  const newValue = input.value;
  
  if (!remarkState[id]) {
    const record = data.find(function(r) { return r.id === id; });
    initRemarkState(id, record ? record.remark || '' : '', record ? record.version || '' : '');
  }
  
  remarkState[id].current = newValue;
  
  if (savingEl) {
    savingEl.textContent = '...';
    savingEl.className = 'remark-saving';
  }
  
  if (remarkState[id].timer) {
    clearTimeout(remarkState[id].timer);
  }
  
  remarkState[id].timer = setTimeout(function() {
    saveRemark(id);
  }, CONFIG.REMARK_SAVE_DELAY);
}

async function saveRemark(id) {
  const state = remarkState[id];
  if (!state || state.saving) return;
  
  const savingEl = document.getElementById('saving_' + id);
  
  if (state.current === state.original) {
    if (savingEl) savingEl.textContent = '';
    return;
  }
  
  // Update local data optimistically
  const record = data.find(function(r) { return r.id === id; });
  if (record) {
    record.remark = state.current;
  }
  
  if (!isOnline) {
    queueOfflineAction({ type: 'updateRemark', id: id, remark: state.current });
    state.original = state.current;
    if (savingEl) {
      savingEl.textContent = '📦';
      savingEl.title = 'Saved offline';
    }
    return;
  }
  
  state.saving = true;
  if (savingEl) {
    savingEl.textContent = '💾';
    savingEl.className = 'remark-saving saving';
  }
  
  try {
    const res = await fetch('/api/registrations/' + id + '/remark', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        remark: state.current,
        expectedVersion: state.version
      })
    });
    
    const json = await res.json();
    
    if (json.success) {
      state.original = json.data.remark;
      state.version = json.data.version;
      
      // Update input if value changed (e.g., merged)
      const input = document.getElementById('remark_' + id);
      if (input && input.value !== json.data.remark) {
        input.value = json.data.remark;
        state.current = json.data.remark;
      }
      
      if (savingEl) {
        savingEl.textContent = '✓';
        savingEl.className = 'remark-saving saved';
        setTimeout(function() { 
          if (savingEl) {
            savingEl.textContent = ''; 
            savingEl.className = 'remark-saving';
          }
        }, 2000);
      }
    } else if (json.conflict) {
      handleRemarkConflict(id, json);
    } else {
      if (savingEl) {
        savingEl.textContent = '↻';
        savingEl.className = 'remark-saving retry';
        savingEl.title = 'Retrying...';
      }
      setTimeout(function() { 
        state.saving = false;
        saveRemark(id); 
      }, 2000);
      return;
    }
  } catch (e) {
    console.error('Error saving remark:', e);
    
    queueOfflineAction({ type: 'updateRemark', id: id, remark: state.current });
    
    if (savingEl) {
      savingEl.textContent = '📦';
      savingEl.className = 'remark-saving offline-queued';
      savingEl.title = 'Queued for sync';
    }
  }
  
  state.saving = false;
}

function handleRemarkConflict(id, conflictData) {
  const state = remarkState[id];
  const input = document.getElementById('remark_' + id);
  const savingEl = document.getElementById('saving_' + id);
  
  const myRemark = state.current;
  const theirRemark = conflictData.currentRemark;
  
  if (myRemark === theirRemark) {
    state.version = conflictData.currentVersion;
    state.original = theirRemark;
    if (savingEl) {
      savingEl.textContent = '✓';
      savingEl.className = 'remark-saving saved';
    }
    return;
  }
  
  const choice = confirm(
    '⚠️ Conflict Detected!\n\n' +
    'Another staff member updated this remark.\n\n' +
    'Their version:\n"' + theirRemark + '"\n\n' +
    'Your version:\n"' + myRemark + '"\n\n' +
    'Click OK to MERGE (keep both)\n' +
    'Click Cancel to DISCARD your changes'
  );
  
  if (choice) {
    const merged = theirRemark ? theirRemark + ' | ' + myRemark : myRemark;
    state.current = merged;
    state.version = conflictData.currentVersion;
    if (input) input.value = merged;
    
    setTimeout(function() { saveRemark(id); }, 100);
  } else {
    state.original = theirRemark;
    state.current = theirRemark;
    state.version = conflictData.currentVersion;
    if (input) input.value = theirRemark;
    if (savingEl) {
      savingEl.textContent = '';
      savingEl.className = 'remark-saving';
    }
  }
}

// =====================
// SOCKET.IO
// =====================

function setupSocket() {
  socket.on('connect', function() { 
    console.log('Socket connected');
    if (isOnline) {
      setConnectionIndicator('synced');
    }
  });
  
  socket.on('disconnect', function() { 
    console.log('Socket disconnected');
  });
  
  socket.on('heartbeat', function() {
    socket.emit('heartbeat-response');
  });

  socket.on('new-registration', function(r) {
    if (r.category === currentCategory) {
      const exists = data.find(function(d) { return d.id === r.id; });
      if (!exists) {
        data.unshift(r);
        render();
        playBeep();
        showNotification('🆕 New Registration', r.student_name + ' - ' + r.programme, 'info');
      }
    }
  });

  socket.on('registration-updated', function(r) {
    if (r.category === currentCategory) {
      let found = false;
      for (let i = 0; i < data.length; i++) {
        if (data[i].id === r.id) {
          // Don't overwrite local remark changes
          const localState = remarkState[r.id];
          if (localState && localState.saving) {
            // Keep local remark, update everything else
            r.remark = localState.current;
          }
          data[i] = r;
          found = true;
          break;
        }
      }
      if (found) {
        render();
        checkLongWaits();
      }
    }
  });

  socket.on('registration-deleted', function(info) {
    data = data.filter(function(x) { return x.id !== info.id; });
    alertedRecords.delete(info.id);
    render();
  });

  socket.on('registrations-cleared', function(info) {
    if (!info.category || info.category === currentCategory) {
      data = [];
      alertedRecords.clear();
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
  showNotification('✅ Copied', 'URL copied to clipboard', 'success');
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

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.1;
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {}
}
