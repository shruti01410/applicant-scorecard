-- 001_baseline.sql — schema snapshot for HUMSEE SCORE (SQLite).
-- Applied idempotently by database.js on boot. Future changes go in
-- 00N_*.sql under backend/migrations/ and are recorded in schema_migrations.
-- When migrating to PostgreSQL, translate these statements (types + SERIAL)
-- and keep the same numbering so both engines track the same history.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'employee')),
  name TEXT NOT NULL,
  email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  performed_by INTEGER,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  module TEXT,
  detail TEXT,
  ip TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parameters (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  weightage INTEGER NOT NULL,
  grp TEXT CHECK(grp IN ('PERSON', 'ROLE', 'DEAL')),
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'legacy'))
);

CREATE TABLE IF NOT EXISTS scorecards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL UNIQUE,
  applicant_name TEXT,
  email TEXT,
  client TEXT,
  position TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scorecard_id INTEGER NOT NULL,
  parameter_id INTEGER NOT NULL,
  score INTEGER,
  status TEXT DEFAULT 'active',
  note TEXT,
  UNIQUE(scorecard_id, parameter_id)
);

CREATE TABLE IF NOT EXISTS scoring_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scorecard_id INTEGER NOT NULL UNIQUE,
  rules_version TEXT,
  pursuit_priority_display INTEGER,
  candidate_fit REAL,
  joining_probability REAL,
  confidence_score REAL,
  final_decision TEXT,
  calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role, permission)
);

CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_scores_scorecard ON scores(scorecard_id);
