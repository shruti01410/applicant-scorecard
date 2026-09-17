const LETTER_VALUES = {
  a: 1, j: 1, s: 1,
  b: 2, k: 2, t: 2,
  c: 3, l: 3, u: 3,
  d: 4, m: 4, v: 4,
  e: 5, n: 5, w: 5,
  f: 6, o: 6, x: 6,
  g: 7, p: 7, y: 7,
  h: 8, q: 8, z: 8,
  i: 9, r: 9,
};

const MASTER_NUMBERS = new Set([11, 22, 33]);

function reduceDigits(n, { keepMaster = false } = {}) {
  let value = Math.max(0, Number(n) || 0);
  while (value > 9) {
    if (keepMaster && MASTER_NUMBERS.has(value)) break;
    value = String(value).split('').reduce((sum, d) => sum + Number(d), 0);
  }
  return value;
}

function digitSum(str) {
  return String(str).split('').reduce((sum, ch) => sum + (Number.isNaN(Number(ch)) ? 0 : Number(ch)), 0);
}

function lifePathNumber(isoDob) {
  if (!isoDob) return null;
  const [year, month, day] = isoDob.split('-').map(Number);
  if (!year || !month || !day) return null;
  const total = digitSum(String(day)) + digitSum(String(month)) + digitSum(String(year));
  return reduceDigits(total, { keepMaster: true });
}

function birthNumber(isoDob) {
  if (!isoDob) return null;
  const day = Number(isoDob.split('-')[2]);
  if (!day) return null;
  return reduceDigits(day, { keepMaster: true });
}

function personalYearNumber(isoDob, targetYear) {
  if (!isoDob || !targetYear) return null;
  const parts = isoDob.split('-').map(Number);
  const month = parts[1];
  const day = Number(isoDob.split('-')[2]);
  if (!month || !day) return null;
  const total = digitSum(String(day)) + digitSum(String(month)) + digitSum(String(targetYear));
  return reduceDigits(total, { keepMaster: false });
}

function foundedNumber(foundedYear) {
  if (!foundedYear) return null;
  return reduceDigits(digitSum(String(foundedYear)), { keepMaster: false });
}

function nameNumber(fullName, { keepMaster = false } = {}) {
  if (!fullName) return null;
  const total = String(fullName).toLowerCase().split('').reduce((sum, ch) => sum + (LETTER_VALUES[ch] || 0), 0);
  return reduceDigits(total, { keepMaster });
}

const WEIGHTS = Object.freeze({ dob: 0.7, name: 0.3 });

function dobComponent(lifePath, birthNumber) {
  return Math.round((lifePath || 0) * 0.8 + (birthNumber || 0) * 0.2);
}

function compositePersonalNumber(lifePath, birthNumber, expressionNumber) {
  const dobPart = dobComponent(lifePath, birthNumber);
  const raw = dobPart * WEIGHTS.dob + (expressionNumber || 0) * WEIGHTS.name;
  return Math.min(9, Math.max(1, Math.round(raw)));
}

function companyEcho(candidateNumber, companyNumber) {
  const { outcomeFor } = require('./numerologyOutcome');
  if (candidateNumber == null || companyNumber == null) return { label: 'Neutral', diff: null, tone: 'neutral' };
  const diff = Math.abs(candidateNumber - companyNumber);
  const { tone, label } = outcomeFor(diff);
  return { label, diff, tone };
}

function foundedNumberWithSteps(foundedYear) {
  const s = String(foundedYear);
  const sum = digitSum(s);
  const value = reduceDigits(sum, { keepMaster: false });
  const digits = s.split('').join('+');
  const steps = sum !== value ? `${digits} = ${sum} → ${String(sum).split('').join('+')} = ${value}` : `${digits} = ${value}`;
  return { value, steps, raw: s };
}

