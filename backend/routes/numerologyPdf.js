const express = require('express');
const PDFDocument = require('pdfkit');
const jwt = require('jsonwebtoken');
const { computeTriNature, buildCoreNumbers, CATEGORIES, MASKED_SCENARIOS } = require('../triNatureEngine');
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

const MX = 50;
const PW = 595.28;
const PH = 841.89;
const CW = PW - 2 * MX;
const BTM = PH - 50;

const CAT_COLORS = { Expression: '#6366f1', Attitude: '#f59e0b', Unmasked: '#06b6d4', Personality: '#8b5cf6', 'Soul Urge': '#ec4899', Masked: '#eab308' };
const EL_COLORS = { AGNI: '#e3742f', VAYU: '#a5872f', JALA: '#c7607a', AKASHA: '#3d5df0' };

function bdg(pct) {
  if (pct >= 80) return { label: 'Excellent', color: '#4F8F7D' };
  if (pct >= 60) return { label: 'Good', color: '#3d5df0' };
  if (pct >= 40) return { label: 'Average', color: '#f5a623' };
  return { label: 'Needs Improvement', color: '#B97D68' };
}

function drawBar(doc, x, y, w, h, score, color) {
  doc.save();
  doc.roundedRect(x, y, w, h, h / 2).fill('#eef0f7');
  const bw = Math.max(0, Math.min(w, (Math.min(100, Math.max(0, score)) / 100) * w));
  if (bw > 0) doc.roundedRect(x, y, bw, h, h / 2).fill(color);
  doc.restore();
}

function secTitle(doc, y, text) {
  if (y + 28 > BTM) { doc.addPage(); y = MX; }
  doc.save();
  doc.fontSize(13).fillColor('#1c2333').font('Helvetica-Bold').text(text, MX, y, { width: CW });
  const ly = doc.y + 3;
  doc.moveTo(MX, ly).lineTo(PW - MX, ly).lineWidth(1).strokeColor('#3d5df0').stroke();
  doc.restore();
  return ly + 8;
}

function pb(doc, y, need) {
  if (y + need > BTM) { doc.addPage(); return MX; }
  return y;
}

