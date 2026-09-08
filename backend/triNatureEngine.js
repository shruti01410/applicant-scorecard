const { reduceDigits, lifePathNumber, birthNumber, personalYearNumber, nameNumber, LETTER_VALUES } = require('./numerologyUtils');

const VOWELS = new Set(['a','e','i','o','u']);

function soulUrgeNumber(fullName) {
  if (!fullName) return null;
  const total = String(fullName).toLowerCase().split('').filter(ch => VOWELS.has(ch)).reduce((s,ch) => s + (LETTER_VALUES[ch]||0), 0);
  if (!total) return null;
  return reduceDigits(total, { keepMaster: true });
}

function personalityNumber(fullName) {
  if (!fullName) return null;
  const total = String(fullName).toLowerCase().split('').filter(ch => LETTER_VALUES[ch] && !VOWELS.has(ch)).reduce((s,ch) => s + (LETTER_VALUES[ch]||0), 0);
  if (!total) return null;
  return reduceDigits(total, { keepMaster: true });
}

function attitudeNumber(isoDob) {
  if (!isoDob) return null;
  const parts = isoDob.split('-').map(Number);
  const d = parts[2]; const m = parts[1];
  if (!d || !m) return null;
  const total = String(d).split('').reduce((a,c)=>a+Number(c),0) + String(m).split('').reduce((a,c)=>a+Number(c),0);
  return reduceDigits(total, { keepMaster: true });
}

function maturityNumber(lifePath, expression) {
  if (lifePath == null || expression == null) return null;
  return reduceDigits(lifePath + expression, { keepMaster: true });
}

function balanceNumber(fullName) {
  if (!fullName) return null;
  const initials = String(fullName).trim().split(/\s+/).map(w => w[0]).filter(Boolean);
  const total = initials.reduce((s,ch) => s + (LETTER_VALUES[ch.toLowerCase()]||0), 0);
  if (!total) return null;
  return reduceDigits(total, { keepMaster: true });
}

const AFFINITY = {
  Initiative:          [9,3,6,4,8,4,3,8,5],
  Ambition:           [8,3,5,5,6,4,3,10,6],
  Dominance:          [9,2,5,5,6,4,3,9,4],
  'Competitive Drive':[8,3,5,5,7,3,3,9,4],
  Assertiveness:      [9,3,6,5,6,4,4,8,5],
  Creativity:         [5,6,10,3,7,6,6,4,7],
  Imagination:        [4,5,9,2,8,5,8,3,7],
  Curiosity:          [5,4,7,3,9,4,8,4,6],
  Adaptability:       [5,6,6,2,10,5,4,4,6],
  'Mental Flexibility':[4,6,7,3,9,5,6,4,6],
  Empathy:            [3,9,5,4,5,9,5,3,9],
  Sensitivity:        [3,9,6,3,5,8,6,3,8],
  'Emotional Balance':[5,6,4,8,4,7,6,6,6],
  Patience:           [3,8,3,8,3,7,7,5,6],
  'Mood Variability': [4,7,7,2,8,5,6,4,6],
  Persistence:        [7,6,3,10,2,6,6,8,5],
  Discipline:         [6,5,2,10,2,6,7,7,4],
  Reliability:        [6,7,3,9,2,9,5,6,6],
  Commitment:         [5,8,3,9,2,9,5,6,6],
  Groundedness:       [6,6,2,9,2,7,5,6,5],
  'Self-Awareness':   [5,6,4,5,4,6,10,4,8],
  Authenticity:       [7,4,6,6,5,5,7,5,6],
  Intuition:          [4,7,6,2,6,6,10,3,7],
  Independence:       [10,2,5,5,8,3,7,6,4],
  'Value Alignment':  [5,6,4,6,4,8,7,4,10],
};

