import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../../styles/help.css';

const TOUR_STEPS = [
  { title: 'Welcome to Humsee Score', body: 'This short tour shows you where things are. You can reopen it any time from the blue Start tour button at the top.' },
  { title: 'Scores: your candidate list', body: 'Every candidate lives here. Search, filter, or add one with + Add Candidate. Click Score Now to open a scorecard.' },
  { title: 'The scorecard', body: 'Each scorecard has tabs: Overview, Candidate Evaluation, Score Parameters (16), Joining Evaluation and Behavioural Reflection. Let us walk through them.' },
  { title: 'Overview', body: 'Overview summarises the candidate: applicant details, the Pursuit Priority band, Candidate Fit and the Person/Role split at a glance.' },
  { title: 'Candidate Evaluation', body: 'Candidate Evaluation holds the 16 SOP parameters (PERSON, ROLE, DEAL) with the linked JD and resume scoring. Rate each 0-100 or mark it N/A, then auto-rate from JD + resume if you like.' },
  { title: 'Joining Evaluation', body: 'Joining Evaluation captures the DEAL factors (motivation, availability, compensation and joining risks) that drive Joining Probability.' },
  { title: 'Behavioural Reflection', body: 'Behavioural Reflection is an admin-only, informational view based on date of birth. It is never used in Candidate Fit or Joining Probability.' },
  { title: 'Read the decision', body: 'The Pursuit Priority card shows the routing band and any gate warnings. Gates explain why a band was capped.' },
  { title: 'Job Descriptions (JDs)', body: 'JDs are what candidates are scored against. Add a JD, edit its keywords, and identical JDs are detected and rejected automatically.' },
  { title: 'Insights', body: 'Insights compares candidates and shows reflection summaries side by side. Use Compare to view several candidates at once.' },
  { title: 'Decisions and help', body: 'Approvals and email drafts are in Decisions. Use this Help Center any time for any feature you forget. Happy scoring!' },
];

