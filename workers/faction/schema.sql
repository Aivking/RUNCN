-- 组织表
CREATE TABLE IF NOT EXISTS factions (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- 成员表
CREATE TABLE IF NOT EXISTS members (
  id           TEXT PRIMARY KEY,
  faction_id   TEXT NOT NULL,
  company_name TEXT NOT NULL UNIQUE,
  pin_hash     TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member',
  joined_at    TEXT NOT NULL
);

-- 邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
  code       TEXT PRIMARY KEY,
  faction_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  used_by    TEXT,
  used_at    TEXT,
  created_at TEXT NOT NULL
);

-- Phase 2+ 表（预建，暂不使用）

CREATE TABLE IF NOT EXISTS treasury_records (
  id           TEXT PRIMARY KEY,
  faction_id   TEXT NOT NULL,
  amount       REAL NOT NULL,
  operator     TEXT NOT NULL,
  note         TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_treasury_created ON treasury_records(faction_id, created_at);

CREATE TABLE IF NOT EXISTS logistics_requests (
  id               TEXT PRIMARY KEY,
  faction_id       TEXT NOT NULL,
  requester        TEXT NOT NULL,
  material_ticker  TEXT NOT NULL,
  quantity         INTEGER NOT NULL,
  destination      TEXT NOT NULL,
  reason           TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  reviewer         TEXT,
  reviewed_at      TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logistics_status ON logistics_requests(faction_id, status);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  faction_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  assignee    TEXT,
  created_by  TEXT NOT NULL,
  due_date    TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(faction_id, status);

CREATE TABLE IF NOT EXISTS task_comments (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id),
  author     TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

CREATE TABLE IF NOT EXISTS bulletins (
  id         TEXT PRIMARY KEY,
  faction_id TEXT NOT NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  author     TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Phase 4: 每日产出记录表
CREATE TABLE IF NOT EXISTS daily_production (
  id               TEXT PRIMARY KEY,
  faction_id       TEXT NOT NULL,
  company_name     TEXT NOT NULL,
  material_ticker  TEXT NOT NULL,
  quantity         INTEGER NOT NULL,
  report_date      TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  UNIQUE(faction_id, company_name, material_ticker, report_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_prod_date ON daily_production(faction_id, report_date);
