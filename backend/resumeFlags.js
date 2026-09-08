function detectResumeFlags(resumeText, jdText, capability) {
  const flags = [];
  const text = String(resumeText||'');
  const lower = text.toLowerCase();
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);

  const hasYear = /\b(19|20)\d{2}\b/.test(text);
  const datePattern = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b|\b\d{1,2}[\/\-]\d{4}\b|\b(19|20)\d{2}\s*[-–—]\s*(present|current|\d{4})/i;
  const hasDateRange = datePattern.test(text);
  const educationKeywords = ['b\.?com','m\.?com','bba','mba','b\.?tech','m\.?tech','degree','university','college','school','certification','diploma'];
  const employmentKeywords = ['experience','employed','employer','company',' Pvt',' Ltd',' Inc','technolog','services','solutions','intern','engineer','analyst','manager','developer','consultant'];

  if (!hasYear) {
    flags.push({ code:'missing_dates', label:'Unclear or missing dates', short:'No employment/education years found — dates unclear or missing', severity:'high' });
  } else if (!hasDateRange) {
    flags.push({ code:'missing_dates_detail', label:'Unclear date detail', short:'Years present but no month/year ranges — timeline hard to verify', severity:'medium' });
  }

  const ranges = [];
  const rangeRe = /(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+)?(19|20)\d{2}\s*[-–—]\s*(present|current|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+)?(19|20)?\d{2}?/gi;
  let m;
  while((m=rangeRe.exec(text))!==null){
    const raw=m[0];
    const years=[...raw.matchAll(/(19|20)\d{2}/g)].map(x=>parseInt(x[0]));
    if(years.length>=2) ranges.push({ raw, start:years[0], end: years[1] || new Date().getFullYear() });
    else if(years.length===1 && /present|current/i.test(raw)) ranges.push({ raw, start:years[0], end:new Date().getFullYear() });
  }
  for(let i=0;i<ranges.length;i++){
    for(let j=i+1;j<ranges.length;j++){
      const a=ranges[i], b=ranges[j];
      if(Math.max(a.start,b.start) < Math.min(a.end,b.end)){
        flags.push({ code:'overlap', label:'Overlapping employment or inconsistent timelines', short:`Overlap: "${a.raw.trim()}" overlaps "${b.raw.trim()}" — timeline inconsistent`, severity:'high' });
        break;
      }
    }
    if(flags.some(f=>f.code==='overlap')) break;
  }

  const gaps=[];
  const sorted=[...ranges].sort((a,b)=>a.start-b.start);
  for(let i=1;i<sorted.length;i++){
    const gap=sorted[i].start - sorted[i-1].end;
    if(gap>=2) gaps.push(gap);
  }
  if(gaps.length>0 && gaps.some(g=>g>=3)){
    flags.push({ code:'incomplete_history', label:'Selective or incomplete employment history', short:`Gap of ${Math.max(...gaps)} years between roles — history may be selective`, severity:'medium' });
  } else if(ranges.length<=1 && employmentKeywords.some(k=> lower.includes(k))){
    flags.push({ code:'single_employment', label:'Selective or incomplete employment history', short:'Only one employment period found — history may be incomplete', severity:'low' });
  }

  const durations=[...text.matchAll(/(\d+)\s*\+?\s*years?/gi)].map(x=>parseInt(x[1]));
  const maxClaimed = durations.length? Math.max(...durations):0;
  const totalRangeYears = ranges.reduce((a,r)=>a+(r.end-r.start),0);
  if(maxClaimed>=5 && totalRangeYears>0 && totalRangeYears < maxClaimed-1){
    flags.push({ code:'inflated_exp', label:'Inflated experience or unsupported claims', short:`Claims ${maxClaimed} years but date ranges sum to ~${totalRangeYears} years — possible inflation`, severity:'high' });
  }

  const seniorTitles=['senior','lead','manager','head','director','chief'];
  const juniorTasks=['led team','managed team','handled client','responsible for team','mentored'];
  if(seniorTitles.some(t=> lower.includes(t)) && !juniorTasks.some(t=> lower.includes(t)) && lower.includes('intern')){
    flags.push({ code:'designation_mismatch', label:'Designation vs. responsibility mismatch', short:'Senior designation with intern-level responsibilities — mismatch', severity:'medium' });
  }
  if(lower.includes('manager') && !/(team|project|client|budget|report)/i.test(lower)){
    flags.push({ code:'designation_mismatch2', label:'Designation vs. responsibility mismatch', short:'Manager title but no team/project/budget responsibilities described', severity:'medium' });
  }

  if(capability && capability.pct>=70 && totalRangeYears<=1 && maxClaimed<=2){
    flags.push({ code:'keyword_stuffing', label:'Excessive keyword matching without supporting experience', short:`High keyword match (${capability.pct}%) but only ~${totalRangeYears||0} years in dates — possible keyword stuffing`, severity:'medium' });
  }

  const hasEducation = educationKeywords.some(k=> new RegExp(k,'i').test(lower));
  if(hasEducation){
    const eduLines=lines.filter(l=> educationKeywords.some(k=> new RegExp(k,'i').test(l.toLowerCase())));
    const vagueEdu=eduLines.filter(l=> l.length<15 || /^b\.?com|mba|degree/i.test(l) && !/(university|college|institute|school)/i.test(l));
    if(vagueEdu.length>0){
      flags.push({ code:'unverifiable_edu', label:'Unclear or unverifiable institution / qualification', short:'Education listed without institution name — hard to verify', severity:'medium' });
    }
  } else if(/education|qualification/i.test(lower) && !hasYear){
    flags.push({ code:'unverifiable_edu2', label:'Unclear or unverifiable institution', short:'Education section present but institution/years unclear', severity:'low' });
  }

  const employerMentions=[...lower.matchAll(/\b(pvt|ltd|inc|llc|technologies|solutions|systems|corp|company)\b/g)];
  if(employerMentions.length>0 && !hasDateRange){
    flags.push({ code:'unverifiable_employer', label:'Unclear or unverifiable employer details', short:'Employer names present but without dates — verification difficult', severity:'low' });
  }

  const yearOnlyDates=(text.match(/\b(19|20)\d{2}\b/g)||[]).length;
  const monthYearDates=(text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/gi)||[]).length;
  if(yearOnlyDates>=3 && monthYearDates===0){
    flags.push({ code:'conceal_timeline', label:'Timeline appears to conceal or minimise details', short:'Only years shown, no months — timeline lacks precision, may conceal gaps', severity:'low' });
  }

  const contradictions=[];
  const dateMentions=[...text.matchAll(/\b(19|20)\d{2}\b/g)].map(x=>x[0]);
  const uniqYears=[...new Set(dateMentions)];
  if(uniqYears.length>=4 && ranges.length>=2 && dateMentions.length!== uniqYears.length){
    contradictions.push('Repeated years with different contexts');
  }
  if(contradictions.length){
    flags.push({ code:'contradiction', label:'Contradictions within the CV', short:'Multiple mentions of same years with different roles/dates — possible inconsistency', severity:'high' });
  }

  const seen=new Set();
  const deduped=flags.filter(f=>{ if(seen.has(f.code)) return false; seen.add(f.code); return true; });
  return deduped.slice(0,6);
}

module.exports={ detectResumeFlags };