const ELEMENTS = {
  AGNI:    ['Initiative','Ambition','Dominance','Competitive Drive','Assertiveness'],
  VAYU:    ['Creativity','Imagination','Curiosity','Adaptability','Mental Flexibility'],
  JALA:    ['Empathy','Sensitivity','Emotional Balance','Patience','Mood Variability'],
  PRITHVI: ['Persistence','Discipline','Reliability','Commitment','Groundedness'],
  AKASHA:  ['Self-Awareness','Authenticity','Intuition','Independence','Value Alignment'],
};

const PARAM_META = {
  Initiative:          { element:'AGNI', light:'Starts things readily', shadow:'Impulsive starts, no follow-through' },
  Ambition:           { element:'AGNI', light:'Goal-oriented drive', shadow:'Restless dissatisfaction' },
  Dominance:          { element:'AGNI', light:'Natural leadership', shadow:'Over-control' },
  'Competitive Drive':{ element:'AGNI', light:'Motivated by challenge', shadow:'Zero-sum thinking' },
  Assertiveness:      { element:'AGNI', light:'Speaks up, sets boundaries', shadow:'Comes across as blunt/forceful' },
  Creativity:         { element:'VAYU', light:'Generates novel ideas', shadow:'Struggles to finish any one idea' },
  Imagination:        { element:'VAYU', light:'Rich inner world', shadow:'Detached from practical steps' },
  Curiosity:          { element:'VAYU', light:'Loves learning, asking why', shadow:'Scattered attention' },
  Adaptability:       { element:'VAYU', light:'Comfortable with change', shadow:'Lacks a consistent through-line' },
  'Mental Flexibility':{ element:'VAYU', light:'Sees multiple perspectives', shadow:'Indecisive, second-guesses' },
  Empathy:            { element:'JALA', light:'Attuned to others', shadow:'Absorbs others\' emotions' },
  Sensitivity:        { element:'JALA', light:'Perceptive, responsive', shadow:'Easily wounded' },
  'Emotional Balance':{ element:'JALA', light:'Steady under pressure', shadow:'Suppresses rather than processes' },
  Patience:           { element:'JALA', light:'Tolerates slow processes', shadow:'Passive when action is needed' },
  'Mood Variability': { element:'JALA', light:'Emotionally expressive', shadow:'Reactive swings' },
  Persistence:        { element:'PRITHVI', light:'Sees things through', shadow:'Rigid, won\'t pivot when needed' },
  Discipline:         { element:'PRITHVI', light:'Consistent habits', shadow:'Overly rule-bound' },
  Reliability:        { element:'PRITHVI', light:'Dependable', shadow:'Over-commits, resents it later' },
  Commitment:         { element:'PRITHVI', light:'Loyal, long-view', shadow:'Stays too long in the wrong thing' },
  Groundedness:       { element:'PRITHVI', light:'Calm, practical', shadow:'Resistant to new ideas' },
  'Self-Awareness':   { element:'AKASHA', light:'Reflective, insightful', shadow:'Overthinking, self-referential loops' },
  Authenticity:       { element:'AKASHA', light:'Direct, consistent self', shadow:'Struggles with social tact' },
  Intuition:          { element:'AKASHA', light:'Trusts instinct well', shadow:'Under-uses evidence/logic' },
  Independence:       { element:'AKASHA', light:'Self-directed', shadow:'Reluctant to collaborate' },
  'Value Alignment':  { element:'AKASHA', light:'Acts on stated values', shadow:'Idealism vs. action gap' },
};