function nameNumberWithSteps(fullName) {
  const letters = String(fullName).toLowerCase().split('').filter(ch => LETTER_VALUES[ch]);
  const parts = letters.map(ch => `${ch.toUpperCase()}=${LETTER_VALUES[ch]}`).join(', ');
  const total = letters.reduce((sum, ch) => sum + LETTER_VALUES[ch], 0);
  const value = reduceDigits(total, { keepMaster: false });
  const steps = total !== value ? `${parts} → sum ${total} → ${String(total).split('').join('+')} = ${value}` : `${parts} → ${value}`;
  return { value, steps, raw: fullName };
}

const KEYWORDS = {
  1: { name: 'Initiator', theme: 'fresh starts, independence, momentum' },
  2: { name: 'Partner', theme: 'cooperation, diplomacy, relationship-building' },
  3: { name: 'Communicator', theme: 'expression, storytelling, persuasion' },
  4: { name: 'Builder', theme: 'structure, discipline, reliability' },
  5: { name: 'Adventurer', theme: 'change, adaptability, versatility' },
  6: { name: 'Anchor', theme: 'steadiness, responsibility, showing up for others' },
  7: { name: 'Analyst', theme: 'reflection, research, going deeper' },
  8: { name: 'Achiever', theme: 'visible results, recognition, material progress' },
  9: { name: 'Completer', theme: 'service at scale, wide reach, closing chapters' },
};

function companySupportNarrative(candidateNumber, companyNumber, echo) {
  const cand = KEYWORDS[candidateNumber];
  const comp = KEYWORDS[companyNumber];
  if (!cand || !comp || !echo) return '';
  const relationLine = {
    'Good': `Their current theme (${cand.name}) is close to the company's core number — this is the strongest numerical proximity this lens tracks.`,
    'Neutral': `Their current theme (${cand.name}) and the company's core number (${comp.name}) are not especially close this year — neutral, not a mismatch signal.`,
    'Worth exploring': `Their current theme (${cand.name}) sits far from the company's core number (${comp.name}) — worth a question in conversation, not a filter.`,
  }[echo.label] || '';
  return `${cand.name} (${candidateNumber}) — ${cand.theme} — vs. ${comp.name} (${companyNumber}) — ${comp.theme}. ${relationLine}`;
}

const PARAM_NUMEROLOGY = {
  'Communication': 3,
  'Technical Skills': 7,
  'Problem Solving': 7,
  'Attitude': 2,
  'Teamwork': 2,
  'Adaptability': 5,
  'Experience Relevance': 8,
  'Education & Certifications': 7,
  'Cultural Fit': 6,
  'Leadership Potential': 1,
  'Urgency / Availability': 5,
  'Growth Mindset': 1,
  'Reliability': 4,
  'Client-Specific Skills': 8,
  'Industry Knowledge': 4,
  'Salary Expectations': 8,
  'Interview Performance': 3,
  'Presentation Skills': 3,
  'Analytical Abilities': 7,
  'Initiative': 1,
  'Professionalism': 4,
  'Schedule Flexibility': 5,
  'Overall Impression': 9,
};

function paramNumerologyFit(score, paramName, lifePath, personalYear) {
  const base = Math.round((score / 5) * 100);
  const paramNum = PARAM_NUMEROLOGY[paramName] || 5;
  if (lifePath == null) return { base, adjusted: base, paramNum, bonus: 0, resonance: '—' };
  const normLife = lifePath > 9 ? reduceDigits(lifePath, { keepMaster: false }) : lifePath;
  const diffLife = Math.abs(paramNum - normLife);
  const diffPY = personalYear != null ? Math.abs(paramNum - personalYear) : 99;
  let bonus = 0;
  const { outcomeFor } = require('./numerologyOutcome');
  const { label: resonance } = outcomeFor(diffLife);
  if (diffLife === 0) bonus += 12;
  else if (diffLife === 1) bonus += 6;
  else if (diffLife >= 4) bonus -= 6;
  if (diffPY === 0) bonus += 5;
  else if (diffPY === 1) bonus += 3;
  const adjusted = Math.max(10, Math.min(100, base + bonus));
  return { base, adjusted, paramNum, bonus, resonance, diffLife, diffPY };
}