const SECTIONS = [
  {
    id: 'start',
    label: '1. What is Humsee Score?',
    keywords: 'start what is humsee score overview evaluate candidates',
    tag: 'Getting started',
    title: 'What is Humsee Score?',
    body: (
      <>
        <p>Humsee Score is an applicant-evaluation tool for recruiters and administrators. Instead of scattered opinions, every candidate is rated against a fixed set of 16 parameters and reduced to one clear routing decision.</p>
        <div className="help-grid">
          <div className="help-mini"><b>Score consistently</b><br />16 parameters in three groups: PERSON, ROLE and DEAL.</div>
          <div className="help-mini"><b>Decide quickly</b><br />Fit and Joining Probability combine into one Pursuit Priority and routing band.</div>
          <div className="help-mini"><b>Explain the rating</b><br />Each parameter can carry evidence, gaps and a confidence level.</div>
        </div>
        <h3>Your first 5 minutes</h3>
        <div className="help-step"><b>1</b><div>Sign in with your username and password, or with Google if your account is approved.</div></div>
        <div className="help-step"><b>2</b><div>Open <i>Scores</i> and pick a candidate, or add one with <i>+ Add Candidate</i>.</div></div>
        <div className="help-step"><b>3</b><div>Open the candidate's scorecard, rate a few parameters, then select <i>Save Scorecard &amp; Recompute Pursuit</i>.</div></div>
        <div className="help-step"><b>4</b><div>Check the Pursuit Priority card at the top to see the routing decision and any gate warnings.</div></div>
      </>
    ),
  },
  {
    id: 'model',
    label: '2. How scoring works',
    keywords: 'score model fit joining probability pursuit priority routing band gates confidence',
    tag: 'Scoring',
    title: 'How scoring works',
    body: (
      <>
        <p>All scores run from 0 to 100. Each group of parameters is weighted so the group always totals 100%.</p>
        <table>
          <tbody>
            <tr><th>Group</th><th>Parameters (weight)</th></tr>
            <tr><td>PERSON</td><td>Communication &amp; Influence 12 · Problem Solving 14 · Judgment 12 · Collaboration 10 · Adaptability 10 · Initiative 10 · Learning 8 · Leadership 8 · Reliability 8 · Values Alignment 8</td></tr>
            <tr><td>ROLE</td><td>Technical/Role Competence 50 · Experience &amp; Industry Relevance 30 · Qualifications &amp; Certifications 20 (can be N/A)</td></tr>
            <tr><td>DEAL</td><td>Motivation &amp; Intent 40 · Availability &amp; Joining Readiness 40 · Compensation Alignment 20</td></tr>
          </tbody>
        </table>
        <h3>The three numbers</h3>
        <ul>
          <li><b>Candidate Fit</b> = PERSON × 35% + ROLE × 40% + JD match × 25%.</li>
          <li><b>Joining Probability</b> = weighted average of the DEAL factors (active search, motive, engagement, counter-offer, timeline, work-life, dropout risk, compensation).</li>
          <li><b>Pursuit Priority</b> = Fit × 60% + Joining Probability × 40%, then adjusted by gates.</li>
        </ul>
        <h3>Routing bands</h3>
        <table>
          <tbody>
            <tr><th>Band</th><th>When</th></tr>
            <tr><td>Priority Interview</td><td>Priority 80 or above</td></tr>
            <tr><td>Interview</td><td>65–79</td></tr>
            <tr><td>Verify before interview</td><td>50–64, or Role competence below 50</td></tr>
            <tr><td>Hold / Disengage / Nurture</td><td>Below 50</td></tr>
          </tbody>
        </table>
        <h3>Gates (these override the band)</h3>
        <ul>
          <li><b>Critical validation required</b> – a mandatory JD requirement is missing. Blocks Priority Interview.</li>
          <li><b>Verify before interview</b> – Role competence is below 50.</li>
          <li><b>Resolve joining risks</b> – Joining Probability is 35–49.</li>
          <li><b>Hold / disengage / nurture</b> – Joining Probability is below 35.</li>
        </ul>
        <div className="help-tip"><b>Confidence</b> (High, Moderate, Limited Evidence) is for information only. It never changes Fit, Joining Probability or the band.</div>
        <div className="help-tip"><b>N/A is not zero.</b> Marking a parameter N/A removes it from the calculation and re-weights the rest.</div>
      </>
    ),
  },
  {
    id: 'access',
    label: '3. Roles & sign-in',
    keywords: 'login sign in google password username mfa roles administrator employee forgot password',
    tag: 'Access',
    title: 'Roles & sign-in',
    body: (
      <>
        <table>
          <tbody>
            <tr><th>Role</th><th>What you can see</th></tr>
            <tr><td>Administrator</td><td>All candidates, job descriptions, scorecards, decisions and insights.</td></tr>
            <tr><td>Employee</td><td>A read-only view of their own scorecard only.</td></tr>
          </tbody>
        </table>
        <details><summary>How do I sign in?</summary><p>Use <b>Continue with Google</b> if your email is approved, or enter the username and password your administrator issued. There is no public sign-up.</p></details>
        <details><summary>I see "Your Google account is not on the allowed list."</summary><p>Your email has not been approved for Google sign-in. Ask your administrator to add it, or use your username and password.</p></details>
        <details><summary>I forgot my password.</summary><p>There is no self-service reset. Contact your organisation administrator.</p></details>
        <details><summary>Can I add two-step verification?</summary><p>Yes, optionally. Administrators can turn on a 6-digit authenticator code from the account menu (top right).</p></details>
      </>
    ),
  },
  {
    id: 'home',
    label: '4. Home & navigation',
    keywords: 'home navigation menu navbar logout account',
    tag: 'Navigation',
    title: 'Home & navigation',
    body: (
      <>
        <p>The navigation bar reaches every module: <b>Home · Scores · JDs · Decisions · Insights</b>. The account menu (top right) shows who is signed in and has the logout button.</p>
        <div className="help-tip">If you open a page you do not have access to, you are sent to your own area automatically.</div>
      </>
    ),
  },
  {
    id: 'scores',
    label: '5. Candidate list',
    keywords: 'scorecards list candidates search import excel add candidate favorites archived sort filter',
    tag: 'Candidates',
    title: 'Candidate list (Scores)',
    body: (
      <>
        <table>
          <tbody>
            <tr><th>Control</th><th>What it does</th></tr>
            <tr><td>Search box</td><td>Filter by name, email, client or position.</td></tr>
            <tr><td>All / ★ Favorites / Archived</td><td>Switch between active, starred and archived candidates.</td></tr>
            <tr><td>Sort &amp; filter</td><td>Reorder or narrow the list, e.g. by Pursuit Priority.</td></tr>
            <tr><td>Import from Excel</td><td>Add many candidates from an .xlsx or .xls file (max 5 MB). Date of birth is not needed in the sheet.</td></tr>
            <tr><td>+ Add Candidate</td><td>Add one candidate. Name, email and date of birth are required.</td></tr>
            <tr><td>Edit / Score Now</td><td>Open that candidate's scorecard.</td></tr>
            <tr><td>⋮ menu</td><td>Favourite, archive, or other row actions.</td></tr>
          </tbody>
        </table>
        <div className="help-tip">A candidate showing "Not scored" has no decision yet. Open the scorecard and save at least one parameter.</div>
      </>
    ),
  },
  {
    id: 'scorecard',
    label: '6. The scorecard (16 parameters)',
    keywords: 'scorecard parameters rate auto-rate interview focus approval save recompute pursuit',
    tag: 'Scoring',
    title: 'The scorecard (16 parameters)',
    body: (
      <>
        <p>Each candidate has one scorecard with four tabs: <b>Overview</b>, <b>Candidate Evaluation</b>, <b>Score Parameters (16)</b> and <b>Joining Evaluation</b>, plus <b>Behavioral Reflection</b>.</p>
        <h3>Steps</h3>
        <div className="help-step"><b>1</b><div>Fill in the applicant details (name, email, client, position).</div></div>
        <div className="help-step"><b>2</b><div>Rate each parameter from 0 to 100, or mark it N/A.</div></div>
        <div className="help-step"><b>3</b><div>Open <i>Joining Evaluation</i> and rate the DEAL factors. These drive Joining Probability.</div></div>
        <div className="help-step"><b>4</b><div>Select <b>Save Scorecard &amp; Recompute Pursuit</b> to save and update the decision.</div></div>
        <h3>Helpful extras</h3>
        <ul>
          <li><b>Auto-rate</b> pre-fills PERSON and ROLE parameters from the linked job description and resume. Always editable.</li>
          <li><b>Interview Focus</b> suggests up to three areas to probe, with questions. It clears once the interview is scheduled.</li>
          <li><b>Approval &amp; Decision</b> at the bottom starts a single or panel approval and records the history.</li>
        </ul>
        <div className="help-tip">The Pursuit Priority card shows the band, the reasons (gates), Fit, the Person/Role split and Joining Probability. Read the gate messages first. They explain why a band was capped.</div>
      </>
    ),
  },
  {
    id: 'match',
    label: '7. Capability Match',
    keywords: 'capability match jd resume keywords evidence requirements',
    tag: 'Scorecard tool',
    title: 'Capability Match (JD ↔ Resume)',
    body: (
      <>
        <p>Opened from a scorecard. It compares the linked job description with the resume and produces the JD-match part of Candidate Fit.</p>
        <ul>
          <li>Requirements are grouped (technical, functional, responsibilities, experience, domain, education, certifications) and given a priority.</li>
          <li>The header shows how many are matched, partial or missing.</li>
          <li>Every row shows the evidence found and where, so you can check the reasoning.</li>
          <li>If no JD or resume is linked, link them on the scorecard first.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'jds',
    label: '8. Job descriptions',
    keywords: 'job descriptions jd add jd keywords duplicate archive',
    tag: 'Setup',
    title: 'Job descriptions',
    body: (
      <>
        <p>Job descriptions are what candidates are scored against. The active keyword set drives resume matching, and you can edit both the text and the keywords.</p>
        <ul>
          <li><b>+ Add JD</b> creates a new one. The ⋮ menu lets you favourite, archive or delete.</li>
          <li>Identical JDs are detected and rejected, so the same one is not added twice.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'decisions',
    label: '9. Decision Centre',
    keywords: 'decision centre approve reject pending email draft',
    tag: 'Decisions',
    title: 'Decision Centre',
    body: (
      <>
        <p>Track approvals and rejections. The top cards show Approved, Rejected and Pending counts; tabs filter the list.</p>
        <ul>
          <li><b>Scorecard</b> opens the candidate's scorecard.</li>
          <li><b>View Details</b> shows the decision and its ready-to-send email draft. You can edit the draft before sending it yourself.</li>
          <li><b>Delete</b> removes the candidate's decision record.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'insights',
    label: '10. Insights',
    keywords: 'insights behavioural reflection numerology date of birth dob compare',
    tag: 'Insights',
    title: 'Insights — Behavioural Reflection',
    body: (
      <>
        <p>An administrator-only, informational module. It shows reflection summaries (Momentum, Ideation, Connection, Perspective) based on date of birth.</p>
        <div className="help-tip"><b>Reflection, not a prediction.</b> These summaries are not a hiring signal and are never used in Candidate Fit or Joining Probability.</div>
        <ul>
          <li>Use <b>Compare</b> to view several candidates side by side.</li>
          <li>If a card says "Add DOB to evaluate", add the candidate's date of birth first.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'employee',
    label: '11. Employee view',
    keywords: 'employee view my scorecard read only',
    tag: 'Employees',
    title: 'Employee self-service view',
    body: (
      <>
        <p>Employees see a read-only view of their own evaluation: overall percentage and band, client, position, and the parameter breakdown grouped by PERSON, ROLE and DEAL. They cannot see candidate lists or other people's records.</p>
      </>
    ),
  },
  {
    id: 'faq',
    label: '12. FAQ & troubleshooting',
    keywords: 'faq troubleshooting problem not working help support',
    tag: 'Help',
    title: 'FAQ & troubleshooting',
    body: (
      <>
        <details><summary>A candidate says "Not scored".</summary><p>Open the scorecard, rate at least one parameter, then select <b>Save Scorecard &amp; Recompute Pursuit</b>.</p></details>
        <details><summary>Capability Match is empty.</summary><p>Link a job description and upload a resume on the scorecard first.</p></details>
        <details><summary>Insights says "Add DOB".</summary><p>The candidate has no date of birth on file. Add it on their record.</p></details>
        <details><summary>My Excel import failed.</summary><p>Check that the file is .xlsx or .xls and under 5 MB.</p></details>
        <details><summary>Something else is wrong.</summary><p>Contact your organisation administrator.</p></details>
      </>
    ),
  },
];

function QuickTour({ open, onClose }) {
  const [index, setIndex] = useState(0);

  useEffect(() => { if (open) setIndex(0); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const step = TOUR_STEPS[index];
  const stepLabel = index === 0 ? 'Welcome' : `Step ${index} of ${TOUR_STEPS.length - 1}`;

  return createPortal(
    <div className="help-tour" role="dialog" aria-modal="true" aria-label="Quick tour" onClick={onClose}>
      <div className="help-tour-box" onClick={(e) => e.stopPropagation()}>
        <div className="help-tour-dots">
          {TOUR_STEPS.map((_, n) => <span key={n} className={n === index ? 'on' : ''} />)}
        </div>
        <div className="help-tag" style={{ marginTop: 12 }}>{stepLabel}</div>
        <h2 style={{ margin: '4px 0 8px', fontSize: 20, color: '#1e293b' }}>{step.title}</h2>
        <p style={{ margin: 0, color: '#374151', lineHeight: 1.5 }}>{step.body}</p>
        <div className="help-tour-btns">
          <button type="button" onClick={onClose}>Skip</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} style={{ visibility: index === 0 ? 'hidden' : 'visible' }}>Back</button>
            <button
              type="button"
              className="primary"
              onClick={() => { if (index < TOUR_STEPS.length - 1) setIndex(index + 1); else onClose(); }}
            >
              {index === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(SECTIONS[0].id);
  const [tourOpen, setTourOpen] = useState(false);
  const startedRef = useRef(false);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => SECTIONS.map((s) => ({
    ...s,
    hidden: q !== '' && !(s.keywords + ' ' + s.title).toLowerCase().includes(q),
  })), [q]);
  const anyVisible = visible.some((s) => !s.hidden);

  useEffect(() => {
    const seen = (() => { try { return localStorage.getItem('humsee_tour_done') === '1'; } catch (e) { return false; } })();
    if (seen || startedRef.current) return;
    startedRef.current = true;
    setTimeout(() => setTourOpen(true), 700);
  }, []);

  const closeTour = () => {
    setTourOpen(false);
    try { localStorage.setItem('humsee_tour_done', '1'); } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    if (q !== '') return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-20% 0px -70% 0px' });
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean);
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [q]);

  return (
    <div className="help-page">
      <div className="help-head">
        <div>
          <h2>Help Center</h2>
          <div className="sub">Everything about Humsee Score — scoring, the scorecard, decisions and troubleshooting.</div>
        </div>
        <button className="btn-primary" type="button" onClick={() => setTourOpen(true)}>▶ Start tour</button>
      </div>

      <div className="help-layout">
        <aside className="help-toc">
          <input
            className="help-search"
            placeholder="Search help…"
            aria-label="Search help"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {visible.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={[s.hidden ? 'hidden' : '', active === s.id ? 'active' : ''].join(' ').trim()}
              onClick={() => setActive(s.id)}
            >
              {s.label}
            </a>
          ))}
        </aside>

        <main className="help-main">
          {!anyVisible && <div className="help-empty">No help topics match "{query}".</div>}
          {visible.map((s) => (
            <section key={s.id} id={s.id} className={`help-card${s.hidden ? ' hidden' : ''}`}>
              <div className="help-tag">{s.tag}</div>
              <h2>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </main>
      </div>

      <QuickTour open={tourOpen} onClose={closeTour} />
    </div>
  );
}