const TRIGUNA_MAP = {
  Initiative:          { Sattva:0, Rajas:0.9, Tamas:0 },
  Ambition:           { Sattva:0, Rajas:1.0, Tamas:0 },
  Dominance:          { Sattva:0, Rajas:0.9, Tamas:0.1 },
  'Competitive Drive':{ Sattva:0, Rajas:0.9, Tamas:0 },
  Assertiveness:      { Sattva:0.2, Rajas:0.8, Tamas:0 },
  Creativity:         { Sattva:0.5, Rajas:0.4, Tamas:0.1 },
  Imagination:        { Sattva:0.6, Rajas:0.2, Tamas:0.2 },
  Curiosity:          { Sattva:0.6, Rajas:0.4, Tamas:0 },
  Adaptability:       { Sattva:0.6, Rajas:0.4, Tamas:0 },
  'Mental Flexibility':{ Sattva:0.6, Rajas:0.3, Tamas:0.1 },
  Empathy:            { Sattva:0.9, Rajas:0.1, Tamas:0 },
  Sensitivity:        { Sattva:0.6, Rajas:0, Tamas:0.4 },
  'Emotional Balance':{ Sattva:0.9, Rajas:0, Tamas:0.1 },
  Patience:           { Sattva:0.6, Rajas:0, Tamas:0.4 },
  'Mood Variability': { Sattva:0.2, Rajas:0.5, Tamas:0.3 },
  Persistence:        { Sattva:0.3, Rajas:0.4, Tamas:0.3 },
  Discipline:         { Sattva:0.5, Rajas:0.3, Tamas:0.2 },
  Reliability:        { Sattva:0.6, Rajas:0.2, Tamas:0.2 },
  Commitment:         { Sattva:0.5, Rajas:0.2, Tamas:0.3 },
  Groundedness:       { Sattva:0.5, Rajas:0.1, Tamas:0.4 },
  'Self-Awareness':   { Sattva:0.9, Rajas:0.1, Tamas:0 },
  Authenticity:       { Sattva:0.8, Rajas:0.2, Tamas:0 },
  Intuition:          { Sattva:0.8, Rajas:0.1, Tamas:0.1 },
  Independence:       { Sattva:0.3, Rajas:0.6, Tamas:0.1 },
  'Value Alignment':  { Sattva:0.9, Rajas:0.1, Tamas:0 },
};

const SIGNATURES = {
  'AGNI-Rajas':   { name:'The Igniter', desc:'You tend to move fast and light fires — people feel your drive before you explain it.' },
  'AGNI-Sattva':  { name:'The Purposeful Driver', desc:'You tend to channel drive through clear purpose — energy with a compass.' },
  'AGNI-Tamas':   { name:'The Contained Fire', desc:'You tend to hold strong drive in reserve — steady heat rather than flare.' },
  'VAYU-Rajas':   { name:'The Restless Visionary', desc:'You tend to chase what’s next — ideas arrive faster than plans.' },
  'VAYU-Sattva':  { name:'The Reflective Creative', desc:'You tend to turn ideas over carefully — curiosity with a contemplative edge.' },
  'VAYU-Tamas':   { name:'The Drifting Breeze', desc:'You tend to float between possibilities — open, sometimes untethered.' },
  'JALA-Sattva':  { name:'The Empathic Anchor', desc:'You tend to steady the emotional weather around you — people feel heard with you.' },
  'JALA-Tamas':   { name:'The Quiet Deep-Feeler', desc:'You tend to feel a lot beneath a calm surface — depth that doesn’t always show.' },
  'JALA-Rajas':   { name:'The Emotional Catalyst', desc:'You tend to stir feeling into motion — empathy that moves people.' },
  'PRITHVI-Sattva':{ name:'The Grounded Builder', desc:'You tend to make things that last — patience as a craft.' },
  'PRITHVI-Tamas': { name:'The Steady Keeper', desc:'You tend to hold what’s built — loyalty as a quiet strength.' },
  'PRITHVI-Rajas': { name:'The Determined Mover', desc:'You tend to push steadily forward — persistence with momentum.' },
  'AKASHA-Sattva': { name:'The Inner Seeker', desc:'You tend to look inward first — meaning before action.' },
  'AKASHA-Rajas':  { name:'The Driven Idealist', desc:'You tend to chase what matters to you — ideals with legs.' },
  'AKASHA-Tamas':  { name:'The Quiet Observer', desc:'You tend to watch and weigh — insight that arrives slowly.' },
};

function labelFor(score) {
  if (score < 20) return 'Quiet Expression';
  if (score < 40) return 'Emerging';
  if (score < 60) return 'Balanced';
  if (score < 80) return 'Strong Expression';
  return 'Dominant Expression';
}

function toMasterNum(n) {
  return n === 11 || n === 22 || n === 33 ? n : null;
}