const NUMO_PARAMETERS = [
  { key: 'stillness', name: 'Stillness in Company', number: 7, keyword: 'Analyst', desc: 'How naturally calm and grounded the person feels inside the team — does their presence steady the room?', human: 'A 7-like calm steadies meetings; a 5-like buzz brings movement. Neither is better — it’s about what the team needs this year.' },
  { key: 'luck', name: 'Luck & Fortune Flow', number: 8, keyword: 'Achiever', desc: 'How easily opportunities and timing seem to line up — the “wind at your back” feeling.', human: 'An 8 year often feels lucky with results and recognition; a 4 year feels lucky through steady building.' },
  { key: 'harmony', name: 'Harmony with Company Core', number: 2, keyword: 'Partner', desc: 'How smoothly personal rhythm blends with the company’s fixed Founded Number — the daily “we just get each other” factor.', human: 'Think ensemble vs solo — 2 and 6 harmonize quickly, 1 and 5 need more negotiation.' },
  { key: 'destiny', name: 'Destiny Momentum', number: 1, keyword: 'Initiator', desc: 'A symbolic comparison of the name-based Expression number with the company Founded Number, or Life Path when no company is set.', human: 'Smaller number differences score higher, with a master-number adjustment for 11/22/33. Reflection, not a prediction or a hiring signal.' },
  { key: 'karmic', name: 'Karmic Balance', number: 6, keyword: 'Anchor', desc: 'Sense of responsibility and steadiness — do they naturally carry weight for others and keep promises?', human: '6 carries the “show-up-for-others” energy; 3 and 5 feel lighter and more expressive.' },
  { key: 'intuition', name: 'Intuitive Clarity', number: 11, keyword: 'Seer', desc: 'How often gut feeling lines up with good calls — kept as master 11 when Life/Birth is 11/22.', human: '11 is the classic “seer” signal — vision that needs grounding to be useful.' },
];

