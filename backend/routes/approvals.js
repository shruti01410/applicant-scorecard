const express = require('express');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const { users } = require('../repositories');
const { buildEmailDraft } = require('./decisions');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

const RULE_LABELS = {
  any_one: 'Any one reviewer',
  all: 'All reviewers',
  majority: 'Majority (more than half)',
  custom: 'Custom (n of m)',
};

function safeValue(row, field) {
  return row && row[field] != null ? row[field] : null;
}

function getActiveWorkflow(candidateId) {
  return db.prepare(`
    SELECT * FROM approval_workflows
    WHERE candidate_id = ? AND completed_at IS NULL
    ORDER BY id DESC LIMIT 1
  `).get(candidateId);
}

function getCandidate(candidateId) {
  return users.findEmployeeWithProfile(candidateId);
}

function getPanels(workflowId) {
  return db.prepare('SELECT * FROM approval_panels WHERE workflow_id = ? ORDER BY id').all(workflowId);
}

function getMembers(panelId) {
  return db.prepare(`
    SELECT am.id, am.user_id, am.role, am.decision, am.comment, am.reviewed_at,
           u.name, u.email
    FROM approval_members am
    JOIN users u ON u.id = am.user_id
    WHERE am.panel_id = ?
    ORDER BY am.id
  `).all(panelId);
}

function getHistory(workflowId) {
  return db.prepare(`
    SELECT ah.id, ah.panel_id, ah.action, ah.detail, ah.created_at,
           u.name AS performed_by_name
    FROM approval_history ah
    LEFT JOIN users u ON u.id = ah.performed_by
    WHERE ah.workflow_id = ?
    ORDER BY ah.created_at, ah.id
  `).all(workflowId);
}

function mapHistory(rows) {
  return rows.map((h) => ({
    id: h.id,
    panel_id: h.panel_id,
    action: h.action,
    detail: h.detail,
    created_at: h.created_at,
    performed_by_name: h.performed_by_name || 'System',
  }));
}

function mapPanel(row, workflow) {
  if (!row) return null;
  const members = getMembers(row.id);
  return {
    id: row.id,
    panel_name: row.panel_name,
    rule_type: row.rule_type,
    rule_label: RULE_LABELS[row.rule_type] || row.rule_type,
    required_approvals: row.required_approvals,
    status: row.status,
    deadline: row.deadline,
    sent_at: row.sent_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
    members: members.map((m) => ({
      id: m.id,
      user_id: m.user_id,
      name: m.name,
      email: m.email,
      role: m.role,
      decision: m.decision,
      comment: m.comment,
      reviewed_at: m.reviewed_at,
    })),
  };
}

function mapWorkflow(row) {
  if (!row) return null;
  const panels = getPanels(row.id);
  return {
    id: row.id,
    candidate_id: row.candidate_id,
    approval_type: row.approval_type,
    status: row.status,
    completed_at: row.completed_at,
    created_by: row.created_by,
    created_at: row.created_at,
    health: {
      panels_total: panels.length,
      panels_resolved: panels.filter((p) => p.status !== 'awaiting').length,
      active_panel_id: panels.filter((p) => p.status === 'awaiting').length ? panels.filter((p) => p.status === 'awaiting')[0].id : null,
    },
    panels: panels.map((p) => mapPanel(p)),
  };
}

// Evaluate a panel's rule. count: {approve, reject, hold, total}. Returns the
// new panel status: 'approved' | 'rejected' | 'hold' | 'awaiting'.
function evaluateRule(ruleType, requiredApprovals, count) {
  const { approve, reject, hold, total } = count;
  if (total === 0) return 'awaiting';

  if (ruleType === 'any_one') {
    if (approve >= 1) return 'approved';
    if (reject === total) return 'rejected';
  } else if (ruleType === 'all') {
    if (approve === total) return 'approved';
    if (reject >= 1) return 'rejected';
  } else if (ruleType === 'majority') {
    if (approve > Math.floor(total / 2)) return 'approved';
    if (reject > Math.floor(total / 2)) return 'rejected';
  } else if (ruleType === 'custom') {
    const n = Number(requiredApprovals) || 1;
    if (approve >= n) return 'approved';
    if (reject > total - n) return 'rejected';
  }

  // No rule reached. Only when every member has recorded an opinion and nobody
  // rejected (approve-hold mixture or all-hold) does the panel go to 'hold'
  // (needs re-review). Otherwise it stays 'awaiting'.
  if (approve + reject + hold === total && reject === 0) return 'hold';
  return 'awaiting';
}

