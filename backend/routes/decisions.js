const express = require('express');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

const REASON_CODES = {
  required_skill_gap: 'Required skill gap',
  experience_mismatch: 'Experience mismatch',
  assessment_result: 'Assessment result',
  other: 'Other',
};

function safeParse(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch (e) { return null; }
}

function getEmployee(id) {
  return db.prepare('SELECT id, name, email, job_description_id, resume_text, capability_match_detail FROM users WHERE id = ? AND role = ?').get(id, 'employee');
}

function getLatestDecision(candidateId) {
  return db.prepare(`
    SELECT cd.*, cu.name AS decided_by_name, jd.title AS jd_title
    FROM candidate_decisions cd
    LEFT JOIN users cu ON cu.id = cd.decided_by
    LEFT JOIN job_descriptions jd ON jd.id = cd.jd_id
    WHERE cd.candidate_id = ?
    ORDER BY cd.decided_at DESC, cd.id DESC
    LIMIT 1
  `).get(candidateId);
}

function mapDecision(row) {
  if (!row) return null;
  return {
    id: row.id,
    decision: row.decision,
    reason_code: row.reason_code,
    reason_label: row.reason_code ? (REASON_CODES[row.reason_code] || row.reason_code) : null,
    recruiter_feedback: row.recruiter_feedback,
    evidence_snapshot: safeParse(row.evidence_snapshot),
    decided_by: row.decided_by,
    decided_by_name: row.decided_by_name || `User #${row.decided_by}`,
    decided_at: row.decided_at,
    jd_id: row.jd_id,
    jd_title: row.jd_title,
  };
}

