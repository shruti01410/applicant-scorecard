import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import './ProductTour.css';

const PAD = 6;
const GAP = 14;
const CARD_W = 300;

// Lightweight spotlight product tour. Each step targets a CSS selector via
// `data-tour` anchors. Rendered through a portal to document.body so the fixed
// overlay is never trapped by a transformed/short-flow ancestor, and the
// spotlight hole is drawn with four dim panels so clicks outside the step are
// blocked while the highlighted element stays interactive.
export default function ProductTour({
  steps = [],
  storageKey,
  autoStart = true,
  launchLabel = '▶ Start tour',
}) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState(null);
  const [vp, setVp] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1200,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  const [cardH, setCardH] = useState(190);
  const cardRef = useRef(null);
  const startedRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Resolve the route a step should be shown on. `path` is static; `pathFrom`
  // reads the href of a link containing the given selector (e.g. a row's
  // "Edit Score" link) so the tour can follow the user into a scorecard.
  const resolveTarget = useCallback((step) => {
    if (!step) return null;
    if (typeof step.path === 'string') return step.path;
    if (step.pathFrom) {
      const src = document.querySelector(step.pathFrom);
      const a = src ? (src.closest('a') || (src.tagName === 'A' ? src : null)) : null;
      return a ? a.getAttribute('href') : null;
    }
    return null;
  }, []);

  const measure = useCallback(() => {
    const step = steps[index];
    const el = step ? document.querySelector(step.sel) : null;
    if (!el) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [steps, index]);

  const start = useCallback(() => {
    if (!steps.length) return;
    setIndex(0);
    setBox(null);
    setActive(true);
    try { if (storageKey) localStorage.setItem(storageKey, '1'); } catch (e) { /* ignore */ }
  }, [steps.length, storageKey]);

  const end = useCallback(() => {
    setActive(false);
    setBox(null);
  }, []);

  // Auto-open once per browser (first visit). No cleanup on purpose: under
  // StrictMode dev double-invoke the ref guard prevents a second schedule.
  useEffect(() => {
    if (!autoStart || !steps.length) return;
    let done = false;
    try { done = storageKey ? localStorage.getItem(storageKey) === '1' : false; } catch (e) { done = false; }
    if (done || startedRef.current) return;
    startedRef.current = true;
    setTimeout(start, 700);
  }, [autoStart, steps.length, storageKey, start]);

  // Follow the tour across pages: if a step belongs on another route, navigate
  // there first, then let the measuring effect below wait for its anchor.
  useEffect(() => {
    if (!active) return;
    const target = resolveTarget(steps[index]);
    if (target && location.pathname !== target) {
      setBox(null);
      navigate(target);
    }
  }, [active, index, steps, resolveTarget, navigate, location.pathname]);

  // Bring the current target into view, retrying until it renders (it may be on
  // a page that is still loading), then re-measure once it settles.
  useLayoutEffect(() => {
    if (!active) return;
    let cancelled = false;
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      const step = steps[index];
      const el = step ? document.querySelector(step.sel) : null;
      if (el) {
        if (el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' });
        measure();
        return;
      }
      if (tries++ < 40) setTimeout(tick, 100);
      else setBox(null);
    };
    const raf = requestAnimationFrame(tick);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [active, index, steps, measure, location.pathname]);

  // Keep the spotlight aligned while the page scrolls or resizes.
  useEffect(() => {
    if (!active) return;
    const onScroll = () => measure();
    const onResize = () => { setVp({ w: window.innerWidth, h: window.innerHeight }); measure(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [active, measure]);

  // Measure the card so it can be placed without overflowing the viewport.
  useLayoutEffect(() => {
    if (!active || !cardRef.current) return;
    const h = cardRef.current.offsetHeight;
    if (Math.abs(h - cardH) > 1) setCardH(h);
  }, [active, index, box, cardH]);

  const next = () => { if (index < steps.length - 1) setIndex(index + 1); else end(); };
  const back = () => { if (index > 0) setIndex(index - 1); };

  if (!active || !steps.length) {
    return (
      <button type="button" className="tour-launch-btn" onClick={start}>{launchLabel}</button>
    );
  }

  const vw = vp.w;
  const vh = vp.h;

  let cardLeft = Math.max(12, (vw - CARD_W) / 2);
  let cardTop = Math.max(12, (vh - cardH) / 2);
  let cardUnder = true;
  if (box) {
    cardLeft = Math.min(Math.max(12, box.left + box.width / 2 - CARD_W / 2), Math.max(12, vw - CARD_W - 12));
    const below = box.top + box.height + GAP;
    const above = box.top - cardH - GAP;
    if (below + cardH <= vh - 12) { cardTop = below; cardUnder = true; }
    else if (above >= 12) { cardTop = above; cardUnder = false; }
    else { cardTop = Math.max(12, Math.min(below, vh - cardH - 12)); cardUnder = true; }
  }

  const overlays = [];
  let ring = null;
  let arrow = null;
  if (!box) {
    overlays.push(<div key="full" className="tour-dim" style={{ left: 0, right: 0, top: 0, bottom: 0 }} />);
  } else {
    const x1 = Math.max(0, box.left - PAD);
    const y1 = Math.max(0, box.top - PAD);
    const x2 = Math.min(vw, box.left + box.width + PAD);
    const y2 = Math.min(vh, box.top + box.height + PAD);
    overlays.push(<div key="top" className="tour-dim" style={{ left: 0, right: 0, top: 0, height: y1 }} />);
    overlays.push(<div key="bottom" className="tour-dim" style={{ left: 0, right: 0, top: y2, bottom: 0 }} />);
    overlays.push(<div key="left" className="tour-dim" style={{ left: 0, top: y1, width: x1, height: Math.max(0, y2 - y1) }} />);
    overlays.push(<div key="right" className="tour-dim" style={{ left: x2, top: y1, width: Math.max(0, vw - x2), height: Math.max(0, y2 - y1) }} />);
    ring = <div className="tour-ring" style={{ left: x1, top: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) }} />;
    const cx = Math.min(Math.max(box.left + box.width / 2, cardLeft + 18), cardLeft + CARD_W - 18);
    arrow = cardUnder
      ? <div className="tour-arrow" style={{ left: cx - 7, top: box.top + box.height + GAP - 7, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderBottom: '8px solid #fff' }} />
      : <div className="tour-arrow" style={{ left: cx - 7, top: box.top - GAP - 1, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '8px solid #fff' }} />;
  }

  const step = steps[index];

  return createPortal(
    <>
      {overlays}
      {ring}
      {arrow}
      <div className="tour-card" ref={cardRef} style={{ left: cardLeft, top: cardTop }} role="dialog" aria-label="Product tour">
        <div className="tour-step">Step {index + 1} of {steps.length}</div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-btns">
          <button type="button" className="tour-btn" onClick={end}>Skip tour</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="tour-btn" onClick={back} style={{ visibility: index === 0 ? 'hidden' : 'visible' }}>Back</button>
            <button type="button" className="tour-btn primary" onClick={next}>{index === steps.length - 1 ? 'Finish' : 'Next'}</button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