// The workflow's status represents the OVERALL state of the approval process.
// Intermediate panel resolutions never complete the workflow: an approved
// panel just passes the candidate to the next stage (status stays 'pending' or
// 'hold'), a rejected panel hard-stops the flow ('rejected', still finalizable
// so the rejection email can be created), and only finalize() sets the
// terminal approved/rejected status with a completed_at timestamp.
function syncWorkflowStatus(workflowId) {
  const workflow = db.prepare('SELECT * FROM approval_workflows WHERE id = ?').get(workflowId);
  if (!workflow) return null;
  if (workflow.completed_at) return workflow.status;

  const panels = getPanels(workflowId);
  if (panels.some((p) => p.status === 'rejected')) {
    db.prepare("UPDATE approval_workflows SET status = 'rejected' WHERE id = ?").run(workflowId);
    return 'rejected';
  }
  const last = panels[panels.length - 1];
  if (last && last.status === 'hold') {
    db.prepare("UPDATE approval_workflows SET status = 'hold' WHERE id = ?").run(workflowId);
    return 'hold';
  }
  db.prepare("UPDATE approval_workflows SET status = 'pending' WHERE id = ?").run(workflowId);
  return 'pending';
}

function logHistory(workflowId, panelId, action, detail, performedBy) {
  db.prepare(`
    INSERT INTO approval_history (workflow_id, panel_id, action, detail, performed_by, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(workflowId, panelId, action, detail, performedBy || null);
}

// Admin users eligible to serve on panels.
router.get('/approvals/admins', (req, res) => {
  const admins = db.prepare("SELECT id, name, email FROM users WHERE role = 'admin' ORDER BY name").all();
  res.json(admins);
});

// Full approval state for a candidate's scorecard page.
router.get('/employees/:id/approval', (req, res) => {
  const emp = getCandidate(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Candidate not found' });

  const workflow = getActiveWorkflow(emp.id);
  const panels = workflow ? getPanels(workflow.id) : [];
  const history = workflow ? getHistory(workflow.id) : [];

  res.json({
    candidate: { id: emp.id, name: emp.name, email: emp.email },
    workflow: workflow ? mapWorkflow(workflow) : null,
    panels: panels.map((p) => mapPanel(p, workflow)),
    history: mapHistory(history),
  });
});

function validateMemberList(members) {
  if (!Array.isArray(members)) return null;
  for (const m of members) {
    const uid = Number(m && m.user_id);
    const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'admin'").get(uid);
    if (!user) return { error: `Panel member user #${uid} does not exist or is not an admin.` };
  }
  return null;
}

function insertPanel(opts) {
  const { workflowId, panelName, ruleType, requiredApprovals, deadline, members, performedBy } = opts;
  const panelInfo = db.prepare(`
    INSERT INTO approval_panels (workflow_id, panel_name, rule_type, required_approvals, deadline, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(workflowId, panelName, ruleType, requiredApprovals, deadline || null);
  const panelId = Number(panelInfo.lastInsertRowid);

  let insertMember = null;
  if (Array.isArray(members)) {
    insertMember = db.prepare('INSERT INTO approval_members (panel_id, user_id, role, created_at) VALUES (?, ?, ?, datetime(\'now\'))');
    for (const m of members) {
      insertMember.run(panelId, Number(m.user_id), String(m.role || '').trim() || null);
    }
  }
  logHistory(workflowId, panelId, 'panel_created',
    `Panel "${panelName}" created (${ruleType} rule, ${Array.isArray(members) ? members.length : 0} members).`,
    performedBy || null);
  return panelId;
}

// Create an approval workflow for a candidate. The first panel is created with
// it (members optional; for approval_type 'single' members are not used).
router.post('/approvals/workflows', (req, res) => {
  const candidateId = Number(req.body.candidate_id);
  const emp = getCandidate(candidateId);
  if (!emp) return res.status(404).json({ error: 'Candidate not found' });

  const existing = getActiveWorkflow(candidateId);
  if (existing) {
    return res.status(409).json({ error: `Active approval workflow already exists for this candidate (workflow #${existing.id}).` });
  }

  const approvalType = req.body.approval_type === 'single' ? 'single' : 'panel';
  const panelName = String(req.body.panel_name || '').trim() || (approvalType === 'single' ? 'Single Review' : 'Review Panel');
  const ruleType = String(req.body.rule_type || 'any_one').trim();
  if (!RULE_LABELS[ruleType]) return res.status(400).json({ error: 'rule_type must be any_one, all, majority or custom.' });
  const requiredApprovals = ruleType === 'custom' ? Number(req.body.required_approvals) : null;
  if (ruleType === 'custom' && (!requiredApprovals || requiredApprovals < 1)) {
    return res.status(400).json({ error: 'required_approvals (n of m) must be at least 1.' });
  }
  const deadline = req.body.deadline ? String(req.body.deadline) : null;
  const members = approvalType === 'panel' ? (req.body.members || []) : [];

  const memberErr = validateMemberList(members);
  if (memberErr) return res.status(400).json({ error: memberErr.error });

  const wf = db.prepare(`
    INSERT INTO approval_workflows (candidate_id, approval_type, status, created_by, created_at)
    VALUES (?, ?, 'pending', ?, datetime('now'))
  `).run(candidateId, approvalType, req.user.id);
  const workflowId = Number(wf.lastInsertRowid);

  logHistory(workflowId, null, 'workflow_created',
    `Approval workflow started (${approvalType} review) for ${emp.name}.`, req.user.id);

  insertPanel({
    workflowId,
    panelName,
    ruleType,
    requiredApprovals,
    deadline,
    members,
    performedBy: req.user.id,
  });

  const workflow = db.prepare('SELECT * FROM approval_workflows WHERE id = ?').get(workflowId);
  res.status(201).json({ workflow: mapWorkflow(workflow) });
});