function computeNumoParameters(profile, company, candidateName = '') {
  if (!profile || !profile.life_path_number) return NUMO_PARAMETERS.map(p => ({ ...p, score: 3, basis: 'Need DOB to personalize — showing neutral 3/5.', resonance: 'Neutral', outcome: 'Neutral', tone: 'neutral', diff: null }));
  const lifePath = profile.life_path_number;
  const birth = profile.birth_number;
  const normLife = lifePath > 9 ? reduceDigits(lifePath, { keepMaster: false }) : lifePath;
  const normBirth = birth > 9 ? reduceDigits(birth, { keepMaster: false }) : birth;
  const personalYear = profile.date_of_birth ? personalYearNumber(profile.date_of_birth, new Date().getFullYear()) : null;
  const companyNum = company && company.founded_number != null ? company.founded_number : (company && company.founded_year ? foundedNumber(company.founded_year) : null);
  const validExpression = value => Number.isInteger(value) && ((value >= 1 && value <= 9) || MASTER_NUMBERS.has(value));
  const nameExpression = nameNumber(profile.numerology_name || profile.full_name || candidateName, { keepMaster: true });
  const expr = validExpression(profile.expression_number) ? profile.expression_number : (validExpression(nameExpression) ? nameExpression : null);
  const composite = compositePersonalNumber(lifePath, birth, expr);
  const normComposite = composite > 9 ? reduceDigits(composite, { keepMaster: false }) : composite;
  const normExpr = expr > 9 ? reduceDigits(expr, { keepMaster: false }) : expr;
  return NUMO_PARAMETERS.map(p => {
    let targetNum = p.number;
    let diffLife = Math.abs(targetNum - normLife);
    let diffBirth = Math.abs(targetNum - normBirth);
    let diffPY = personalYear != null ? Math.abs(targetNum - personalYear) : 99;
    let diffCompany = companyNum != null ? Math.abs(targetNum - companyNum) : 99;
    let diffComposite = Math.abs(targetNum - normComposite);
    let diffExpr = Math.abs(targetNum - normExpr);
    let score = 3;
    let reasons = [];
    let diffForOutcome = null;
    if (p.key === 'stillness') {
      // Stillness = how grounded the person feels inside THIS company
      // PY gives personal energy, company gives environment energy
      const diffPYCompany = companyNum != null ? Math.abs(personalYear - companyNum) : 99;
      if (companyNum == null) {
        // Fallback: use PY alone
        if (personalYear === 7 || personalYear === 2 || personalYear === 6) score = 5;
        else if (personalYear === 4) score = 4;
        else if (personalYear === 5 || personalYear === 8) score = 2;
        else score = 3;
      } else {
        // Score by how PY resonates with company energy
        if (diffPYCompany <= 1) score = 5;
        else if (diffPYCompany <= 2) score = 4;
        else if (diffPYCompany <= 3) score = 3;
        else score = 2;
      }
      diffForOutcome = score === 5 || score === 4 ? 0 : score === 3 ? 2 : 5;
      reasons.push(companyNum != null ? `PY ${personalYear} vs Company ${companyNum} (Δ${diffPYCompany}) — personal year resonance with company` : `Personal Year ${personalYear} → ${PERSONAL_YEAR_THEMES[personalYear] ? PERSONAL_YEAR_THEMES[personalYear].theme : '—'} (no company set)`);
    } else if (p.key === 'luck') {
      // Luck = how easily opportunities line up between candidate and company
      const diffLPCompany = companyNum != null ? Math.abs(normLife - companyNum) : 99;
      const diffPYCompany = companyNum != null ? Math.abs(personalYear - companyNum) : 99;
      if (companyNum == null) {
        // Fallback: LP/PY vs target 8
        if (diffLife === 0 || diffPY === 0) score = 5;
        else if (diffLife === 1 || diffPY === 1) score = 4;
        else if (diffLife >= 4 && diffPY >= 4) score = 2;
        else score = 3;
        reasons.push(`Life Path ${lifePath} vs ${targetNum} (Δ${diffLife}), PY ${personalYear} vs ${targetNum} (Δ${diffPY}) — no company`);
      } else {
        // Score by candidate-company alignment
        const minDiff = Math.min(diffLPCompany, diffPYCompany);
        if (minDiff === 0) score = 5;
        else if (minDiff === 1) score = 4;
        else if (minDiff <= 3) score = 3;
        else score = 2;
        diffForOutcome = minDiff;
        reasons.push(`LP ${lifePath} vs Company ${companyNum} (Δ${diffLPCompany}), PY ${personalYear} vs Company ${companyNum} (Δ${diffPYCompany})`);
      }
      if (diffForOutcome === null) diffForOutcome = Math.min(diffLife, diffPY);
    } else if (p.key === 'harmony') {
      // Harmony = composite personal number vs company founded number
      const diffHarmony = companyNum != null ? Math.abs(normComposite - companyNum) : 99;
      if (companyNum == null) score = 3;
      else if (diffHarmony === 0) score = 5;
      else if (diffHarmony === 1) score = 4;
      else if (diffHarmony >= 4) score = 2;
      else score = 3;
      diffForOutcome = diffHarmony;
      reasons.push(companyNum != null ? `Composite ${composite} vs Company ${companyNum} (Δ${diffHarmony}) — same as Trajectory Alignment` : 'No company number yet');
    } else if (p.key === 'destiny') {
      if (expr == null) return { ...p, score: 3, basis: 'Name-based Expression number unavailable — showing neutral 3/5, not a calculated score.', resonance: 'Neutral', outcome: 'Neutral', tone: 'neutral', diff: null };
      // Destiny = how well expression energy aligns with company direction
      const rawExpr = expr;
      const isMasterExpr = rawExpr === 11 || rawExpr === 22 || rawExpr === 33;
      const diffExprLP = Math.abs(normExpr - normLife);
      const alignedWithLP = diffExprLP <= 1;
      if (companyNum == null) {
        // Fallback: expression vs life path
        if (isMasterExpr && alignedWithLP) score = 5;
        else if (isMasterExpr) score = 4;
        else if (alignedWithLP) score = 4;
        else if (diffExprLP <= 2) score = 3;
        else score = 2;
        reasons.push(`Expression ${expr} (→${normExpr}) vs Life Path ${lifePath} (→${normLife}) (Δ${diffExprLP})${isMasterExpr ? ' — master momentum' : ''} — no company`);
      } else {
        // Score by expression-company alignment
        const diffExprCompany = Math.abs(normExpr - companyNum);
        if (isMasterExpr && diffExprCompany <= 1) score = 5;
        else if (isMasterExpr) score = 4;
        else if (diffExprCompany === 0) score = 5;
        else if (diffExprCompany === 1) score = 4;
        else if (diffExprCompany <= 2) score = 3;
        else score = 2;
        diffForOutcome = diffExprCompany;
        reasons.push(`Expression ${expr} (→${normExpr}) vs Company ${companyNum} (Δ${diffExprCompany})${isMasterExpr ? ' — master momentum' : ''}`);
      }
      if (diffForOutcome === null) diffForOutcome = isMasterExpr ? 0 : alignedWithLP ? 1 : diffExprLP;
    } else if (p.key === 'karmic') {
      // Karmic = responsibility resonance between candidate and company
      const isKarmicBirth = birth === 6 || birth === 11 || birth === 22;
      if (companyNum == null) {
        // Fallback: birth vs target 6
        if (isKarmicBirth) score = 5;
        else if (normBirth === 6) score = 4;
        else if (diffBirth >= 4) score = 2;
        else score = 3;
        reasons.push(`Birth Number ${birth} (→${normBirth}) vs 6 — no company`);
      } else {
        // Score by birth-company karmic alignment
        const diffBirthCompany = Math.abs(normBirth - companyNum);
        if (isKarmicBirth && diffBirthCompany <= 1) score = 5;
        else if (isKarmicBirth) score = 4;
        else if (diffBirthCompany === 0) score = 5;
        else if (diffBirthCompany === 1) score = 4;
        else if (diffBirthCompany <= 2) score = 3;
        else score = 2;
        diffForOutcome = diffBirthCompany;
        reasons.push(`Birth ${birth} (→${normBirth}) vs Company ${companyNum} (Δ${diffBirthCompany})`);
      }
      if (diffForOutcome === null) diffForOutcome = diffBirth;
    } else if (p.key === 'intuition') {
      // Intuition = how well intuitive capacity serves the company
      const isMaster11 = birth === 11 || lifePath === 11;
      const isMaster22 = birth === 22 || lifePath === 22;
      const isMaster33 = birth === 33 || lifePath === 33;
      const reducesTo2 = normLife === 2 || normBirth === 2;
      const reducesTo7 = normLife === 7 || normBirth === 7;
      const exprReduced = expr > 9 ? reduceDigits(expr, { keepMaster: false }) : expr;
      if (companyNum == null) {
        // Fallback: inherent capacity only
        const reducesTo4 = normLife === 4 || normBirth === 4;
        const exprIs2or7 = exprReduced === 2 || exprReduced === 7;
        if (isMaster11) score = 5;
        else if (isMaster22 || isMaster33) score = 5;
        else if (reducesTo2 && exprIs2or7) score = 4;
        else if (reducesTo2 || reducesTo7) score = 4;
        else if (exprIs2or7) score = 3;
        else if (reducesTo4) score = 3;
        else if (diffLife <= 1 || diffBirth <= 1) score = 3;
        else score = 2;
        reasons.push(`Birth ${birth} (→${normBirth}), Life ${lifePath} (→${normLife}), Expression ${expr} (→${exprReduced}) — no company`);
      } else {
        // Score by intuitive-number company resonance
        const diffLPCompany = Math.abs(normLife - companyNum);
        const diffBCompany = Math.abs(normBirth - companyNum);
        const minDiff = Math.min(diffLPCompany, diffBCompany);
        if (isMaster11 && minDiff <= 1) score = 5;
        else if (isMaster11) score = 4;
        else if (isMaster22 || isMaster33) score = 5;
        else if (reducesTo2 && minDiff <= 2) score = 4;
        else if (reducesTo7 && minDiff <= 2) score = 4;
        else if (minDiff <= 1) score = 4;
        else if (minDiff <= 2) score = 3;
        else score = 2;
        diffForOutcome = minDiff;
        reasons.push(`LP ${lifePath} (→${normLife}) vs Company ${companyNum} (Δ${diffLPCompany}), Birth ${birth} (→${normBirth}) vs Company ${companyNum} (Δ${diffBCompany})`);
      }
      if (diffForOutcome === null) diffForOutcome = score === 5 ? 0 : score === 4 ? 1 : score === 3 ? 2 : 5;
    }
    const { outcomeFor } = require('./numerologyOutcome');
    const { tone, label } = outcomeFor(diffForOutcome);
    const resonance = label;
    const extra = p.key === 'harmony' ? { derivedFromAlignment: true, alignmentDimension: 'Trajectory Alignment' } : {};
    return { ...p, score, basis: reasons.join(' · '), resonance, outcome: label, tone, diff: diffForOutcome, ...extra };
  });
}

