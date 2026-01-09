const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database location
const dataDir = './data';
const dbPath = path.join(dataDir, 'registration.db');

// Create data folder if not exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Default settings
const DEFAULTS = {
  eventName: "Career Fair 2024 职业博览会",
  maxCapacity: 50,
  programmes: [
    "Computer Science 计算机科学",
    "Business Administration 工商管理",
    "Engineering 工程学",
    "Medicine 医学",
    "Law 法律",
    "Arts & Design 艺术与设计",
    "Education 教育",
    "Finance 金融",
    "Marketing 市场营销",
    "Others 其他"
  ],
  statuses: [
    { value: "registered", label: "Registered 已登记", color: "#f8f9fa" },
    { value: "waiting", label: "Waiting 等候中", color: "#fff3cd" },
    { value: "inside", label: "Inside 进行中", color: "#d4edda" },
    { value: "ended", label: "Ended 已结束", color: "#cce5ff" },
    { value: "exited", label: "Exited 已离开", color: "#e2e3e5" }
  ]
};

function initializeDatabase() {
  // Create registrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      student_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      programme TEXT NOT NULL,
      status TEXT DEFAULT 'registered',
      remark TEXT DEFAULT '',
      time_in DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Initialize default settings
  const init = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  init.run('event_name', DEFAULTS.eventName);
  init.run('max_capacity', DEFAULTS.maxCapacity.toString());
  init.run('programmes', JSON.stringify(DEFAULTS.programmes));

  console.log('✅ Database ready');
}

// Registration functions
const registrations = {
  create: (data) => {
    const stmt = db.prepare(`
      INSERT INTO registrations (student_name, phone_number, programme)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(data.student_name, data.phone_number, data.programme);
    return registrations.getById(result.lastInsertRowid);
  },

  getAll: () => {
    return db.prepare(`SELECT * FROM registrations ORDER BY timestamp DESC`).all();
  },

  getById: (id) => {
    return db.prepare(`SELECT * FROM registrations WHERE id = ?`).get(id);
  },

  updateStatus: (id, status) => {
    if (status === 'inside') {
      db.prepare(`
        UPDATE registrations 
        SET status = ?, time_in = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, id);
    } else {
      db.prepare(`
        UPDATE registrations 
        SET status = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(status, id);
    }
    return registrations.getById(id);
  },

  updateRemark: (id, remark) => {
    db.prepare(`
      UPDATE registrations 
      SET remark = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(remark, id);
    return registrations.getById(id);
  },

  delete: (id) => {
    return db.prepare(`DELETE FROM registrations WHERE id = ?`).run(id);
  },

  clearAll: () => {
    db.prepare(`DELETE FROM registrations`).run();
    db.exec(`DELETE FROM sqlite_sequence WHERE name='registrations'`);
    return true;
  },

  getInsideCount: () => {
    return db.prepare(`SELECT COUNT(*) as count FROM registrations WHERE status = 'inside'`).get().count;
  }
};

// Settings functions
const settings = {
  get: (key) => {
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
    return row ? row.value : null;
  },

  set: (key, value) => {
    const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(key, val);
  },

  getAll: () => {
    const rows = db.prepare(`SELECT * FROM settings`).all();
    const result = {};
    rows.forEach(row => {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = row.value;
      }
    });
    result.statuses = DEFAULTS.statuses;
    return result;
  }
};

module.exports = { initializeDatabase, registrations, settings, DEFAULTS };