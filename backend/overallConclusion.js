const { computeTriNature, CATEGORIES } = require('./triNatureEngine');

const ELEMENT_NAMES = { AGNI: 'Momentum', VAYU: 'Ideation', JALA: 'Connection', AKASHA: 'Perspective' };
const MODE_NAMES = { Sattva: 'Composure', Rajas: 'Energy & Drive', Tamas: 'Change Resistance' };

function buildOverallConclusion({ weightedPct, badge, scores, triNature }) {
  const tri = triNature && triNature.hasProfile ? triNature : null;
  const sig = tri ? tri.signature : null;
  const elems = tri ? tri.elements : null;
  const cats = tri ? tri.categories : null;

  const catEntries = cats ? Object.entries(cats).filter(([,c])=>c.score!=null).sort((a,b)=>b[1].score-a[1].score) : [];
  const catTop = catEntries.slice(0,2);
  const catLow = catEntries.slice(-2).reverse();

  const behavEntries = tri && tri.parameters ? Object.entries(tri.parameters).map(([name, d])=>({ name, score:d.score, label:d.label, light:d.light, shadow:d.shadow, element:d.element })) : [];
  const behavSorted = behavEntries.slice().sort((a,b)=> b.score - a.score);
  const behavTop = behavSorted.slice(0,3);
  const behavLow = behavSorted.slice(-3).reverse();

  const greenFlags = [];
  catTop.forEach(([k,c]) => greenFlags.push({ type:'Category', name:c.name, score:String(c.score), reason:`${c.score}/100 — ${c.desc}` }));
  behavTop.slice(0,2).forEach(p => greenFlags.push({ type:'Behavioral', name:p.name, score:String(p.score), reason:`${p.light} — ${p.label} (${p.score}/100)` }));
  if (!behavTop.length && !catTop.length && sig) sig.lightSignals.forEach(s=> greenFlags.push({ type:'Tri-Nature light', name:s.param, score:String(s.score), reason:s.light }));
  if (!tri) {
    const allParams = (scores || []).slice().sort((a,b)=> (b.score||0)-(a.score||0));
    allParams.slice(0,2).forEach(p => greenFlags.push({ type:'Scorecard', name:p.name || `Param ${p.parameter_id}`, score:`${p.score}/5`, reason:`Highest-rated in evaluation (${p.score}/5)` }));
  }

  const redFlags = [];
  catLow.forEach(([k,c]) => redFlags.push({ type:'Category', name:c.name, score:String(c.score), reason:`${c.score}/100 — ${c.desc} — worth noticing gently` }));
  behavLow.slice(0,2).forEach(p => redFlags.push({ type:'Behavioral', name:p.name, score:String(p.score), reason:`${p.shadow} — ${p.label} (${p.score}/100) — worth noticing gently` }));
  if (!behavLow.length && !catLow.length && sig) sig.growthEdges.forEach(s=> redFlags.push({ type:'Tri-Nature growth', name:s.param, score:String(s.score), reason:s.shadow + ' — worth noticing gently' }));

  const bestParts = [];
  if (catTop.length) bestParts.push(`Strongest categories: ${catTop.map(([k,c])=>`${c.name} (${c.score})`).join(', ')}`);
  if (behavTop.length) bestParts.push(`Strongest behavioral signals: ${behavTop.slice(0,2).map(p=>`${p.name} (${p.score})`).join(', ')}`);
  else if (sig) bestParts.push(`Signature "${sig.name}" (${sig.key}) — ${sig.desc}`);
  if (elems) {
    const topEl = Object.entries(elems).sort((a,b)=>b[1]-a[1])[0];
    bestParts.push(`Dominant element ${ELEMENT_NAMES[topEl[0]] || topEl[0]} (${topEl[1]}/100) — ${topEl[0]==='AGNI'?'drive':topEl[0]==='VAYU'?'ideas':topEl[0]==='JALA'?'empathy':'inner reflection'} leads`);
  }
  if (weightedPct != null) bestParts.push(`Weighted score ${weightedPct}% — ${badge||''} (from 23 parameters)`);

  let verdict = '';
  if (catTop.length) {
    verdict += `Strongest in ${catTop.map(([k,c])=>c.name).join(' and ')} (scores ${catTop.map(([k,c])=>c.score).join('/')}). `;
  } else if (behavTop.length) {
    verdict += `Behaviorally, strongest in ${behavTop.map(p=>p.name).join(', ')} (scores ${behavTop.map(p=>p.score).join('/')}). `;
  } else if (weightedPct != null) {
    if (weightedPct >= 80) verdict += `Evaluation is strong (${weightedPct}%). `;
    else if (weightedPct >= 60) verdict += `Evaluation is balanced (${weightedPct}%). `;
    else if (weightedPct >= 40) verdict += `Evaluation is mixed (${weightedPct}%) — strengths and gaps coexist. `;
    else verdict += `Evaluation leans low (${weightedPct}%) — explore context before deciding. `;
  }
  if (sig) verdict += `${sig.name} suggests ${sig.desc} `;
  const watchCount = redFlags.filter(f=>f.type==='Category'||f.type==='Behavioral').length;
  if (watchCount >= 2) verdict += `A couple of edges (${redFlags.slice(0,2).map(r=>r.name).join(', ')}) invite gentle follow-up. `;
  verdict += `This is a playful reflection — not a hiring signal. Real judgment comes from interview, references, and lived work, not numbers.`;

  const overview = [
    `Green flags: ${greenFlags.slice(0,3).map(g=>g.name).join(', ') || '—'}.`,
    `Worth exploring: ${redFlags.slice(0,3).map(r=>r.name).join(', ') || 'no strong watch items'}.`,
    `Best parts: ${bestParts.slice(0,2).join(' · ')}`,
  ].join(' ');

  return {
    weightedPct, badge,
    greenFlags: greenFlags.slice(0,5),
    redFlags: redFlags.slice(0,5),
    bestParts: bestParts.slice(0,4),
    considerations: redFlags.slice(0,3).map(r=>`${r.name}: ${r.reason}`),
    finalVerdict: verdict.trim(),
    overview,
  };
}

module.exports = { buildOverallConclusion };