router.get('/employees/:id/numerology/pdf', authPdf, (req, res) => {
  try {
    const emp = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.params.id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const profile = getProfile(emp.id);
    const name = profile ? (profile.numerology_name || profile.full_name || emp.name) : emp.name;
    const dob = profile ? profile.date_of_birth : null;
    const triNature = computeTriNature(name, dob);
    const tri = triNature.hasProfile ? triNature : null;

    const company = db.prepare('SELECT * FROM company_numerology_profiles ORDER BY id LIMIT 1').get();
    const numoParams = profile ? computeNumoParameters(profile, company) : [];

    const scores = db.prepare(`
      SELECT s.score, p.name as parameter_name
      FROM scores s JOIN parameters p ON p.id = s.parameter_id
      JOIN scorecards sc ON sc.id = s.scorecard_id
      WHERE sc.employee_id = ?
    `).all(emp.id);

    const pct = scores.length ? weightedPct(scores) : null;
    const bdgVal = pct != null ? bdg(pct) : null;

    const conclusion = buildOverallConclusion({ weightedPct: pct, badge: bdgVal ? bdgVal.label : '', scores, triNature });

    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const doc = new PDFDocument({ size: 'A4', margin: MX, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^a-zA-Z0-9]/g, '_')}_report.pdf"`);
    doc.pipe(res);

    // HEADER
    doc.rect(0, 0, PW, 80).fill('#1B1D25');
    doc.fontSize(20).fillColor('#ffffff').font('Helvetica-Bold').text('Inner Intelligence Report', MX, 20, { width: CW });
    doc.fontSize(11).fillColor('#C79A4B').font('Helvetica').text(`${name}  |  ${dob || 'No DOB'}  |  ${today}`, MX, 48, { width: CW });

    let y = 100;

    // SCORE BADGE (always on top)
    if (pct != null && pct > 0 && bdgVal) {
      doc.save();
      doc.roundedRect(MX, y, CW, 52, 8).fill(bdgVal.color);
      doc.fontSize(28).fillColor('#ffffff').font('Helvetica-Bold').text(`${pct}%`, MX, y + 8, { width: CW, align: 'center' });
      doc.fontSize(11).fillColor('#ffffff').font('Helvetica').text(bdgVal.label, MX, y + 34, { width: CW, align: 'center' });
      doc.restore();
      y += 65;
    }

    // CORE SIGNATURE
    if (tri && tri.signature) {
      y = secTitle(doc, y, 'CORE SIGNATURE');
      const sig = tri.signature;
      doc.save();
      doc.roundedRect(MX, y, CW, 45, 8).fill('#f2f5ff');
      doc.fontSize(14).fillColor('#3d5df0').font('Helvetica-Bold').text(sig.name, MX + 12, y + 10, { width: CW - 24 });
      doc.fontSize(9).fillColor('#5c6580').font('Helvetica').text(sig.desc || '', MX + 12, y + 28, { width: CW - 24 });
      doc.restore();
      y += 55;
    }

    // 6 CATEGORIES
    if (tri && tri.categories) {
      y = secTitle(doc, y, '6 CATEGORIES');
      const cats = Object.entries(tri.categories);
      const halfW = (CW - 10) / 2;
      const catH = 50;
      const catGap = 8;
      cats.forEach(([key, cat], i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const cx = MX + col * (halfW + 10);
        const cy = y + row * (catH + catGap);
        doc.save();
        doc.roundedRect(cx, cy, halfW, catH, 6).fill('#f9fafc').strokeColor('#eceef5').lineWidth(0.5).stroke();
        doc.fontSize(10).fillColor('#1c2333').font('Helvetica-Bold').text(cat.name, cx + 10, cy + 6, { width: halfW - 80 });
        if (cat.score != null) {
          doc.fontSize(11).fillColor(cat.score >= 70 ? '#2f7a52' : cat.score >= 40 ? '#a4700e' : '#8892a8').font('Helvetica-Bold').text(`${cat.score}`, cx + halfW - 50, cy + 5, { width: 40, align: 'right' });
          drawBar(doc, cx + 10, cy + 26, halfW - 20, 8, cat.score, CAT_COLORS[key] || '#3d5df0');
        } else {
          doc.fontSize(8).fillColor('#8892a8').font('Helvetica-Oblique').text('Interview-only', cx + halfW - 75, cy + 6, { width: 65, align: 'right' });
        }
        doc.fontSize(7.5).fillColor('#8892a8').font('Helvetica').text(cat.desc || '', cx + 10, cy + 38, { width: halfW - 20 });
        doc.restore();
      });
      y += Math.ceil(cats.length / 2) * (catH + catGap) + 10;
    }

    // BEHAVIORAL DRIVERS (bar graphs, no element names)
    if (tri && tri.parameters) {
      y = secTitle(doc, y, 'BEHAVIORAL DRIVERS');
      const sorted = Object.entries(tri.parameters).sort((a, b) => b[1].score - a[1].score);
      sorted.forEach(([pname, p]) => {
        y = pb(doc, y, 18);
        doc.save();
        doc.fontSize(8).fillColor('#1c2333').font('Helvetica-Bold').text(pname, MX, y, { width: 130 });
        doc.fontSize(7.5).fillColor('#8892a8').font('Helvetica').text(`${p.score}/100`, MX + 135, y + 1, { width: 35 });
        drawBar(doc, MX + 175, y + 1, 275, 7, p.score, EL_COLORS[p.element] || '#3d5df0');
        doc.restore();
        y += 12;
        if (p.light || p.shadow) {
          doc.save();
          doc.fontSize(7).fillColor('#5c6580').font('Helvetica-Oblique');
          const lt = p.light ? `+ ${p.light}` : '';
          const st = p.shadow ? `! ${p.shadow}` : '';
          doc.text(`${lt}  ${st}`.trim(), MX + 10, y, { width: CW - 20 });
          doc.restore();
          y = doc.y + 3;
        }
      });
      y += 6;
    }

    // DEEPER PARAMETERS
    if (numoParams.length) {
      y = secTitle(doc, y, 'DEEPER PARAMETERS');
      const avg = numoParams.reduce((s, p) => s + p.score, 0) / numoParams.length;
      doc.save();
      doc.roundedRect(MX, y, CW, 22, 4).fill('#f2f5ff');
      doc.fontSize(9).fillColor('#3d5df0').font('Helvetica-Bold').text(`${Math.round(avg)}/100 avg`, MX + 8, y + 5, { width: CW - 16 });
      doc.restore();
      y += 28;

      numoParams.forEach(p => {
        y = pb(doc, y, 18);
        doc.save();
        doc.fontSize(8).fillColor('#1c2333').font('Helvetica-Bold').text(p.name, MX, y, { width: 200 });
        doc.fontSize(7.5).fillColor('#8892a8').font('Helvetica').text(`${p.score}/5 \u00b7 ${p.outcome || p.resonance || ''}`, MX + 205, y + 1, { width: 150 });
        drawBar(doc, MX + 360, y + 1, 90, 7, p.score * 20, '#C79A4B');
        doc.restore();
        y += 14;
      });
      y += 8;
    }

    // INTERVIEW PREP
    if (tri && tri.maskedTraits && tri.maskedTraits.length) {
      y = secTitle(doc, y, 'INTERVIEW PREP');
      tri.maskedTraits.forEach((m) => {
        y = pb(doc, y, 48);
        doc.save();
        doc.roundedRect(MX, y, CW, 44, 6).fill('#fff8ef').strokeColor('#f2e2c4').lineWidth(0.5).stroke();
        doc.fontSize(10).fillColor('#a4700e').font('Helvetica-Bold').text(m.trait, MX + 12, y + 6, { width: CW - 24 });
        doc.fontSize(9).fillColor('#3c4457').font('Helvetica').text(m.prompt, MX + 12, y + 22, { width: CW - 24 });
        doc.restore();
        y += 52;
      });
    }

    // OVERALL CONCLUSION (always last)
    if (conclusion) {
      y = secTitle(doc, y, 'OVERALL CONCLUSION');

      if (conclusion.greenFlags && conclusion.greenFlags.length) {
        doc.save();
        doc.fontSize(10).fillColor('#2f7a52').font('Helvetica-Bold').text('Green Flags', MX, y, { width: CW });
        y = doc.y + 3;
        conclusion.greenFlags.forEach(g => {
          y = pb(doc, y, 14);
          doc.fontSize(8).fillColor('#3c4457').font('Helvetica').text(`\u2022 ${g.name} (${g.score}) \u2014 ${g.reason}`, MX, y, { width: CW - 20 });
          y = doc.y + 2;
        });
        doc.restore();
        y += 6;
      }

      if (conclusion.redFlags && conclusion.redFlags.length) {
        doc.save();
        doc.fontSize(10).fillColor('#a4700e').font('Helvetica-Bold').text('Worth Exploring', MX, y, { width: CW });
        y = doc.y + 3;
        conclusion.redFlags.forEach(r => {
          y = pb(doc, y, 14);
          doc.fontSize(8).fillColor('#3c4457').font('Helvetica').text(`\u2022 ${r.name} (${r.score}) \u2014 ${r.reason}`, MX, y, { width: CW - 20 });
          y = doc.y + 2;
        });
        doc.restore();
        y += 6;
      }

      if (conclusion.bestParts && conclusion.bestParts.length) {
        doc.save();
        doc.fontSize(10).fillColor('#C79A4B').font('Helvetica-Bold').text('Best Parts', MX, y, { width: CW });
        y = doc.y + 3;
        conclusion.bestParts.forEach(b => {
          y = pb(doc, y, 14);
          doc.fontSize(8).fillColor('#3c4457').font('Helvetica').text(`\u2022 ${b}`, MX, y, { width: CW - 20 });
          y = doc.y + 2;
        });
        doc.restore();
        y += 6;
      }

      if (conclusion.finalVerdict) {
        y = pb(doc, y, 70);
        doc.save();
        doc.roundedRect(MX, y, CW, 55, 8).fill('#f7f8fc');
        doc.fontSize(10).fillColor('#1c2333').font('Helvetica-Bold').text('Final Verdict', MX + 12, y + 8, { width: CW - 24 });
        doc.fontSize(8).fillColor('#3c4457').font('Helvetica').text(conclusion.finalVerdict, MX + 12, y + 22, { width: CW - 24 });
        doc.restore();
        y += 65;
      }
    }

    // FOOTER
    doc.save();
    doc.fontSize(7).fillColor('#aaaaaa').font('Helvetica-Oblique').text(
      'This is a playful reflection \u2014 not a hiring signal. Real judgment comes from interview, references, and lived work, not numbers.',
      MX, BTM, { width: CW, align: 'center' }
    );
    doc.restore();

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

module.exports = router;