// Send-to-another-panel: add the next panel to the active workflow.
router.post('/approvals/panels', (req, res) => {
  const candidateId = Number(req.body.candidate_id);
  const emp = getCandidate(candidateId);
  if (!emp) return res.status(404).json({ error: 'Candidate not found' });

  const workflow = getActiveWorkflow(candidateId);
  if (!workflow) return res.status(400).json({ error: 'No active approval workflow for this candidate.' });
  if (workflow.status === 'rejected') {
    return res.status(409).json({ error: 'This workflow was rejected by a panel. No further panels can be added.' });
  }

  const panels = getPanels(workflow.id);
  const last = panels[panels.length - 1];
  if (last && last.status === 'awaiting') {
    return res.status(409).json({ error: 'The current panel has not resolved yet. Resolve it before sending to another panel.' });
  }

  const panelName = String(req.body.panel_name || '').trim();
  if (!panelName) return res.status(400).json({ error: 'panel_name is required.' });
  const ruleType = String(req.body.rule_type || 'any_one').trim();
  if (!RULE_LABELS[ruleType]) return res.status(400).json({ error: 'rule_type must be any_one, all, majority or custom.' });
  const requiredApprovals = ruleType === 'custom' ? Number(req.body.required_approvals) : null;
  if (ruleType === 'custom' && (!requiredApprovals || requiredApprovals < 1)) {
    return res.status(400).json({ error: 'required_approvals (n of m) must be at least 1.' });
  }
  const deadline = req.body.deadline ? String(req.body.deadline) : null;
  const members = Array.isArray(req.body.members) ? req.body.members : [];
  const memberErr = validateMemberList(members);
  if (memberErr) return res.status(400).json({ error: memberErr.error });

  const panelId = insertPanel({
    workflowId: workflow.id,
    panelName,
    ruleType,
    requiredApprovals,
    deadline,
    members,
    performedBy: req.user.id,
  });

  logHistory(workflow.id, panelId,
    'panel_added', `Workflow moved to "${panelName}" (${ruleType} rule).`, req.user.id);

  syncWorkflowStatus(workflow.id);
  const workflowNow = db.prepare('SELECT * FROM approval_workflows WHERE id = ?').get(workflow.id);
  res.status(201).json({ workflow: mapWorkflow(workflowNow) });
});

// Add a panel member to an awaiting panel.
router.post('/approvals/panels/:id/members', (req, res) => {
  const panel = db.prepare('SELECT * FROM approval_panels WHERE id = ?').get(req.params.id);
  if (!panel) return res.status(404).json({ error: 'Panel not found' });
  if (panel.status !== 'awaiting') {
    return res.status(409).json({ error: 'Only awaiting panels can accept new members.' });
  }
  const uid = Number(req.body.user_id);
  const user = db.prepare("SELECT id, name, email FROM users WHERE id = ? AND role = 'admin'").get(uid);
  if (!user) return res.status(400).json({ error: 'Panel member must be an existing admin user.' });

  const role = String(req.body.role || '').trim() || null;
  db.prepare(`
    INSERT INTO approval_members (panel_id, user_id, role)
    VALUES (?, ?, ?)
    ON CONFLICT(panel_id, user_id) DO NOTHING
  `).run(panel.id, uid, role);

  logHistory(panel.workflow_id, panel.id, 'member_added',
    `${user.name} added to "${panel.panel_name}".`, req.user.id);

  syncWorkflowStatus(panel.workflow_id);
  const panelNow = db.prepare('SELECT * FROM approval_panels WHERE id = ?').get(panel.id);
  res.status(201).json({ panel: mapPanel(panelNow) });
});

