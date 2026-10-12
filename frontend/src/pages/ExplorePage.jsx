import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import LeadForm from '../components/LeadForm';
import { trackEvent } from '../services/tracking';
import '../styles/explore.css';

const FEATURES = [
  { icon: '◎', title: '16-Parameter SOP Scoring', desc: 'PERSON, ROLE and DEAL groups weighted to exactly 100%. Every score 0–100, N/A excluded — never a zero-penalty.' },
  { icon: '◈', title: 'Pursuit Priority Routing', desc: 'Candidate Fit × Joining Probability produces one clear call: Priority Interview, Interview, Verify, or Hold.' },
  { icon: '⚡', title: 'Auto-rate from JD + Resume', desc: 'Evidence-based auto-rater with per-parameter confidence, quotes and gaps — every rating auditable and editable.' },
  { icon: '⇄', title: 'Decision Center', desc: 'Panel approvals, interview focus questions, candidate emails and a full audit trail in one place.' },
  { icon: '◍', title: 'Resume Integrity Checks', desc: 'Nine detection rules surface unclear dates, overlaps and contradictions — with quoted evidence, never guesses.' },
  { icon: '▤', title: 'Bulk Excel Import', desc: 'Upload a sheet, auto-rate every candidate, and keep duplicates out with content-fingerprint dedupe.' },
];

const TOUR = [
  {
    key: 'parameters', tag: 'Step 1', title: 'Score Parameters',
    desc: 'Rate AUTO and MANUAL independently. WEIGHTED = AUTO×60% + MANUAL×40%, weights summing to 100% per group. Evidence and gaps sit beside every parameter.',
    img: '/tour/tour-parameters.png', points: ['Dual-slider score grid', 'Inline evidence + confirm', 'Deal factors rated separately'],
  },
  {
    key: 'priority', tag: 'Step 2', title: 'Pursuit Priority',
    desc: 'One card turns the 16 scores into a routing decision — gates first, band second, with confidence and interview focus questions attached.',
    img: '/tour/tour-priority.png', points: ['Fit × Joining probability', 'Four gates, four bands', 'Confidence: High / Moderate / Limited'],
  },
  {
    key: 'evaluation', tag: 'Step 3', title: 'Candidate Evaluation',
    desc: 'PERSON, ROLE and DEAL group scores roll up transparently. See exactly which parameter drags a candidate down — or lifts them up.',
    img: '/tour/tour-evaluation.png', points: ['Group rollups', 'Per-parameter weighted contribution', 'Badge thresholds at 80 / 60 / 40'],
  },
  {
    key: 'deal', tag: 'Step 4', title: 'Deal Evaluation',
    desc: 'Motivation, availability and compensation are recruiter-rated deal factors — 8 factors that decide whether an offer actually closes.',
    img: '/tour/tour-deal.png', points: ['8 weighted deal factors', 'Notes captured per factor', 'Feeds Joining Probability directly'],
  },
  {
    key: 'decisions', tag: 'Step 5', title: 'Decision Center',
    desc: 'Route candidates through approval panels, record panel opinions, and generate the decision email — all with an audit trail.',
    img: '/tour/tour-decisions.png', points: ['Panel rules: any / all / majority', 'Escalation and hold states', 'Draft decision emails'],
  },
  {
    key: 'insights', tag: 'Step 6', title: 'Insights',
    desc: 'Pipeline-level analytics: score distributions, decision mix, confidence coverage and where candidates stall.',
    img: '/tour/tour-insights.png', points: ['Score distribution', 'Decision mix over time', 'Evidence coverage'],
  },
];

