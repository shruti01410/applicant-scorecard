import React, { useEffect, useRef } from 'react';

// Hero teaser for the public /explore page: a short muted, looping brand clip
// with a "Watch the full demo" button that opens the full film (with sound) in
// a native <dialog> (top-layer, so it escapes any transformed ancestor).
export default function HeroTeaser({ onWatch }) {
  const dialogRef = useRef(null);
  const videoRef = useRef(null);

  function open() {
    const d = dialogRef.current;
    if (!d || d.open) return;
    d.showModal();
    if (onWatch) onWatch();
    const v = videoRef.current;
    if (v) {
      try { v.currentTime = 0; } catch { /* ignore */ }
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    }
  }

  function close() {
    const v = videoRef.current;
    if (v) v.pause();
    const d = dialogRef.current;
    if (d && d.open) d.close();
  }

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return undefined;
    const onCancel = (e) => { e.preventDefault(); close(); };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, []);

  return (
    <>
      <div className="ex-teaser">
        <div className="ex-teaser-frame">
          <video
            className="ex-teaser-video"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/media/teaser-poster.jpg"
            aria-label="HUMSEE SCORE product teaser"
          >
            <source src="/media/teaser.webm" type="video/webm" />
            <source src="/media/teaser.mp4" type="video/mp4" />
          </video>
          <button type="button" className="ex-teaser-play" onClick={open}>
            <span className="ex-teaser-play-icon" aria-hidden="true">▶</span>
            Watch the full demo · 40 sec
          </button>
        </div>
      </div>

      <dialog ref={dialogRef} className="ex-demo-dialog" aria-label="HUMSEE SCORE full demo">
        <div className="ex-demo-bar">
          <span>HUMSEE SCORE — full demo</span>
          <button type="button" className="ex-demo-close" onClick={close} aria-label="Close demo">×</button>
        </div>
        <video ref={videoRef} className="ex-demo-video" controls playsInline preload="none" poster="/media/teaser-poster.jpg">
          <source src="/media/full-demo.mp4" type="video/mp4" />
        </video>
      </dialog>
    </>
  );
}
