import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const FEATURES = [
  { icon: '◎', title: 'Precision Scoring', desc: 'Rate candidates across 23 weighted parameters — communication, technical skills, attitude and more.' },
  { icon: '◈', title: 'Weighted Analytics', desc: 'Three-tier multiplier system gives every parameter its true impact on the final score.' },
  { icon: '⚡', title: 'Instant Insights', desc: 'See overall performance percentages, trends, and colour-coded ratings at a glance.' },
  { icon: '⇅', title: 'Bulk Import', desc: 'Import candidates from Excel. Existing records update automatically, no duplicates.' },
];

const PLANS = [
  { name: 'Smart Shortlist', price: '₹3,999', annualPrice:'₹39,990', annualSave:'Save ₹7,998', annualMo:'₹3,333 / mo value', period: '/Month — up to 50 candidates', specs: [ ['AI CV screens','200 / mo'],['Reports','15 Core / mo'],['Users','3'] ], note: 'Perfect for small teams screening a handful of roles per month.', featured:false },
  { name: 'Decision Fit', price: '₹24,999', annualPrice:'₹2,49,990', annualSave:'Save ₹49,998', annualMo:'₹20,833 / mo value', period: '/Month — up to 250 candidates', specs: [ ['AI CV screens','500 / mo'],['Reports','25 Decision Fit / mo'],['Users','5'] ], note: 'Most chosen — full weighted scoring with substantially deeper analysis. Save 17% on annual.', featured:true, ribbon:'RECOMMENDED' },
  { name: 'Leadership Intelligence', price: '₹59,999', annualPrice:'₹5,99,990', annualSave:'Save ₹1,19,998', annualMo:'₹49,999 / mo value', period: '/Month — up to 1,000 candidates', specs: [ ['AI CV screens','1,000 / mo'],['Reports','10 Advanced / mo'],['Users','10'] ], note: 'The 10 reports/month is intentional. These are advanced assessments with substantially deeper analysis — not directly comparable to the higher-volume Decision Fit reports.', featured:false },
  { name: 'Enterprise — Super Platinum', price: '₹1,49,999', annualPrice:'₹14,99,990', annualSave:'Save ₹2,99,998', annualMo:'₹1,24,999 / mo value', specs: [ ['AI CV screens','3,000 / mo'],['Reports','50 Filament-ready dossiers / mo'],['Users','25'] ], note: 'Everything unlimited, white-label and SLA. Tailored onboarding for large orgs.', featured:false },
];

export default function AdminHome() {
  const [visible, setVisible] = useState(false);
  const [annual, setAnnual] = useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setVisible(true),80); return ()=>clearTimeout(t); },[]);
  return (
    <div className={`lp-root ${visible?'lp-visible':''}`} style={{ minHeight:'calc(100vh - 60px)' }}>
      <div className="lp-orb lp-orb-1" />
      <div className="lp-orb lp-orb-2" />
      <div className="lp-orb lp-orb-3" />

      <section className="lp-hero">
        <div className="lp-container">
          <div className="lp-pill">Applicant Evaluation System</div>
          <h1 className="lp-headline">Evaluate Smarter.<br /><span className="lp-gradient-text">Hire Better.</span></h1>
          <p className="lp-sub">A powerful scorecard platform to assess, track, and manage every candidate with structured precision and full transparency.</p>
          <div className="lp-cta-row">
            <Link to="/scores" className="lp-btn-primary">View Employee Scorecards <span className="lp-arrow">→</span></Link>
            <a href="#features" className="lp-btn-outline">Explore Features</a>
            <a href="#pricing" className="lp-btn-outline">See Pricing</a>
          </div>
          <div className="lp-stats">
            <div className="lp-stat"><div className="lp-stat-value">23</div><div className="lp-stat-label">Scoring Parameters</div></div>
            <div className="lp-stat"><div className="lp-stat-value">3×</div><div className="lp-stat-label">Weighted Multipliers</div></div>
            <div className="lp-stat"><div className="lp-stat-value">100%</div><div className="lp-stat-label">Score Transparency</div></div>
          </div>
        </div>
      </section>

      <section id="features" className="lp-features">
        <div className="lp-container">
          <div className="lp-section-tag">Features</div>
          <h2 className="lp-section-title">Everything you need to evaluate candidates</h2>
          <div className="lp-feature-grid">
            {FEATURES.map(f=>(
              <div key={f.title} className="lp-feature-card">
                <div className="lp-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="lp-pricing">
        <div className="lp-container">
          <div className="lp-section-tag">Pricing</div>
          <h2 className="lp-section-title">Simple plans, no surprises</h2>
          <div className="lp-billing-toggle">
            <span className={!annual?'lp-billing-active':''}>Monthly</span>
            <button className={`lp-billing-switch ${annual?'lp-billing-switch-on':''}`} onClick={()=>setAnnual(v=>!v)} aria-label="Toggle billing"><span className="lp-billing-knob" /></button>
            <span className={annual?'lp-billing-active':''}>Annual — get 2 months free</span>
          </div>
          <div className="lp-pricing-grid">
            {PLANS.map(p=>(
              <div key={p.name} className={`lp-price-card ${p.featured?'lp-price-card-featured':''}`}>
                {p.ribbon && <div className="lp-price-ribbon">{p.ribbon}</div>}
                <h3>{p.name}</h3>
                <div className="lp-price-value">{annual ? p.annualPrice : p.price}<span>{annual ? ' / yr' : ' / mo'}</span></div>
                {annual && <div className="lp-price-saving">{p.annualSave} • {p.annualMo}</div>}
                <ul className="lp-price-specs">
                  {p.specs.map(([k,v])=> <li key={k}><span>{k}</span><strong>{v}</strong></li>)}
                </ul>
                <p className="lp-price-note">{p.note}</p>
              </div>
            ))}
          </div>
          <div className="lp-pilot">
            <div className="lp-pilot-tag">Limited Offer</div>
            <h3>14-day Assisted Pilot — <strong>₹4,999</strong></h3>
            <p>Try the full platform with guided setup, assisted pilot and onboarding.</p>
            <ul className="lp-pilot-list">
              <li>100 CV screens</li><li>2 Decision Fit reports</li><li>Assisted setup and onboarding</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="lp-bottom-cta">
        <div className="lp-container">
          <div className="lp-bottom-cta-inner">
            <h2>Ready to start scoring?</h2>
            <p>Jump into the dashboard and manage your entire candidate pipeline.</p>
            <Link to="/scores" className="lp-btn-primary lp-btn-lg">Open Scorecards Dashboard <span className="lp-arrow">→</span></Link>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-container">© {new Date().getFullYear()} Applicant Scorecard — All rights reserved</div>
      </footer>
    </div>
  );
}
