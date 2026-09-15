const express = require('express');
const PDFDocument = require('pdfkit');
const jwt = require('jsonwebtoken');
const { computeTriNature, buildCoreNumbers } = require('../triNatureEngine');
const { computeNumoParameters } = require('../numerologyUtils');
const { buildOverallConclusion } = require('../overallConclusion');
const { weightedPct } = require('../scoreUtils');
const db = require('../database');

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

function getProfile(employeeId) {
  const profile = db.prepare('SELECT * FROM numerology_profiles WHERE employee_id = ? AND dimension = ?').get(employeeId, 'candidate');
  if (profile) return profile;
  const u = db.prepare('SELECT date_of_birth, name FROM users WHERE id = ?').get(employeeId);
  if (u && u.date_of_birth) {
    try {
      const tri = computeTriNature(u.name, u.date_of_birth);
      if (tri && tri.hasProfile && tri.core) {
        db.prepare('INSERT OR REPLACE INTO numerology_profiles (employee_id, dimension, date_of_birth, life_path_number, birth_number, expression_number, soul_urge_number, personality_number, attitude_number, full_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          employeeId, 'candidate', u.date_of_birth, tri.core.lifePath, tri.core.birthDay, tri.core.expression, tri.core.soulUrge, tri.core.personality, tri.core.attitude, u.name
        );
        return db.prepare('SELECT * FROM numerology_profiles WHERE employee_id = ? AND dimension = ?').get(employeeId, 'candidate');
      }
    } catch (e) {}
  }
  return null;
}

const MARGIN = 50;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const BOTTOM = PAGE_H - 50;

const ELEMENT_COLORS = { AGNI: '#e3742f', VAYU: '#a5872f', JALA: '#c7607a', AKASHA: '#3d5df0' };
const ELEMENT_NAMES = { AGNI: 'Momentum', VAYU: 'Ideation', JALA: 'Connection', AKASHA: 'Perspective' };
const CAT_COLORS = { Expression: '#6366f1', Attitude: '#f59e0b', Unmasked: '#06b6d4', Personality: '#8b5cf6', 'Soul Urge': '#ec4899', Masked: '#eab308' };

function getBadge(pct) {
  if (pct >= 80) return { label: 'Excellent', color: '#4F8F7D' };
  if (pct >= 60) return { label: 'Good', color: '#3d5df0' };
  if (pct >= 40) return { label: 'Average', color: '#f5a623' };
  return { label: 'Needs Improvement', color: '#B97D68' };
}

function drawScoreBar(doc, x, y, w, h, score, color) {
  doc.save();
  doc.roundedRect(x, y, w, h, h / 2).fill('#eef0f7');
  const barW = Math.max(0, Math.min(w, (Math.min(100, Math.max(0, score)) / 100) * w));
  if (barW > 0) doc.roundedRect(x, y, barW, h, h / 2).fill(color);
  doc.restore();
}

function drawSectionTitle(doc, y, title) {
  doc.save();
  doc.fontSize(14).fillColor('#1c2333').font('Helvetica-Bold').text(title, MARGIN, y, { width: CONTENT_W });
  y = doc.y + 4;
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).lineWidth(1).strokeColor('#3d5df0').stroke();
  doc.restore();
  return y + 10;
}