function getLatestDraft(candidateId) {
  return db.prepare(`
    SELECT id, decision_id, subject, body, status, created_at
    FROM candidate_emails
    WHERE candidate_id = ? AND status = 'draft'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(candidateId);
}

// Evidence-based rejection suggestions. Derived only from documented,
// job-related evidence. Never from numerology/astrology.
function buildEvidenceSuggestions(candidateId) {
  const emp = getEmployee(candidateId);
  if (!emp) return [];
  const suggestions = [];

  let detail = null;
  try { detail = emp.capability_match_detail ? JSON.parse(emp.capability_match_detail) : null; } catch (e) {}
  if (detail && Array.isArray(detail.missing) && detail.missing.length) {
    const skills = detail.missing.slice(0, 5);
    suggestions.push({
      reason_code: 'required_skill_gap',
      label: 'Required skill gap',
      summary: `The resume does not provide sufficient evidence of the required ${skills.join(', ')} experience.`,
      evidence: skills,
      source: 'JD ↔ Resume capability match',
    });
  }

  try {
    const { analyzeResume } = require('../resumeIntegrityAnalyzer');
    if (emp.resume_text && String(emp.resume_text).trim()) {
      const result = analyzeResume(emp.resume_text);
      if (result.detectedFlags && result.detectedFlags.length) {
        result.detectedFlags.slice(0, 3).forEach((f) => {
          suggestions.push({
            reason_code: 'assessment_result',
            label: 'Resume integrity flag',
            summary: `${f.analysis || f.flag_type || f.status} (confidence ${f.confidence}%)`,
            evidence: Array.isArray(f.evidence) ? f.evidence.map((e) => (typeof e === 'string' ? e : e.text || e.source || '')) : [],
            source: 'Resume integrity analyzer',
          });
        });
      }
    }
  } catch (e) {}

  const sc = db.prepare('SELECT id FROM scorecards WHERE employee_id = ?').get(candidateId);
  if (sc) {
    const low = db.prepare(`
      SELECT p.name, s.score FROM scores s
      JOIN parameters p ON p.id = s.parameter_id
      WHERE s.scorecard_id = ? AND s.score <= 2
      ORDER BY s.score, p.name LIMIT 3
    `).all(sc.id);
    if (low.length) {
      suggestions.push({
        reason_code: 'assessment_result',
        label: 'Low-rated evaluation',
        summary: `Recorded evaluation shows low scores in: ${low.map((r) => `${r.name} (${r.score}/5)`).join(', ')}.`,
        evidence: low.map((r) => `${r.name}: ${r.score}/5`),
        source: 'Scorecard evaluation',
      });
    }
  }

  return suggestions;
}

function buildEmailDraft({ candidateName, position, client, decision }) {
  const org = client || 'our company';
  const role = position || 'the position';
  const subject = `Update on Your Application — ${org}`;
  const recipientName = candidateName || 'there';
  const salutation = `Dear ${recipientName},`;
  let body;
  if (decision === 'approved') {
    body = [
      salutation,
      '',
      `Thank you for your interest in the ${role} at ${org}.`,
      '',
      'We are pleased to inform you that your application has been selected to proceed to the next stage of our recruitment process.',
      '',
      'Our team will share the next steps and relevant details with you shortly.',
      '',
      'Best regards,',
      '[Recruiter Name]',
      org,
    ].join('\n');
  } else {
    body = [
      salutation,
      '',
      `Thank you for your interest in the ${role} at ${org} and for taking the time to participate in our recruitment process.`,
      '',
      'After careful consideration, we have decided not to proceed with your application for this position at this time.',
      '',
      'We appreciate your interest and wish you all the best in your future opportunities.',
      '',
      'Best regards,',
      '[Recruiter Name]',
      org,
    ].join('\n');
  }
  return { subject, body };
}

// Decision Center dashboard: every candidate + latest decision + latest draft.
router.get('/decisions', (req, res) => {
  const candidates = db.prepare(`
    SELECT u.id AS candidate_id, u.name, u.email, u.job_description_id,
           sc.id AS scorecard_id, sc.applicant_name, sc.position, sc.client
    FROM users u
    LEFT JOIN scorecards sc ON sc.employee_id = u.id
    WHERE u.role = 'employee'
    ORDER BY u.name
  `).all();

  const out = candidates.map((c) => {
    const latest = mapDecision(getLatestDecision(c.candidate_id));
    const draft = getLatestDraft(c.candidate_id);
    return {
      candidate_id: c.candidate_id,
      applicant_name: c.applicant_name || c.name,
      email: c.email,
      position: c.position || '',
      client: c.client || '',
      scorecard_id: c.scorecard_id || null,
      job_description_id: c.job_description_id || null,
      latest,
      draft: draft || null,
    };
  });

  const summary = { approved: 0, rejected: 0, pending: 0 };
  for (const r of out) {
    if (!r.latest) summary.pending += 1;
    else if (r.latest.decision === 'approved') summary.approved += 1;
    else summary.rejected += 1;
  }
  res.json({ summary, candidates: out });
});

// Single candidate decision + draft (used by the scorecard page).
router.get('/employees/:id/decision', (req, res) => {
  const emp = getEmployee(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Candidate not found' });
  res.json({ decision: mapDecision(getLatestDecision(emp.id)), draft: getLatestDraft(emp.id) });
});

// Evidence-based rejection reason suggestions (recruiter must confirm).
router.get('/decisions/evidence/:id', (req, res) => {
  const emp = getEmployee(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Candidate not found' });
  res.json({
    suggestions: buildEvidenceSuggestions(emp.id),
    disclaimer: 'Suggested reasons come from documented, job-related evidence only. The recruiter must confirm accuracy before finalizing. Numerology and astrology are never used as a basis for rejection.',
  });
});

// Record a decision and generate a recruiter-editable email draft.
router.post('/decisions', (req, res) => {
  const candidateId = Number(req.body.candidate_id);
  const decision = String(req.body.decision || '').trim();
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be "approved" or "rejected"' });
  }
  const emp = getEmployee(candidateId);
  if (!emp) return res.status(404).json({ error: 'Candidate not found' });

  const reasonCode = decision === 'rejected' ? String(req.body.reason_code || '').trim() : null;
  if (decision === 'rejected' && !reasonCode) {
    return res.status(400).json({ error: 'A primary rejection reason is required.' });
  }
  if (decision === 'rejected' && !REASON_CODES[reasonCode]) {
    return res.status(400).json({ error: 'Unknown rejection reason code.' });
  }
  const jdId = req.body.jd_id ? Number(req.body.jd_id) : (emp.job_description_id || null);
  const feedback = String(req.body.recruiter_feedback || '').trim() || null;
  const evidenceSnapshot = Array.isArray(req.body.evidence_snapshot) ? JSON.stringify(req.body.evidence_snapshot) : null;

  const info = db.prepare(`
    INSERT INTO candidate_decisions (candidate_id, jd_id, decision, reason_code, recruiter_feedback, evidence_snapshot, decided_by, decided_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(candidateId, jdId, decision, reasonCode, feedback, evidenceSnapshot, req.user.id);
  const decisionId = Number(info.lastInsertRowid);

  // Replace stale drafts so the email always reflects the latest decision.
  db.prepare("DELETE FROM candidate_emails WHERE candidate_id = ? AND status = 'draft'").run(candidateId);

  const sc = db.prepare('SELECT applicant_name, position, client FROM scorecards WHERE employee_id = ?').get(candidateId) || {};
  const template = buildEmailDraft({
    candidateName: sc.applicant_name || emp.name,
    position: sc.position || '',
    client: sc.client || '',
    decision,
  });
  const emailInfo = db.prepare(`
    INSERT INTO candidate_emails (candidate_id, decision_id, recipient_email, subject, body, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'draft', datetime('now'))
  `).run(candidateId, decisionId, emp.email, template.subject, template.body);

  res.status(201).json({
    decision: mapDecision(getLatestDecision(candidateId)),
    email: db.prepare('SELECT id, decision_id, recipient_email, subject, body, status, created_at FROM candidate_emails WHERE id = ?').get(Number(emailInfo.lastInsertRowid)),
  });
});

// Recruiter edits an email draft (subject/body). Drafts are never sent here.
router.patch('/decisions/email-drafts/:id', (req, res) => {
  const draft = db.prepare('SELECT * FROM candidate_emails WHERE id = ? AND status = ?').get(req.params.id, 'draft');
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  const subject = req.body.subject != null ? String(req.body.subject).trim() : draft.subject;
  const body = req.body.body != null ? String(req.body.body) : draft.body;
  if (!subject) return res.status(400).json({ error: 'Subject is required.' });
  if (!body || !String(body).trim()) return res.status(400).json({ error: 'Body is required.' });
  db.prepare(`
    UPDATE candidate_emails SET subject = ?, body = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?
  `).run(subject, body, req.user.id, req.params.id);
  res.json(db.prepare('SELECT id, decision_id, recipient_email, subject, body, status, reviewed_by, reviewed_at, created_at FROM candidate_emails WHERE id = ?').get(req.params.id));
});

// Explicitly disabled in this build: drafts-first scope. Recruiters copy the
// draft and send from their email client until a provider is configured.
router.post('/decisions/email-drafts/:id/send', (req, res) => {
  const draft = db.prepare('SELECT id FROM candidate_emails WHERE id = ? AND status = ?').get(req.params.id, 'draft');
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  res.status(400).json({ error: 'Email sending is disabled in this build. Review and copy the draft, then send it from your email client.' });
});

module.exports = router;
module.exports.REASON_CODES = REASON_CODES;
module.exports.buildEvidenceSuggestions = buildEvidenceSuggestions;
module.exports.buildEmailDraft = buildEmailDraft;