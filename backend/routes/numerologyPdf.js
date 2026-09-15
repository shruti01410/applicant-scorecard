const express = require('express');
const PDFDocument = require('pdfkit');
const jwt = require('jsonwebtoken');
const { computeTriNature, buildCoreNumbers } = require('../triNatureEngine');
const { computeNumoParameters } = require('../numerologyUtils');
const { buildOverallConclusion } = require('../overallConclusion');
const { getProfile, getWeights } = require('../database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'scorecard-secret-key';

function authPdf(req, res, next) {
  const token = req.query.token || (req.headers.authorization && req.headers.authorization.slice(7));
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

const ELEMENT_COLORS = { AGNI: '#e3742f', VAYU: '#a5872f', JALA: '#c7607a', AKASHA: '#3d5df0' };
const ELEMENT_NAMES = { AGNI: 'Momentum', VAYU: 'Ideation', JALA: 'Connection', AKASHA: 'Perspective' };
const CAT_COLORS = { Expression: '#6366f1', Attitude: '#f59e0b', Unmasked: '#06b6d4', Personality: '#8b5cf6', 'Soul Urge': '#ec4899', Masked: '#eab308' };

function drawHeader(doc, name, date) {
  doc.rect(0, 0, doc.page.width, 90).fill('#1B1D25');
  doc.fontSize(22).fillColor('#ffffff').font('Helvetica-Bold').text('Inner Intelligence Report', 40, 28, { align: 'left' });
  doc.fontSize(11).fillColor('#C79A4B').font('Helvetica').text(`${name} — ${date}`, 40, 58);
  doc.moveDown(2);
}

function drawSectionTitle(doc, title, y) {
  doc.fontSize(13).fillColor('#1c2333').font('Helvetica-Bold').text(title, 40, y);
  doc.moveTo(40, y + 18).lineTo(doc.page.width - 40, y + 18).lineWidth(0.5).strokeColor('#e7eaf3').stroke();
  return y + 28;
}

function drawScoreBar(doc, x, y, w, h, score, color) {
  doc.roundedRect(x, y, w, h, 3).fill('#eef0f7');
  const barW = Math.max(0, Math.min(w, (score / 100) * w));
  if (barW > 0) doc.roundedRect(x, y, barW, h, 3).fill(color);
}

function drawWrappedText(doc, text, x, y, maxW, opts = {}) {
  const { fontSize = 10, color = '#3c4457', font = 'Helvetica', bold = false } = opts;
  doc.fontSize(fontSize).fillColor(color).font(bold ? 'Helvetica-Bold' : font);
  return doc.text(text, x, y, { width: maxW, lineGap: 2 });
}

function getBadge(weightedPct) {
  if (weightedPct >= 80) return { label: 'Excellent', color: '#4F8F7D' };
  if (weightedPct >= 60) return { label: 'Good', color: '#3d5df0' };
  if (weightedPct >= 40) return { label: 'Average', color: '#f5a623' };
  return { label: 'Needs Improvement', color: '#B97D68' };
}

router.get('/employees/:id/numerology/pdf', authPdf, (req, res) => {
  const db = require('../database').db;
  const emp = db.prepare('SELECT id, applicant_name, email FROM users WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const profile = getProfile(emp.id);
  const name = profile ? (profile.numerology_name || profile.full_name || emp.applicant_name) : emp.applicant_name;
  const dob = profile ? profile.date_of_birth : null;

  const triNature = computeTriNature(name, dob);
  const core = triNature.core || buildCoreNumbers(name, dob);

  const company = db.prepare('SELECT * FROM company_numerology_profiles ORDER BY id LIMIT 1').get();
  const numoParams = profile ? computeNumoParameters(profile, company) : [];

  const scorecard = db.prepare('SELECT weighted_pct FROM scorecards WHERE employee_id = ? ORDER BY id DESC LIMIT 1').get(emp.id);
  const weightedPct = scorecard ? scorecard.weighted_pct : null;
  const badge = weightedPct != null ? getBadge(weightedPct) : null;

  const scores = db.prepare(`
    SELECT s.score, p.name as parameter_name
    FROM scores s JOIN parameters p ON p.id = s.parameter_id
    JOIN scorecards sc ON sc.id = s.scorecard_id
    WHERE sc.employee_id = ?
  `).all(emp.id);

  const conclusion = buildOverallConclusion({ weightedPct, badge: badge ? badge.label : '', scores, triNature });

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^a-zA-Z0-9]/g, '_')}_inner_intelligence_report.pdf"`);
  doc.pipe(res);

  drawHeader(doc, name, today);

  let y = 110;

  if (weightedPct != null && badge) {
    doc.roundedRect(doc.page.width - 160, 20, 110, 40, 8).fill(badge.color);
    doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold').text(`${weightedPct}%`, doc.page.width - 160, 26, { width: 110, align: 'center' });
    doc.fontSize(9).fillColor('#ffffff').font('Helvetica').text(badge.label, doc.page.width - 160, 48, { width: 110, align: 'center' });
  }

  if (weightedPct != null) {
    doc.fontSize(10).fillColor('#5c6580').font('Helvetica').text(`Weighted Score: ${weightedPct}% — ${badge ? badge.label : '—'}`, 40, y);
    y += 18;
  }

  if (core.lifePath) {
    y = drawSectionTitle(doc, 'CORE NUMBERS', y);
    const nums = [
      { label: 'Life Path', value: core.lifePath },
      { label: 'Birth Day', value: core.birthDay },
      { label: 'Expression', value: core.expression },
      { label: 'Soul Urge', value: core.soulUrge },
      { label: 'Personality', value: core.personality },
      { label: 'Attitude', value: core.attitude },
      { label: 'Maturity', value: core.maturity },
      { label: 'Balance', value: core.balance },
    ].filter(n => n.value != null);

    const colW = 130;
    nums.forEach((n, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const nx = 40 + col * colW;
      const ny = y + row * 32;
      doc.roundedRect(nx, ny, colW - 10, 26, 6).fill('#f2f5ff');
      doc.fontSize(9).fillColor('#8892a8').font('Helvetica').text(n.label, nx + 8, ny + 4, { width: colW - 26 });
      doc.fontSize(13).fillColor('#3d5df0').font('Helvetica-Bold').text(String(n.value), nx + 8, ny + 14, { width: colW - 26 });
    });
    y += Math.ceil(nums.length / 4) * 32 + 10;
  }

  if (triNature.signature) {
    y = drawSectionTitle(doc, 'SIGNATURE', y);
    doc.roundedRect(40, y, doc.page.width - 80, 50, 8).fill('#f2f5ff');
    doc.fontSize(14).fillColor('#3d5df0').font('Helvetica-Bold').text(triNature.signature.name, 52, y + 8, { width: doc.page.width - 104 });
    doc.fontSize(10).fillColor('#5c6580').font('Helvetica').text(triNature.signature.desc, 52, y + 28, { width: doc.page.width - 104 });
    y += 60;
  }

  if (triNature.triguna) {
    y = drawSectionTitle(doc, 'DRIVE MODES', y);
    const triguna = triNature.triguna;
    const modes = [
      { label: 'Composure (Sattva)', value: triguna.Sattva, color: '#5da88f' },
      { label: 'Energy & Drive (Rajas)', value: triguna.Rajas, color: '#e3a13d' },
      { label: 'Change Resistance (Tamas)', value: triguna.Tamas, color: '#c7607a' },
    ];
    modes.forEach((m, i) => {
      const mx = 40;
      const my = y + i * 20;
      doc.fontSize(9).fillColor('#5c6580').font('Helvetica').text(`${m.label}: ${m.value}%`, mx, my, { width: 180 });
      drawScoreBar(doc, mx + 185, my + 2, 200, 10, m.value, m.color);
    });
    y += modes.length * 20 + 10;
  }

  if (triNature.categories) {
    y = drawSectionTitle(doc, '6 CATEGORIES', y);
    const cats = Object.entries(triNature.categories);
    const colW = (doc.page.width - 80) / 2;
    cats.forEach(([key, cat], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = 40 + col * colW;
      const cy = y + row * 58;
      doc.roundedRect(cx, cy, colW - 8, 50, 6).fill('#f9fafc').strokeColor('#eceef5').lineWidth(0.5).stroke();
      doc.fontSize(11).fillColor('#1c2333').font('Helvetica-Bold').text(cat.name, cx + 8, cy + 6, { width: colW - 50 });
      if (cat.score != null) {
        doc.fontSize(10).fillColor(cat.score >= 70 ? '#2f7a52' : cat.score >= 40 ? '#a4700e' : '#8892a8').font('Helvetica-Bold').text(`${cat.score}/100`, cx + colW - 55, cy + 6, { width: 40, align: 'right' });
        drawScoreBar(doc, cx + 8, cy + 26, colW - 26, 8, cat.score, CAT_COLORS[key] || '#3d5df0');
      } else {
        doc.fontSize(9).fillColor('#8892a8').font('Helvetica-Oblique').text('Interview-only', cx + colW - 70, cy + 6, { width: 60, align: 'right' });
      }
      doc.fontSize(8).fillColor('#8892a8').font('Helvetica').text(cat.desc || '', cx + 8, cy + 36, { width: colW - 26 });
    });
    y += Math.ceil(cats.length / 2) * 58 + 10;
  }

  if (triNature.categories && triNature.categories.Masked && triNature.categories.Masked.params) {
    y = drawSectionTitle(doc, 'MASKED TRAITS — INTERVIEW SCENARIOS', y);
    const scenarios = triNature.maskedTraits || [];
    scenarios.forEach((m, i) => {
      if (y > doc.page.height - 100) { doc.addPage(); y = 50; }
      doc.roundedRect(40, y, doc.page.width - 80, 42, 6).fill('#fff8ef').strokeColor('#f2e2c4').lineWidth(0.5).stroke();
      doc.fontSize(10).fillColor('#a4700e').font('Helvetica-Bold').text(m.trait, 52, y + 6, { width: doc.page.width - 104 });
      doc.fontSize(9).fillColor('#3c4457').font('Helvetica').text(m.prompt, 52, y + 20, { width: doc.page.width - 104 });
      y += 50;
    });
    y += 10;
  }

  if (triNature.elements) {
    if (y > doc.page.height - 150) { doc.addPage(); y = 50; }
    y = drawSectionTitle(doc, 'ELEMENT SCORES', y);
    const els = Object.entries(triNature.elements).sort((a, b) => b[1] - a[1]);
    els.forEach(([el, score]) => {
      if (y > doc.page.height - 60) { doc.addPage(); y = 50; }
      doc.fontSize(10).fillColor('#3c4457').font('Helvetica-Bold').text(`${ELEMENT_NAMES[el] || el}: ${score}/100`, 40, y, { width: 200 });
      drawScoreBar(doc, 250, y + 2, 250, 10, score, ELEMENT_COLORS[el] || '#3d5df0');
      y += 20;
    });
    y += 10;
  }

  if (triNature.parameters) {
    if (y > doc.page.height - 150) { doc.addPage(); y = 50; }
    y = drawSectionTitle(doc, 'BEHAVIORAL PARAMETERS', y);
    const params = Object.entries(triNature.parameters).sort((a, b) => b[1].score - a[1].score);
    params.forEach(([pname, p]) => {
      if (y > doc.page.height - 50) { doc.addPage(); y = 50; }
      doc.fontSize(9).fillColor('#1c2333').font('Helvetica-Bold').text(`${pname}`, 40, y, { width: 160 });
      doc.fontSize(8).fillColor('#8892a8').font('Helvetica').text(`${p.score}/100 · ${p.light || ''}`, 200, y, { width: 200 });
      drawScoreBar(doc, 410, y + 2, 130, 8, p.score, ELEMENT_COLORS[p.element] || '#3d5df0');
      y += 16;
    });
    y += 10;
  }

  if (numoParams.length) {
    if (y > doc.page.height - 150) { doc.addPage(); y = 50; }
    y = drawSectionTitle(doc, 'NUMEROLOGY LENSES', y);
    numoParams.forEach(p => {
      if (y > doc.page.height - 50) { doc.addPage(); y = 50; }
      doc.fontSize(9).fillColor('#1c2333').font('Helvetica-Bold').text(`${p.name}`, 40, y, { width: 200 });
      doc.fontSize(8).fillColor('#8892a8').font('Helvetica').text(`${p.score}/5 · ${p.outcome || p.resonance || ''}`, 240, y, { width: 200 });
      drawScoreBar(doc, 450, y + 2, 80, 8, p.score * 20, '#C79A4B');
      y += 16;
    });
    y += 10;
  }

  if (conclusion) {
    if (y > doc.page.height - 200) { doc.addPage(); y = 50; }
    y = drawSectionTitle(doc, 'OVERALL CONCLUSION', y);

    if (conclusion.greenFlags && conclusion.greenFlags.length) {
      doc.fontSize(10).fillColor('#2f7a52').font('Helvetica-Bold').text('Green Flags', 40, y);
      y += 14;
      conclusion.greenFlags.forEach(g => {
        doc.fontSize(9).fillColor('#3c4457').font('Helvetica').text(`• ${g.name} (${g.score}) — ${g.reason}`, 52, y, { width: doc.page.width - 104 });
        y += 14;
      });
      y += 6;
    }

    if (conclusion.redFlags && conclusion.redFlags.length) {
      doc.fontSize(10).fillColor('#a4700e').font('Helvetica-Bold').text('Worth Exploring', 40, y);
      y += 14;
      conclusion.redFlags.forEach(r => {
        doc.fontSize(9).fillColor('#3c4457').font('Helvetica').text(`• ${r.name} (${r.score}) — ${r.reason}`, 52, y, { width: doc.page.width - 104 });
        y += 14;
      });
      y += 6;
    }

    if (conclusion.bestParts && conclusion.bestParts.length) {
      doc.fontSize(10).fillColor('#C79A4B').font('Helvetica-Bold').text('Best Parts', 40, y);
      y += 14;
      conclusion.bestParts.forEach(b => {
        doc.fontSize(9).fillColor('#3c4457').font('Helvetica').text(`• ${b}`, 52, y, { width: doc.page.width - 104 });
        y += 14;
      });
      y += 6;
    }

    if (conclusion.finalVerdict) {
      if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
      doc.roundedRect(40, y, doc.page.width - 80, 50, 8).fill('#f7f8fc');
      doc.fontSize(10).fillColor('#1c2333').font('Helvetica-Bold').text('Final Verdict', 52, y + 8, { width: doc.page.width - 104 });
      doc.fontSize(9).fillColor('#3c4457').font('Helvetica').text(conclusion.finalVerdict, 52, y + 22, { width: doc.page.width - 104 });
      y += 60;
    }
  }

  const disclaimerY = Math.max(y + 20, doc.page.height - 50);
  if (disclaimerY > doc.page.height - 50) { doc.addPage(); }
  doc.fontSize(8).fillColor('#8892a8').font('Helvetica-Oblique').text(
    'This is a playful reflection — not a hiring signal. Real judgment comes from interview, references, and lived work, not numbers.',
    40, Math.min(disclaimerY, doc.page.height - 40), { width: doc.page.width - 80, align: 'center' }
  );

  doc.end();
});

module.exports = router;