const PERSONAL_YEAR_THEMES = {
  1: { theme: 'New beginnings', description: 'A reset year — openings, fresh starts and momentum to initiate.', suggestedAction: 'Ask about recent new projects or initiatives they have started' },
  2: { theme: 'Partnership', description: 'A collaborative year — cooperation, patience and building alliances.', suggestedAction: 'Probe how they form and maintain working relationships' },
  3: { theme: 'Expression', description: 'A creative year — communication, self-expression and social energy.', suggestedAction: 'Explore how they communicate ideas and influence others' },
  4: { theme: 'Building', description: 'A structuring year — discipline, stability and laying foundations.', suggestedAction: 'Ask how they organise work and handle repetitive or process-heavy tasks' },
  5: { theme: 'Change', description: 'A freedom year — movement, adaptability and variety.', suggestedAction: 'Check comfort with change, travel and shifting priorities' },
  6: { theme: 'Responsibility', description: 'A caring year — service, nurturing and household/team commitments.', suggestedAction: 'Discuss balancing their own workload with supporting others' },
  7: { theme: 'Reflection', description: 'A contemplative year — analysis, research and going deeper.', suggestedAction: 'Ask about their approach to analysis and solo deep work' },
  8: { theme: 'Achievement', description: 'A payoff year — recognition, results and material progress.', suggestedAction: 'Probe goals around results, responsibility and delivering outcomes' },
  9: { theme: 'Completion', description: 'A closure year — wrapping up, letting go and concluding cycles.', suggestedAction: 'Explore how they close out projects and handle endings' },
};

module.exports = {
  reduceDigits,
  reduceToSingleDigit: reduceDigits,
  lifePathNumber,
  birthNumber,
  personalYearNumber,
  foundedNumber,
  companyFoundedNumber: foundedNumber,
  nameNumber,
  companyEcho,
  foundedNumberWithSteps,
  nameNumberWithSteps,
  LETTER_VALUES,
  PERSONAL_YEAR_THEMES,
  KEYWORDS,
  companySupportNarrative,
  PARAM_NUMEROLOGY,
  paramNumerologyFit,
  NUMO_PARAMETERS,
  computeNumoParameters,
  WEIGHTS,
  DEFAULT_WEIGHTS: { dob: 0.7, name: 0.3 },
  compositePersonalNumber,
  dobComponent,
};