// Mark an awaiting panel as sent for review.
router.post('/approvals/panels/:id/send', (req, res) => {
  const panel = db.prepare('SELECT * FROM approval_panels WHERE id = ?').get(req.params.id);
  if (!panel) return res.status(404).json({ error: 'Panel not found' });
  if (panel.status !== 'awaiting') {
    return res.status(409).json({ error: 'Only awaiting panels can be sent for review.' });
  }
  db.prepare("UPDATE approval_panels SET sent_at = datetime('now'), status = 'awaiting' WHERE id = ?").run(panel.id);
  logHistory(panel.workflow_id, panel.id, 'panel_sent', `"${panel.panel_name}" was sent for review.`, req.user.id);
  const panelNow = db.prepare('SELECT * FROM approval_panels WHERE id = ?').get(panel.id);
  res.json({ panel: mapPanel(panelNow) });
});

// Re-submit the active panel for review after a hold (clears the hold state).
router.post('/approvals/panels/:id/restart', (req, res) => {
  const panel = db.prepare('SELECT * FROM approval_panels WHERE id = ?').get(req.params.id);
  if (!panel) return res.status(404).json({ error: 'Panel not found' });
  if (panel.status !== 'hold') {
    return res.status(409).json({ error: 'Only held panels can be restarted.' });
  }
  db.prepare("UPDATE approval_panels SET status = 'awaiting', completed_at = NULL WHERE id = ?").run(panel.id);
  db.prepare("UPDATE approval_workflows SET status = 'pending' WHERE id = ?").run(panel.workflow_id);
  logHistory(panel.workflow_id, panel.id, 'panel_restarted', `"${panel.panel_name}" was re-opened for review.`, req.user.id);
  syncWorkflowStatus(panel.workflow_id);
  const panelNow = db.prepare('SELECT * FROM approval_panels WHERE id = ?').get(panel.id);
  res.json({ panel: mapPanel(panelNow) });
});

// A panel member records their individual opinion. Only assigned members may
// review (each reviewer logs in with their own admin account).
router.post('/approvals/panels/:id/review', (req, res) => {
  const panel = db.prepare('SELECT * FROM approval_panels WHERE id = ?').get(req.params.id);
  if (!panel) return res.status(404).json({ error: 'Panel not found' });
  if (panel.status !== 'awaiting') {
    return res.status(409).json({ error: 'This panel has already been resolved.' });
  }

  const membership = db.prepare('SELECT * FROM approval_members WHERE panel_id = ? AND user_id = ?')
    .get(panel.id, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'Only members assigned to this panel may submit a review.' });
  }

  const decision = String(req.body.decision || '').trim();
  if (!['approve', 'reject', 'hold'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approve, reject or hold.' });
  }
  const comment = String(req.body.comment || '').trim() || null;

  db.prepare(`
    UPDATE approval_members SET decision = ?, comment = ?, reviewed_at = datetime('now') WHERE id = ?
  `).run(decision, comment, membership.id);

  logHistory(panel.workflow_id, panel.id, 'member_reviewed',
    `${membership.role ? membership.role + ' ' : ''}opinion: ${decision}${comment ? ' — ' + comment : ''}.`, req.user.id);

  const status = evaluateRule(panel.rule_type, panel.required_approvals, {
    approve: db.prepare("SELECT COUNT(*) AS c FROM approval_members WHERE panel_id = ? AND decision = 'approve'").get(panel.id).c,
    reject: db.prepare("SELECT COUNT(*) AS c FROM approval_members WHERE panel_id = ? AND decision = 'reject'").get(panel.id).c,
    hold: db.prepare("SELECT COUNT(*) AS c FROM approval_members WHERE panel_id = ? AND decision = 'hold'").get(panel.id).c,
    total: db.prepare('SELECT COUNT(*) AS c FROM approval_members WHERE panel_id = ?').get(panel.id).c,
  });

  if (status !== 'awaiting') {
    db.prepare("UPDATE approval_panels SET status = ?, completed_at = datetime('now') WHERE id = ?").run(status, panel.id);
    logHistory(panel.workflow_id, panel.id, 'panel_resolved', `"${panel.panel_name}" resolved as ${status}.`, null);
  } else {
    db.prepare("UPDATE approval_panels SET status = ?, completed_at = NULL WHERE id = ?").run(status, panel.id);
  }

  syncWorkflowStatus(panel.workflow_id);
  const panelNow = db.prepare('SELECT * FROM approval_panels WHERE id = ?').get(panel.id);
  res.json({ panel: mapPanel(panelNow) });
});