function buildCoreNumbers(fullName, isoDob) {
  const lp = lifePathNumber(isoDob);
  const bd = birthNumber(isoDob);
  const exp = nameNumber(fullName, { keepMaster:true });
  const soul = soulUrgeNumber(fullName);
  const pers = personalityNumber(fullName);
  const att = attitudeNumber(isoDob);
  const mat = maturityNumber(lp, exp);
  const bal = balanceNumber(fullName);
  const py = isoDob ? personalYearNumber(isoDob, new Date().getFullYear()) : null;
  return { lifePath:lp, birthDay:bd, expression:exp, soulUrge:soul, personality:pers, attitude:att, maturity:mat, balance:bal, personalYear:py };
}

function affinityFor(param, num) {
  const arr = AFFINITY[param];
  if (!arr || num == null) return 5;
  const n = num === 11 || num === 22 || num === 33 ? reduceDigits(num,{keepMaster:false}) : num;
  const idx = Math.max(1, Math.min(9, Math.round(n))) - 1;
  return arr[idx] != null ? arr[idx] : 5;
}

function computeTriNature(fullName, isoDob, resumeText=null) {
  const core = buildCoreNumbers(fullName, isoDob);
  if (!core.expression && !isoDob) return { hasProfile:false, core };
  const hasDob = !!isoDob && !!core.lifePath;

  const paramScores = {};
  const paramDetails = {};

  Object.keys(AFFINITY).forEach(param => {
    const meta = PARAM_META[param];
    let wSoul = false;
    if (['AGNI','PRITHVI'].includes(meta.element)) wSoul = false;
    let weights;
    if (['AGNI','PRITHVI'].includes(meta.element)) {
      weights = [
        { n: core.lifePath, w:0.30 },
        { n: core.expression, w:0.25 },
        { n: core.birthDay, w:0.25 },
        { n: core.personality, w:0.20 },
      ];
    } else if (meta.element === 'JALA') {
      weights = [
        { n: core.lifePath, w:0.30 },
        { n: core.soulUrge, w:0.25 },
        { n: core.birthDay, w:0.25 },
        { n: core.attitude, w:0.20 },
      ];
    } else if (meta.element === 'AKASHA') {
      weights = [
        { n: core.lifePath, w:0.30 },
        { n: core.expression, w:0.25 },
        { n: core.soulUrge, w:0.25 },
        { n: core.attitude, w:0.20 },
      ];
    } else {
      weights = [
        { n: core.lifePath, w:0.30 },
        { n: core.expression, w:0.25 },
        { n: core.birthDay, w:0.25 },
        { n: core.attitude, w:0.20 },
      ];
    }
    let score = 0;
    let steps = [];
    weights.forEach(({n,w}) => {
      const aff = affinityFor(param, n);
      const contrib = aff * w;
      score += contrib;
      steps.push({ num:n, affinity:aff, weight:w, contrib });
    });
    let raw = score * 10;
    const masters = [core.lifePath, core.expression, core.birthDay, core.soulUrge].filter(v=>v===11||v===22||v===33);
    let amplified = false;
    if (masters.length) {
      if (masters.includes(11) && meta.element==='AKASHA') { raw *= 1.15; amplified = '11×AKASHA'; }
      if (masters.includes(22) && meta.element==='PRITHVI') { raw *= 1.15; amplified = '22×PRITHVI'; }
      if (masters.includes(33) && meta.element==='JALA') { raw *= 1.15; amplified = '33×JALA'; }
    }
    raw = Math.min(100, Math.round(raw));
    if (resumeText) {
      try {
        const { extractHiringSignals } = require('./capabilityMatch');
        const sigs = new Set(extractHiringSignals(resumeText));
        const keywords = param.toLowerCase().split(/\W+/);
        const hasResumeSignal = [...sigs].some(s=> keywords.some(k=> s.includes(k) || k.includes(s)) || sigs.has(param.toLowerCase()));
        if (hasResumeSignal) raw = Math.min(100, raw + 2);
        else if (sigs.size>0 && raw < 40) raw = Math.max(0, raw - 1);
      } catch(e){}
    }
    paramScores[param] = raw;
    paramDetails[param] = { score:raw, label:labelFor(raw), element:meta.element, light:meta.light, shadow:meta.shadow, steps, amplified, weights: weights.map(x=>x.n) };
  });

  const elements = {};
  Object.entries(ELEMENTS).forEach(([el, list]) => {
    const avg = list.reduce((a,p)=>a+(paramScores[p]||0),0)/list.length;
    elements[el] = Math.round(avg);
  });

  let sSum=0,rSum=0,tSum=0, sW=0,rW=0,tW=0;
  Object.keys(paramScores).forEach(param=>{
    const sc = paramScores[param];
    const m = TRIGUNA_MAP[param];
    if (!m) return;
    sSum += sc * m.Sattva; sW += m.Sattva;
    rSum += sc * m.Rajas; rW += m.Rajas;
    tSum += sc * m.Tamas; tW += m.Tamas;
  });
  const sRaw = sW ? sSum/sW : 0;
  const rRaw = rW ? rSum/rW : 0;
  const tRaw = tW ? tSum/tW : 0;
  const total = sRaw + rRaw + tRaw || 1;
  const triguna = {
    Sattva: Math.round(sRaw/total*100),
    Rajas: Math.round(rRaw/total*100),
    Tamas: Math.round(tRaw/total*100),
    raw:{ Sattva:Math.round(sRaw), Rajas:Math.round(rRaw), Tamas:Math.round(tRaw) }
  };
  const tSumPct = triguna.Sattva + triguna.Rajas + triguna.Tamas;
  if (tSumPct !== 100) {
    const maxK = Object.entries(triguna).sort((a,b)=>b[1]-a[1])[0][0];
    triguna[maxK] += 100 - tSumPct;
  }

  const domEl = Object.entries(elements).sort((a,b)=>b[1]-a[1])[0][0];
  const domMode = Object.entries({Sattva:triguna.Sattva,Rajas:triguna.Rajas,Tamas:triguna.Tamas}).sort((a,b)=>b[1]-a[1])[0][0];
  const key = `${domEl}-${domMode}`;
  const sig = SIGNATURES[key] || { name:`The ${domEl} ${domMode}`, desc:`You tend to lead with ${domEl} energy in a ${domMode} mode.` };

  const sortedParams = Object.entries(paramScores).sort((a,b)=>b[1]-a[1]);
  const lightSignals = sortedParams.slice(0,3).map(([p,s])=>({ param:p, score:s, light:PARAM_META[p].light }));
  const growthEdges = sortedParams.slice(-2).reverse().map(([p,s])=>({ param:p, score:s, shadow:PARAM_META[p].shadow }));

  let pattern = null;
  const high = new Set(sortedParams.filter(([,s])=>s>=70).map(([p])=>p));
  if (high.has('Creativity') && high.has('Discipline') && paramScores['Discipline']<50) pattern = { name:'Potential–Execution Gap', desc:'High ideation with lower follow-through — great starter, benefits from a finisher partner.' };
  else if (high.has('Imagination') && paramScores['Groundedness']<50) pattern = { name:'Vision–Action Disconnect', desc:'Rich inner vision, lighter grounding — ideas shine when paired with practical steps.' };
  else if (high.has('Empathy') && paramScores['Emotional Balance']<50) pattern = { name:'Empath–Overwhelm Loop', desc:'High attunement with lower steadying — caring deeply benefits from boundaries.' };

  return {
    hasProfile:true,
    core,
    parameters: paramDetails,
    elements,
    triguna,
    dominantElement: domEl,
    dominantMode: domMode,
    signature: { key, ...sig, lightSignals, growthEdges, pattern },
  };
}

module.exports = { buildCoreNumbers, computeTriNature, AFFINITY, ELEMENTS, PARAM_META, TRIGUNA_MAP, SIGNATURES, soulUrgeNumber, personalityNumber, attitudeNumber, maturityNumber, balanceNumber };