const PLANS = [
  { name: 'Smart Shortlist', price: '₹3,999', annualPrice: '₹39,990', annualSave: 'Save ₹7,998', annualMo: '₹3,333 / mo value', specs: [['AI CV screens', '200 / mo'], ['Reports', '15 Core / mo'], ['Users', '3']], note: 'Perfect for small teams screening a handful of roles per month.', featured: false },
  { name: 'Decision Fit', price: '₹24,999', annualPrice: '₹2,49,990', annualSave: 'Save ₹49,998', annualMo: '₹20,833 / mo value', specs: [['AI CV screens', '500 / mo'], ['Reports', '25 Decision Fit / mo'], ['Users', '5']], note: 'Most chosen — full weighted scoring with substantially deeper analysis. Save 17% on annual.', featured: true, ribbon: 'RECOMMENDED' },
  { name: 'Leadership Intelligence', price: '₹59,999', annualPrice: '₹5,99,990', annualSave: 'Save ₹1,19,998', annualMo: '₹49,999 / mo value', specs: [['AI CV screens', '1,000 / mo'], ['Reports', '10 Advanced / mo'], ['Users', '10']], note: 'The 10 reports/month is intentional. These are advanced assessments with substantially deeper analysis — not directly comparable to the higher-volume Decision Fit reports.', featured: false },
  { name: 'Enterprise — Super Platinum', price: '₹1,49,999', annualPrice: '₹14,99,990', annualSave: 'Save ₹2,99,998', annualMo: '₹1,24,999 / mo value', specs: [['AI CV screens', '3,000 / mo'], ['Reports', '50 Filament-ready dossiers / mo'], ['Users', '25']], note: 'Everything unlimited, white-label and SLA. Tailored onboarding for large orgs.', featured: false },
];

function TourImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img className="ex-tour-img" src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

