const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const { extractText } = require('../fileTextExtract');
const { computeTriNature } = require('../triNatureEngine');
const { detectResumeFlags } = require('../resumeFlags');

const router = express.Router();
router.use(authenticate, requireRole('admin'));
const upload = multer({ storage: multer.memoryStorage(), limits:{ fileSize:10*1024*1024 } });

function calcExperienceYears(workStartDate){
  if(!workStartDate) return null;
  const start=new Date(workStartDate);
  if(isNaN(start)) return null;
  const now=new Date();
  if(start > now) return null;
  const diffMs=now - start;
  const years=diffMs / (1000*60*60*24*365.25);
  return Math.round(years*10)/10;
}

function parseResumeStructured(text){
  const lower=(text||'').toLowerCase();
  const skills=[...new Set((lower.match(/\b(tally|excel|sap|gst|java|python|javascript|react|node|sql|oracle|powerbi|tableau|aws|azure)\b/g)||[]))];
  const education=[...new Set((lower.match(/\b(bcom|mcom|bba|mba|btech|mtech|phd|diploma|degree|university|college)\b/g)||[]))];
  const certs=[...new Set((lower.match(/\b(certification|certified|ca |cs |cma)\b/g)||[]))];
  const roles=[...new Set((lower.match(/\b(intern|analyst|manager|developer|consultant|engineer|lead|head)\b/g)||[]))];
  const projects=(text.match(/\b(project|built|developed|led|managed)\b/gi)||[]).length;
  return { skills, education, experience: roles, certifications:certs, projects, rawLength: text.length };
}

router.post('/analyze', upload.single('resume_file'), async (req,res)=>{
  try{
    const candidate_name=String(req.body.candidate_name||req.body.name||'').trim();
    const date_of_birth=String(req.body.date_of_birth||req.body.dob||'').trim()||null;
    const work_start_date=String(req.body.work_start_date||'').trim()||null;
    const current_role=String(req.body.current_role||req.body.position||'').trim()||null;
    if(!candidate_name) return res.status(400).json({error:'candidate_name is required'});
    if(!work_start_date) return res.status(400).json({error:'work_start_date is required'});
    if(!req.file) return res.status(400).json({error:'resume_file is required (PDF/DOC/DOCX)'});
    const expYears=calcExperienceYears(work_start_date);
    if(expYears==null) return res.status(400).json({error:'work_start_date invalid or in future'});
    let resumeText='';
    try{ resumeText=await extractText(req.file.buffer, req.file.originalname); }catch(e){ return res.status(400).json({error:e.message}); }
    const resumeStructured=parseResumeStructured(resumeText);
    const triNature=computeTriNature(candidate_name, date_of_birth, resumeText);
    const elements={};
    if(triNature && triNature.elements){
      for(const [k,v] of Object.entries(triNature.elements)){
        const labelMap={AGNI:'MOMENTUM',VAYU:'IDEATION',JALA:'CONNECTION',AKASHA:'PERSPECTIVE'};
        const descMap={AGNI:'Drive & Execution',VAYU:'Creative Thinking',JALA:'Emotional Intelligence',AKASHA:'Strategic Vision'};
        elements[k.toLowerCase()]={ score:v, label:labelMap[k]||k, desc:descMap[k]||'', parameters: Object.entries(triNature.parameters||{}).filter(([,p])=>p.element===k).map(([name,p])=>({ parameter:name, score:p.score, level:p.label, evidence: p.light? [p.light]:[], strength:p.light, shadow:p.shadow, source:'Resume+Numerology' })) };
      }
    }
    const coreSignature= triNature ? { name: triNature.signature.name, description: triNature.signature.desc, leadingTraits: triNature.signature.lightSignals, growthEdges: triNature.signature.growthEdges, pattern: triNature.signature.pattern?.name||null, communicationArchetype: triNature.signature.key } : null;
    const innerIntelligence = triNature ? Object.entries(triNature.parameters||{}).slice(0,6).map(([k,v])=>({ parameter:k, score:v.score, level:v.label, explanation:v.light, shadow:v.shadow, source:'Numerology' })) : [];
    // deeper 6 from numo
    let numoParams=[];
    try{
      const numer=require('../numerologyUtils');
      const mockProfile={ life_path_number: triNature?.core?.lifePath || 1, birth_number: triNature?.core?.birthDay || 1, expression_number: triNature?.core?.expression || 1, full_name:candidate_name, date_of_birth };
      numoParams=numer.computeNumoParameters({ life_path_number: mockProfile.life_path_number, birth_number: mockProfile.birth_number, expression_number: mockProfile.expression_number, full_name:candidate_name, date_of_birth }, null);
    }catch(e){}
    const overallScore = triNature ? Math.round(Object.values(triNature.elements).reduce((a,b)=>a+b,0)/5) : 0;
    const { buildOverallConclusion }=require('../overallConclusion');
    const conclusion=buildOverallConclusion({ weightedPct: overallScore, badge: overallScore>=80?'Excellent':overallScore>=65?'Good':overallScore>=30?'Average':'Needs Improvement', scores:[], triNature });
    const flags=detectResumeFlags(resumeText, '', {pct: overallScore});
    const interviewPrep = triNature ? (()=>{ const sorted=Object.entries(triNature.parameters).sort((a,b)=>a[1].score-b[1].score); const low=sorted[0]; return { generalOpeners:[`Walk me through your experience as ${current_role||'this role'} — what energized you most?`, `How do you handle feedback when ${low?low[0].toLowerCase():''} is stretched?`, `Describe the team where you do your best work`], signalBasedPrompts: low? [`On "${low[0]}" (${low[1].score}) the shadow is "${low[1].shadow.toLowerCase()}" — how do you notice it?`,`You read as strongly ${sorted[sorted.length-1][0]} — when does that help most?`]:[], summaryPrompt:`Generate a one-paragraph interview-ready summary for ${candidate_name} who is ${current_role||'a candidate'} with ${expYears} years experience — leads with strengths, names one thing to probe, stays neutral.` }; })() : null;
    const companyFit={ trajectoryAlignment:'Good', brandAlignment:'Neutral', founderAlignment:'Worth exploring', verdict:'Company context not provided — add company founding to enable full fit' };

    // optionally create/update employee + scorecard for persistence
    let employeeId=null;
    try{
      const existing=db.prepare('SELECT id FROM users WHERE LOWER(name)=LOWER(?)').get(candidate_name);
      if(existing) employeeId=existing.id;
      else {
        const { makeUsername }=require('../database');
        const username=makeUsername(candidate_name);
        const email=username+'@scorecard.com';
        const info=db.prepare('INSERT INTO users (username,password,role,name,email,resume_text) VALUES (?,?,?,?,?,?)').run(username, require('bcryptjs').hashSync('12345',10),'employee',candidate_name,email,resumeText);
        employeeId=info.lastInsertRowid;
        db.prepare('INSERT INTO scorecards (employee_id, applicant_name, email, position) VALUES (?,?,?,?)').run(employeeId,candidate_name,email,current_role);
      }
    }catch(e){}

    res.json({
      candidate:{ name:candidate_name, dateOfBirth:date_of_birth, workStartDate:work_start_date, experienceYears:expYears, currentRole:current_role },
      resume:{ text: resumeText.slice(0,4000), structured: resumeStructured, fileName:req.file.originalname, fileSize:req.file.size },
      overallScore,
      elements,
      coreSignature,
      innerIntelligence: numoParams,
      conclusion,
      interviewPrep,
      companyFit,
      flags,
      triNature,
      employeeId
    });
  }catch(e){ res.status(500).json({error:e.message}); }
});

module.exports=router;
