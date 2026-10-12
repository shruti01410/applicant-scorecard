import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { submitLead, trackEvent } from '../services/tracking';

const INTERESTS = ['14-day assisted pilot', 'Pricing demo', 'Enterprise / bulk', 'Partnership', 'Something else'];

// Public lead capture modal. No auth — submits to the public rate-limited
// /api/track/lead endpoint. Honeypot + time-trap handled server-side.
export default function LeadForm({ open, onClose, source }) {
  const renderedAt = useRef(Date.now());
  const [form, setForm] = useState({ name: '', email: '', company: '', phone: '', interest: INTERESTS[0], message: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      renderedAt.current = Date.now();
      setError('');
      setDone(false);
      trackEvent('lead_form_open', { source: source || null });
    }
  }, [open, source]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await submitLead({ ...form, interest: form.interest }, renderedAt.current);
      setDone(true);
      trackEvent('lead_submit_success', { source: source || null });
    } catch (err) {
      setError(err.message || 'Submission failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="lf-overlay" role="dialog" aria-modal="true" aria-label="Request a pilot" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lf-modal">
        <button className="lf-close" onClick={onClose} aria-label="Close">&times;</button>
        {done ? (
          <div className="lf-success">
            <div className="lf-success-icon">✓</div>
            <h3>Thanks — request received.</h3>
            <p>Our team will reach out within one business day.</p>
            <button className="lf-btn-primary" onClick={onClose}>Back to the tour</button>
          </div>
        ) : (
          <>
            <div className="lf-tag">Start free</div>
            <h3>Get your 14-day assisted pilot</h3>
            <p className="lf-sub">No card, no login setup — we onboard your team for you.</p>
            <form onSubmit={onSubmit}>
              <div className="lf-grid">
                <label className="lf-field">
                  <span>Name *</span>
                  <input value={form.name} onChange={set('name')} required maxLength={120} placeholder="Your name" autoComplete="name" />
                </label>
                <label className="lf-field">
                  <span>Work email *</span>
                  <input type="email" value={form.email} onChange={set('email')} required maxLength={200} placeholder="you@company.com" autoComplete="email" />
                </label>
                <label className="lf-field">
                  <span>Company</span>
                  <input value={form.company} onChange={set('company')} maxLength={120} placeholder="Company name" autoComplete="organization" />
                </label>
                <label className="lf-field">
                  <span>Phone</span>
                  <input value={form.phone} onChange={set('phone')} maxLength={40} placeholder="+91 ..." autoComplete="tel" />
                </label>
              </div>
              <label className="lf-field">
                <span>I'm interested in</span>
                <select value={form.interest} onChange={set('interest')}>
                  {INTERESTS.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </label>
              <label className="lf-field">
                <span>Anything specific?</span>
                <textarea value={form.message} onChange={set('message')} maxLength={2000} rows={3} placeholder="Roles you hire for, monthly candidate volume…" />
              </label>
              {/* honeypot — hidden from humans, bots fill it */}
              <input className="lf-hp" value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" aria-hidden="true" />
              {error && <div className="lf-error">{error}</div>}
              <button className="lf-btn-primary lf-btn-block" type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Request my pilot'}
              </button>
              <p className="lf-fine">We'll only use these details to contact you about HUMSEE SCORE.</p>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
