const { extractStructured, extractCandidateProfile } = require('./capabilityMatch');

function extractEvidence(resumeText, requirements) {
  if (!resumeText || !requirements || requirements.length === 0) return [];

  const profile = extractCandidateProfile(resumeText);
  const resumeLower = String(resumeText || '').toLowerCase();

  return requirements.map(req => {
    const evidenceItems = [];
    let score = 0;
    let confidence = 0;

    const matched = profile.get(req.term);
    if (matched) {
      evidenceItems.push({
        type: 'skill_match',
        text: `"${matched.display}" found in resume`,
        strength: matched.confidence >= 0.9 ? 'strong' : matched.confidence >= 0.7 ? 'moderate' : 'weak',
        confidence: matched.confidence,
      });
      score += matched.confidence * 40;
      confidence += matched.confidence * 0.4;
    }

    const contextSnippets = findContextSnippets(resumeLower, req.text || req.term);
    for (const snippet of contextSnippets) {
      evidenceItems.push({
        type: 'context',
        text: snippet.text,
        strength: snippet.strength,
        confidence: snippet.confidence,
      });
      score += snippet.scoreContribution;
      confidence += snippet.confidenceContribution;
    }

    if (req.category === 'experience') {
      const expEvidence = extractExperienceEvidence(resumeLower, req);
      evidenceItems.push(...expEvidence.items);
      score += expEvidence.scoreContribution;
      confidence += expEvidence.confidenceContribution;
    }

    if (req.category === 'education') {
      const eduEvidence = extractEducationEvidence(resumeLower, req);
      evidenceItems.push(...eduEvidence.items);
      score += eduEvidence.scoreContribution;
      confidence += eduEvidence.confidenceContribution;
    }

    const normalizedScore = Math.min(100, Math.round(score));
    const normalizedConfidence = Math.min(1, Math.round(confidence * 100) / 100);

    return {
      requirement: req.text || req.term,
      term: req.term,
      category: req.category,
      importance: req.importance,
      score: normalizedScore,
      confidence: normalizedConfidence,
      evidence: evidenceItems,
      evidenceCount: evidenceItems.length,
      hasEvidence: evidenceItems.length > 0,
    };
  });
}

function findContextSnippets(resumeLower, term) {
  const snippets = [];
  const termLower = String(term).toLowerCase();
  const strongPatterns = [
    new RegExp(`(?:developed|built|implemented|created|led|managed|designed|architected|optimized).*?${escapeRegex(termLower)}.*?(?:\\.|\\n|$)`, 'gi'),
    new RegExp(`${escapeRegex(termLower)}.*?(?:\\d+\\s*(?:years?|months?|yrs?)).*?(?:\\.|\\n|$)`, 'gi'),
  ];
  const moderatePatterns = [
    new RegExp(`(?:used|worked with|experienced in|proficient in|skilled in).*?${escapeRegex(termLower)}.*?(?:\\.|\\n|$)`, 'gi'),
    new RegExp(`${escapeRegex(termLower)}.*?(?:project|experience|role|position).*?(?:\\.|\\n|$)`, 'gi'),
  ];
  const weakPatterns = [
    new RegExp(`${escapeRegex(termLower)}.*?(?:familiar|basic|awareness|knowledge).*?(?:\\.|\\n|$)`, 'gi'),
  ];

  for (const re of strongPatterns) {
    let m;
    while ((m = re.exec(resumeLower)) !== null && snippets.length < 3) {
      snippets.push({ text: m[0].trim().slice(0, 160), strength: 'strong', confidence: 0.9, scoreContribution: 20, confidenceContribution: 0.15 });
    }
  }
  for (const re of moderatePatterns) {
    let m;
    while ((m = re.exec(resumeLower)) !== null && snippets.length < 5) {
      snippets.push({ text: m[0].trim().slice(0, 160), strength: 'moderate', confidence: 0.7, scoreContribution: 12, confidenceContribution: 0.08 });
    }
  }
  for (const re of weakPatterns) {
    let m;
    while ((m = re.exec(resumeLower)) !== null && snippets.length < 6) {
      snippets.push({ text: m[0].trim().slice(0, 160), strength: 'weak', confidence: 0.4, scoreContribution: 5, confidenceContribution: 0.03 });
    }
  }
  return snippets;
}

function extractExperienceEvidence(resumeLower, req) {
  const items = [];
  let scoreContribution = 0;
  let confidenceContribution = 0;
  const expRe = /(\d{1,2})\s*(?:[-+]|\bto\b)\s*(\d{1,2})\s*(?:years?|yrs)|(\d{1,2})\s*\+?\s*(?:years?|yrs)/gi;
  let m;
  while ((m = expRe.exec(resumeLower)) !== null) {
    const years = m[1] ? parseInt(m[1]) : parseInt(m[3] || '0');
    items.push({ type: 'experience', text: `${years} years experience mentioned`, strength: years >= 3 ? 'strong' : 'moderate', confidence: 0.85 });
    scoreContribution += years >= 3 ? 25 : 15;
    confidenceContribution += 0.12;
  }
  return { items, scoreContribution, confidenceContribution };
}

function extractEducationEvidence(resumeLower, req) {
  const items = [];
  let scoreContribution = 0;
  let confidenceContribution = 0;
  const eduPatterns = [
    /(?:b\.?tech|bachelor.*?(?:of|in)\s*(?:\w+\s*)*(?:engineering|technology|science|commerce|arts|business))/gi,
    /(?:m\.?tech|master.*?(?:of|in)\s*(?:\w+\s*)*(?:engineering|technology|science|commerce|arts|business))/gi,
    /(?:mba|b\.?com|m\.?com|b\.?ca|m\.?ca|b\.?sc|m\.?sc|phd|doctorate)/gi,
  ];
  for (const re of eduPatterns) {
    let m;
    while ((m = re.exec(resumeLower)) !== null) {
      items.push({ type: 'education', text: `"${m[0].trim()}" found in resume`, strength: 'strong', confidence: 0.92 });
      scoreContribution += 20;
      confidenceContribution += 0.1;
    }
  }
  return { items, scoreContribution, confidenceContribution };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { extractEvidence };