export default function ExplorePage() {
  const [visible, setVisible] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [annual, setAnnual] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  function openLead(origin) {
    trackEvent('cta_click', { cta: origin });
    setLeadOpen(true);
  }

  const step = TOUR[active];

  return (
    <div className={`lp-root ex-root ${visible ? 'lp-visible' : ''}`}>
      <div className="lp-orb lp-orb-1" />
      <div className="lp-orb lp-orb-2" />
      <div className="lp-orb lp-orb-3" />

      <nav className="lp-nav">
        <div className="lp-nav-brand">
          <img src="/humsee-logo.png" alt="" className="ex-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          HUMSEE SCORE
        </div>
        <div className="lp-nav-right">
          <Link to="/login" className="lp-btn-ghost" onClick={() => trackEvent('cta_click', { cta: 'nav_signin' })}>Sign in</Link>
          <button className="lp-btn-primary" onClick={() => openLead('nav_pilot')}>Start free pilot</button>
        </div>
      </nav>

      <section className="lp-hero">
        <div className="lp-container">
          <div className="lp-pill">Public preview — no login needed</div>
          <h1 className="lp-headline">Evaluate Smarter.<br /><span className="lp-gradient-text">Hire Better.</span></h1>
          <p className="lp-sub">
            The applicant scorecard hiring teams use to rate candidates against a 16-parameter SOP —
            and get one clear routing decision instead of a pile of opinions.
          </p>
          <div className="lp-cta-row">
            <button className="lp-btn-primary lp-btn-lg" onClick={() => openLead('hero_pilot')}>Start 14-day pilot <span className="lp-arrow">→</span></button>
            <a href="#tour" className="lp-btn-outline">Take the tour</a>
          </div>
          <div className="lp-stats">
            <div className="lp-stat"><div className="lp-stat-value">16</div><div className="lp-stat-label">SOP Parameters</div></div>
            <div className="lp-stat"><div className="lp-stat-value">100%</div><div className="lp-stat-label">Weighted to Score</div></div>
            <div className="lp-stat"><div className="lp-stat-value">4</div><div className="lp-stat-label">Routing Decisions</div></div>
            <div className="lp-stat"><div className="lp-stat-value">0</div><div className="lp-stat-label">Zero-Penalty N/As</div></div>
          </div>
        </div>
      </section>

      <section id="features" className="lp-features">
        <div className="lp-container">
          <div className="lp-section-tag">Features</div>
          <h2 className="lp-section-title">Everything you need to evaluate candidates</h2>
          <div className="lp-feature-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="lp-feature-card">
                <div className="lp-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="tour" className="ex-tour">
        <div className="lp-container">
          <div className="lp-section-tag">Product tour</div>
          <h2 className="lp-section-title">Six steps, start to decision</h2>
          <div className="ex-tour-shell">
            <div className="ex-tour-nav">
              {TOUR.map((t, i) => (
                <button
                  key={t.key}
                  className={`ex-tour-step ${i === active ? 'ex-tour-step-on' : ''}`}
                  onClick={() => { setActive(i); trackEvent('tour_step', { step: i + 1, key: t.key }); }}
                >
                  <span className="ex-tour-num">{i + 1}</span>
                  <span className="ex-tour-label">{t.title}</span>
                </button>
              ))}
            </div>
            <div className="ex-tour-stage">
              <div className="ex-tour-tag">{step.tag} of 6</div>
              <h3>{step.title}</h3>
              <p className="ex-tour-desc">{step.desc}</p>
              <ul className="ex-tour-points">
                {step.points.map((p) => <li key={p}>{p}</li>)}
              </ul>
              <TourImage src={step.img} alt={`${step.title} screenshot`} />
              <div className="ex-tour-cta">
                {active > 0 && (
                  <button className="lp-btn-outline" onClick={() => setActive((i) => i - 1)}>← Back</button>
                )}
                {active < TOUR.length - 1 ? (
                  <button className="lp-btn-primary" onClick={() => { setActive((i) => i + 1); trackEvent('tour_step', { step: active + 2, key: TOUR[active + 1].key }); }}>
                    Next: {TOUR[active + 1].title} →
                  </button>
                ) : (
                  <button className="lp-btn-primary lp-btn-lg" onClick={() => openLead('tour_end')}>Start my pilot →</button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="lp-pricing">
        <div className="lp-container">
          <div className="lp-section-tag">Pricing</div>
          <h2 className="lp-section-title">Simple plans, no surprises</h2>
          <div className="lp-billing-toggle">
            <span className={!annual ? 'lp-billing-active' : ''}>Monthly</span>
            <button className={`lp-billing-switch ${annual ? 'lp-billing-switch-on' : ''}`} onClick={() => setAnnual((v) => !v)} aria-label="Toggle billing"><span className="lp-billing-knob" /></button>
            <span className={annual ? 'lp-billing-active' : ''}>Annual — get 2 months free</span>
          </div>
          <div className="lp-pricing-grid">
            {PLANS.map((p) => (
              <div key={p.name} className={`lp-price-card ${p.featured ? 'lp-price-card-featured' : ''}`}>
                {p.ribbon && <div className="lp-price-ribbon">{p.ribbon}</div>}
                <h3>{p.name}</h3>
                <div className="lp-price-value">{annual ? p.annualPrice : p.price}<span>{annual ? ' / yr' : ' / mo'}</span></div>
                {annual && <div className="lp-price-saving">{p.annualSave} • {p.annualMo}</div>}
                <ul className="lp-price-specs">
                  {p.specs.map(([k, v]) => <li key={k}><span>{k}</span><strong>{v}</strong></li>)}
                </ul>
                <p className="lp-price-note">{p.note}</p>
              </div>
            ))}
          </div>
          <div className="ex-pilot-card">
            <div className="lp-pilot-tag">Limited offer</div>
            <h3>14-day assisted pilot — <strong>₹4,999</strong></h3>
            <p>Full access with guided setup, assisted onboarding and your first candidates scored with you.</p>
            <ul className="lp-pilot-list">
              <li>100 CV screens</li>
              <li>2 Decision Fit reports</li>
              <li>Assisted setup and onboarding</li>
            </ul>
            <button className="lp-btn-primary lp-btn-lg" onClick={() => openLead('pricing_pilot')}>Claim this pilot →</button>
          </div>
        </div>
      </section>

      <section className="lp-bottom-cta">
        <div className="lp-container">
          <div className="lp-bottom-cta-inner">
            <h2>See it on your own candidates</h2>
            <p>Send us a role and a CV — we'll score it live on a walkthrough call.</p>
            <button className="lp-btn-primary lp-btn-lg" onClick={() => openLead('bottom_cta')}>Book a walkthrough <span className="lp-arrow">→</span></button>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-container">
          © {new Date().getFullYear()} Humsee Score — All rights reserved · <Link to="/login" className="ex-footer-link">Sign in</Link>
        </div>
      </footer>

      <LeadForm open={leadOpen} onClose={() => setLeadOpen(false)} source="explore" />
    </div>
  );
}
