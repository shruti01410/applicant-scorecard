const { DatabaseSync } = require('node:sqlite');
const express = require('express');

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT,
    role TEXT NOT NULL, name TEXT NOT NULL, email TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    job_description_id INTEGER, resume_text TEXT, capability_match_detail TEXT);
  CREATE TABLE scorecards (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL UNIQUE,
    applicant_name TEXT, email TEXT, client TEXT, position TEXT);
  CREATE TABLE parameters (id INTEGER PRIMARY KEY, name TEXT, description TEXT, weightage INTEGER);
  CREATE TABLE scores (id INTEGER PRIMARY KEY AUTOINCREMENT, scorecard_id INTEGER NOT NULL,
    parameter_id INTEGER NOT NULL, score INTEGER NOT NULL);
  CREATE TABLE job_descriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, client TEXT, description_text TEXT);
  CREATE TABLE candidate_decisions (id INTEGER PRIMARY KEY AUTOINCREMENT, candidate_id INTEGER NOT NULL,
    jd_id INTEGER, decision TEXT NOT NULL, reason_code TEXT, recruiter_feedback TEXT, evidence_snapshot TEXT,
    decided_by INTEGER, decided_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE candidate_emails (id INTEGER PRIMARY KEY AUTOINCREMENT, candidate_id INTEGER NOT NULL,
    decision_id INTEGER, recipient_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', reviewed_by INTEGER, reviewed_at DATETIME, sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, gmail_draft_id TEXT, gmail_account_id INTEGER, updated_at DATETIME);
  CREATE TABLE approval_workflows (id INTEGER PRIMARY KEY AUTOINCREMENT, candidate_id INTEGER NOT NULL,
    approval_type TEXT NOT NULL DEFAULT 'panel', status TEXT NOT NULL DEFAULT 'pending', completed_at DATETIME,
    created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE approval_panels (id INTEGER PRIMARY KEY AUTOINCREMENT, workflow_id INTEGER NOT NULL,
    panel_name TEXT NOT NULL, rule_type TEXT NOT NULL, required_approvals INTEGER, status TEXT NOT NULL DEFAULT 'awaiting',
    deadline DATETIME, sent_at DATETIME, completed_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE approval_members (id INTEGER PRIMARY KEY AUTOINCREMENT, panel_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL, role TEXT, decision TEXT, comment TEXT, reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(panel_id, user_id));
  CREATE TABLE approval_history (id INTEGER PRIMARY KEY AUTOINCREMENT, workflow_id INTEGER NOT NULL,
    panel_id INTEGER, action TEXT NOT NULL, detail TEXT, performed_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  INSERT INTO users (id, username, password, role, name, email) VALUES
    (1, 'test123', 'x', 'admin', 'Risha Sinha', 'risha@scorecard.com'),
    (2, 'saikumar', 'x', 'employee', 'Sai Kumar', 'sai@example.com'),
    (4, 'ahmedali', 'x', 'admin', 'Ahmed Ali', 'ahmed@scorecard.com'),
    (5, 'ninarao', 'x', 'admin', 'Nina Rao', 'nina@scorecard.com');
  INSERT INTO scorecards (employee_id, applicant_name, email, client, position) VALUES (2, 'Sai Kumar', 'sai@example.com', 'Suez', 'Data Analyst');
`);

(async () => {
  const overridePaths = ['./database', './middleware/auth'].map((p) => require.resolve(p));
  const currentUser = { id: 1, role: 'admin' };
  require.cache[overridePaths[0]] = { exports: db };
  require.cache[overridePaths[1]] = { exports: { authenticate: (req, res, next) => { req.user = currentUser; next(); }, requireRole: () => (req, res, next) => next() } };
  ['./routes/approvals', './routes/decisions'].forEach((p) => delete require.cache[require.resolve(p)]);

  const app = express();
  app.use(express.json());
  app.use('/api/admin', require('./routes/approvals'));
  const server = app.listen(0, '127.0.0.1', async () => {
    const base = `http://127.0.0.1:${server.address().port}/api/admin`;
    const res = await fetch(`${base}/approvals/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: 2, approval_type: 'panel', rule_type: 'any_one', members: [{ user_id: 4 }] }),
    });
    console.log('STATUS', res.status);
    console.log('BODY', await res.text());
    server.close();
    process.exit(0);
  });
})();