router.get('/employees/:id/numerology/pdf', authPdf, (req, res) => {
  try {
    const emp = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.params.id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const profile = getProfile(emp.id);
    const name = profile ? (profile.numerology_name || profile.full_name || emp.name) : emp.name;
    const dob = profile ? profile.date_of_birth : null;

    const triNature = computeTriNature(name, dob);
    const core = triNature.core || buildCoreNumbers(name, dob);

    const company = db.prepare('SELECT * FROM company_numerology_profiles ORDER BY id LIMIT 1').get();
    const numoParams = profile ? computeNumoParameters(profile, company) : [];

    const scores = db.prepare(`
      SELECT s.score, p.name as parameter_name
      FROM scores s JOIN parameters p ON p.id = s.parameter_id
      JOIN scorecards sc ON sc.id = s.scorecard_id
      WHERE sc.employee_id = ?
    `).all(emp.id);

    const pct = scores.length ? weightedPct(scores) : null;
    const badge = pct != null ? getBadge(pct) : null;

    const conclusion = buildOverallConclusion({ weightedPct: pct, badge: badge ? badge.label : '', scores, triNature });

    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^a-zA-Z0-9]/g, '_')}_report.pdf"`);
    doc.pipe(res);

    doc.rect(0, 0, PAGE_W, 80).fill('#1B1D25');
    doc.fontSize(20).fillColor('#ffffff').font('Helvetica-Bold').text('Inner Intelligence Report', MARGIN, 20, { width: CONTENT_W });
    doc.fontSize(11).fillColor('#C79A4B').font('Helvetica').text(`${name}  |  ${dob || 'No DOB'}  |  ${today}`, MARGIN, 48, { width: CONTENT_W });

    let y = 100;

    if (pct != null && pct > 0 && badge) {
      doc.save();
      doc.roundedRect(MARGIN, y, CONTENT_W, 52, 8).fill(badge.color);
      doc.fontSize(28).fillColor('#ffffff').font('Helvetica-Bold').text(`${pct}%`, MARGIN, y + 8, { width: CONTENT_W, align: 'center' });
      doc.fontSize(11).fillColor('#ffffff').font('Helvetica').text(badge.label, MARGIN, y + 34, { width: CONTENT_W, align: 'center' });
      doc.restore();
      y += 65;
    }

    if (core.lifePath || core.expression) {
      y = drawSectionTitle(doc, y, 'CORE NUMBERS');
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

      const cellW = 115;
      const cellH = 38;
      const gap = 10;
      const cols = 4;
      nums.forEach((n, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const nx = MARGIN + col * (cellW + gap);
        const ny = y + row * (cellH + gap);
        doc.save();
        doc.roundedRect(nx, ny, cellW, cellH, 6).fill('#f2f5ff');
        doc.fontSize(9).fillColor('#8892a8').font('Helvetica').text(n.label, nx + 8, ny + 6, { width: cellW - 16 });
        doc.fontSize(16).fillColor('#3d5df0').font('Helvetica-Bold').text(String(n.value), nx + 8, ny + 20, { width: cellW - 16 });
        doc.restore();
      });
      y += Math.ceil(nums.length / cols) * (cellH + gap) + 12;
      doc.y = y;
    }

    if (triNature.signature) {
      y = drawSectionTitle(doc, y, 'SIGNATURE');
      const sig = triNature.signature;
      doc.save();
      doc.roundedRect(MARGIN, y, CONTENT_W, 50, 8).fill('#f2f5ff');
      doc.fontSize(13).fillColor('#3d5df0').font('Helvetica-Bold').text(sig.name, MARGIN + 12, y + 8, { width: CONTENT_W - 24 });
      doc.fontSize(9).fillColor('#5c6580').font('Helvetica').text(sig.desc, MARGIN + 12, y + 26, { width: CONTENT_W - 24 });
      doc.restore();
      y += 60;
      doc.y = y;
    }

    if (triNature.categories) {
      y = drawSectionTitle(doc, y, '6 CATEGORIES');
      const cats = Object.entries(triNature.categories);
      const halfW = (CONTENT_W - 10) / 2;
      const catH = 50;
      const catGap = 8;
      cats.forEach(([key, cat], i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const cx = MARGIN + col * (halfW + 10);
        const cy = y + row * (catH + catGap);
        if (cy + catH > BOTTOM) { doc.addPage(); y = MARGIN; }

        doc.save();
        doc.roundedRect(cx, cy, halfW, catH, 6).fill('#f9fafc').strokeColor('#eceef5').lineWidth(0.5).stroke();
        doc.fontSize(10).fillColor('#1c2333').font('Helvetica-Bold').text(cat.name, cx + 10, cy + 6, { width: halfW - 80 });
        if (cat.score != null) {
          doc.fontSize(11).fillColor(cat.score >= 70 ? '#2f7a52' : cat.score >= 40 ? '#a4700e' : '#8892a8').font('Helvetica-Bold').text(`${cat.score}`, cx + halfW - 50, cy + 5, { width: 40, align: 'right' });
          drawScoreBar(doc, cx + 10, cy + 26, halfW - 20, 8, cat.score, CAT_COLORS[key] || '#3d5df0');
        } else {
          doc.fontSize(8).fillColor('#8892a8').font('Helvetica-Oblique').text('Interview-only', cx + halfW - 75, cy + 6, { width: 65, align: 'right' });
        }
        doc.fontSize(7.5).fillColor('#8892a8').font('Helvetica').text(cat.desc || '', cx + 10, cy + 38, { width: halfW - 20 });
        doc.restore();
      });
      y += Math.ceil(cats.length / 2) * (catH + catGap) + 10;
      doc.y = y;
    }

    if (triNature.maskedTraits && triNature.maskedTraits.length) {
      y = drawSectionTitle(doc, y, 'MASKED TRAITS \u2014 INTERVIEW SCENARIOS');
      triNature.maskedTraits.forEach((m) => {
        if (y + 50 > BOTTOM) { doc.addPage(); y = MARGIN; }
        doc.save();
        doc.roundedRect(MARGIN, y, CONTENT_W, 44, 6).fill('#fff8ef').strokeColor('#f2e2c4').lineWidth(0.5).stroke();
        doc.fontSize(10).fillColor('#a4700e').font('Helvetica-Bold').text(m.trait, MARGIN + 12, y + 6, { width: CONTENT_W - 24 });
        doc.fontSize(9).fillColor('#3c4457').font('Helvetica').text(m.prompt, MARGIN + 12, y + 22, { width: CONTENT_W - 24 });
        doc.restore();
        y += 52;
      });
      y += 8;
      doc.y = y;
    }

    if (triNature.elements) {
      y = drawSectionTitle(doc, y, 'ELEMENT SCORES');
      Object.entries(triNature.elements).sort((a, b) => b[1] - a[1]).forEach(([el, score]) => {
        if (y + 20 > BOTTOM) { doc.addPage(); y = MARGIN; }
        doc.save();
        doc.fontSize(10).fillColor('#3c4457').font('Helvetica-Bold').text(ELEMENT_NAMES[el] || el, MARGIN, y, { width: 120 });
        doc.fontSize(9).fillColor('#8892a8').font('Helvetica').text(`${score}/100`, MARGIN + 125, y + 1, { width: 45 });
        drawScoreBar(doc, MARGIN + 175, y + 2, 280, 10, score, ELEMENT_COLORS[el] || '#3d5df0');
        doc.restore();
        y += 22;
      });
      y += 10;
      doc.y = y;
    }

    if (triNature.parameters) {
      y = drawSectionTitle(doc, y, 'BEHAVIORAL PARAMETERS');
      Object.entries(triNature.parameters).sort((a, b) => b[1].score - a[1].score).forEach(([pname, p]) => {
        if (y + 16 > BOTTOM) { doc.addPage(); y = MARGIN; }
        doc.save();
        doc.fontSize(8).fillColor('#1c2333').font('Helvetica-Bold').text(pname, MARGIN, y, { width: 140 });
        doc.fontSize(7.5).fillColor('#8892a8').font('Helvetica').text(`${p.score}/100`, MARGIN + 145, y + 1, { width: 40 });
        drawScoreBar(doc, MARGIN + 190, y + 1, 260, 7, p.score, ELEMENT_COLORS[p.element] || '#3d5df0');
        doc.restore();
        y += 14;
      });
      y += 10;
      doc.y = y;
    }

    if (numoParams.length) {
      y = drawSectionTitle(doc, y, 'NUMEROLOGY LENSES');
      numoParams.forEach(p => {
        if (y + 16 > BOTTOM) { doc.addPage(); y = MARGIN; }
        doc.save();
        doc.fontSize(8).fillColor('#1c2333').font('Helvetica-Bold').text(p.name, MARGIN, y, { width: 200 });
        doc.fontSize(7.5).fillColor('#8892a8').font('Helvetica').text(`${p.score}/5 \u00b7 ${p.outcome || p.resonance || ''}`, MARGIN + 205, y + 1, { width: 150 });
        drawScoreBar(doc, MARGIN + 360, y + 1, 90, 7, p.score * 20, '#C79A4B');
        doc.restore();
        y += 14;
      });
      y += 10;
      doc.y = y;
    }

    if (conclusion) {
      y = drawSectionTitle(doc, y, 'OVERALL CONCLUSION');

      if (conclusion.greenFlags && conclusion.greenFlags.length) {
        doc.save();
        doc.fontSize(10).fillColor('#2f7a52').font('Helvetica-Bold').text('Green Flags', MARGIN, y, { width: CONTENT_W });
        y = doc.y + 4;
        conclusion.greenFlags.forEach(g => {
          if (y + 14 > BOTTOM) { doc.addPage(); y = MARGIN; }
          doc.fontSize(8).fillColor('#3c4457').font('Helvetica').text(`\u2022 ${g.name} (${g.score}) \u2014 ${g.reason}`, MARGIN, y, { width: CONTENT_W - 20 });
          y = doc.y + 3;
        });
        doc.restore();
        y += 8;
      }

      if (conclusion.redFlags && conclusion.redFlags.length) {
        doc.save();
        doc.fontSize(10).fillColor('#a4700e').font('Helvetica-Bold').text('Worth Exploring', MARGIN, y, { width: CONTENT_W });
        y = doc.y + 4;
        conclusion.redFlags.forEach(r => {
          if (y + 14 > BOTTOM) { doc.addPage(); y = MARGIN; }
          doc.fontSize(8).fillColor('#3c4457').font('Helvetica').text(`\u2022 ${r.name} (${r.score}) \u2014 ${r.reason}`, MARGIN, y, { width: CONTENT_W - 20 });
          y = doc.y + 3;
        });
        doc.restore();
        y += 8;
      }

      if (conclusion.bestParts && conclusion.bestParts.length) {
        doc.save();
        doc.fontSize(10).fillColor('#C79A4B').font('Helvetica-Bold').text('Best Parts', MARGIN, y, { width: CONTENT_W });
        y = doc.y + 4;
        conclusion.bestParts.forEach(b => {
          if (y + 14 > BOTTOM) { doc.addPage(); y = MARGIN; }
          doc.fontSize(8).fillColor('#3c4457').font('Helvetica').text(`\u2022 ${b}`, MARGIN, y, { width: CONTENT_W - 20 });
          y = doc.y + 3;
        });
        doc.restore();
        y += 8;
      }

      if (conclusion.finalVerdict) {
        if (y + 70 > BOTTOM) { doc.addPage(); y = MARGIN; }
        doc.save();
        doc.roundedRect(MARGIN, y, CONTENT_W, 60, 8).fill('#f7f8fc');
        doc.fontSize(10).fillColor('#1c2333').font('Helvetica-Bold').text('Final Verdict', MARGIN + 12, y + 8, { width: CONTENT_W - 24 });
        doc.fontSize(8).fillColor('#3c4457').font('Helvetica').text(conclusion.finalVerdict, MARGIN + 12, y + 24, { width: CONTENT_W - 24 });
        doc.restore();
        y += 70;
      }
      doc.y = y;
    }

    doc.save();
    doc.fontSize(7).fillColor('#aaaaaa').font('Helvetica-Oblique').text(
      'This is a playful reflection \u2014 not a hiring signal. Real judgment comes from interview, references, and lived work, not numbers.',
      MARGIN, BOTTOM, { width: CONTENT_W, align: 'center' }
    );
    doc.restore();

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

module.exports = router;