// Finalize the workflow. Creates the candidate decision + recruiter-editable
// email draft (reusing the decisions module templates).
router.post('/approvals/:candidateId/finalize', (req, res) => {
  const candidateId = Number(req.params.candidateId);
  const emp = getCandidate(candidateId);
  if (!emp) return res.status(404).json({ error: 'Candidate not found' });

  const workflow = getActiveWorkflow(candidateId);
  if (!workflow) return res.status(409).json({ error: 'No active approval workflow to finalize.' });

  const finalDecision = String(req.body.final_decision || '').trim();
  if (!['approved', 'rejected'].includes(finalDecision)) {
    return res.status(400).json({ error: 'final_decision must be approved or rejected.' });
  }
  const reasonCode = finalDecision === 'rejected' ? String(req.body.reason_code || '').trim() : null;
  if (finalDecision === 'rejected' && !reasonCode) {
    return res.status(400).json({ error: 'A primary rejection reason is required.' });
  }
  if (finalDecision === 'rejected' && !['required_skill_gap', 'experience_mismatch', 'assessment_result', 'other'].includes(reasonCode)) {
    return res.status(400).json({ error: 'Unknown rejection reason code.' });
  }

  db.prepare(`
    UPDATE approval_workflows SET status = ?, completed_at = datetime('now') WHERE id = ?
  `).run(finalDecision, workflow.id);

  logHistory(workflow.id, null, 'finalized',
    `Final decision: ${finalDecision}${reasonCode ? ' (' + reasonCode + ')' : ''}. Email draft created.`, req.user.id);

  const sc = db.prepare('SELECT applicant_name, position, client FROM scorecards WHERE employee_id = ?').get(candidateId) || {};
  const template = buildEmailDraft({
    candidateName: sc.applicant_name || emp.name,
    position: sc.position || '',
    client: sc.client || '',
    decision: finalDecision,
  });

  const feedback = String(req.body.recruiter_feedback || '').trim() || null;
  const jdId = req.body.jd_id ? Number(req.body.jd_id) : null;
  const info = db.prepare(`
    INSERT INTO candidate_decisions (candidate_id, jd_id, decision, reason_code, recruiter_feedback, decided_by, decided_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(candidateId, jdId, finalDecision, reasonCode, feedback, req.user.id);
  const decisionId = Number(info.lastInsertRowid);

  db.prepare("DELETE FROM candidate_emails WHERE candidate_id = ? AND status = 'draft'").run(candidateId);
  const emailInfo = db.prepare(`
    INSERT INTO candidate_emails (candidate_id, decision_id, recipient_email, subject, body, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'draft', datetime('now'))
  `).run(candidateId, decisionId, emp.email, template.subject, template.body);

  require('../audit').logAudit({
    performedBy: req.user.id,
    username: req.user.username,
    action: 'approval_finalized',
    targetType: 'approval_workflow',
    targetId: workflow.id,
    module: 'approvals',
    detail: { candidate_id: candidateId, final_decision: finalDecision, reason_code: reasonCode },
    req,
  });

  const workflowNow = db.prepare('SELECT * FROM approval_workflows WHERE id = ?').get(workflow.id);
  res.status(201).json({
    workflow: mapWorkflow(workflowNow),
    decision: {
      decision: finalDecision,
      reason_code: reasonCode,
      reason_label: reasonCode ? ({ required_skill_gap: 'Required skill gap', experience_mismatch: 'Experience mismatch', assessment_result: 'Assessment result', other: 'Other' }[reasonCode] || reasonCode) : null,
      decided_by: req.user.id,
      decided_at: new Date().toISOString(),
    },
    email: db.prepare('SELECT id, decision_id, recipient_email, subject, body, status, created_at FROM candidate_emails WHERE id = ?').get(Number(emailInfo.lastInsertRowid)),
  });
});

module.exports = router;