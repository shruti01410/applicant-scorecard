import React, { useState, useEffect } from "react";
import {
  Gem, Compass, Flag, Sparkles, PenLine, Building2,
  ArrowRight, ArrowLeft, Calendar, Lock, ChevronRight, ChevronDown, Check,
  CheckCircle2, AlertTriangle, Zap, Lightbulb, Heart, ShieldCheck, Eye, Download
} from "lucide-react";
import { api } from "../../../services/api";

/* ---------------------------------------------------------
   Content — 25 parameters grouped by element (labels + code
   copy; scores come live from the backend).
--------------------------------------------------------- */

const INTERNAL_TO_DISPLAY = { AGNI: "MOMENTUM", VAYU: "IDEATION", JALA: "CONNECTION", AKASHA: "PERSPECTIVE" };

const ELEMENT_META = {
  MOMENTUM: { label: "MOMENTUM", sub: "Drive & Execution", fit: "Sales, delivery, start-and-scale environments — roles that need initiative and ownership.", icon: Zap, color: "#e3742f", tint: "#fef1e8" },
  IDEATION: { label: "IDEATION", sub: "Creative Thinking", fit: "Marketing, product, content, R&D, strategy — anything that rewards original thinking.", icon: Lightbulb, color: "#a5872f", tint: "#fbf6e6" },
  CONNECTION: { label: "CONNECTION", sub: "Emotional Intelligence", fit: "Support, HR, client success, healthcare — roles that hinge on trust and relationship quality.", icon: Heart, color: "#c7607a", tint: "#fdedf1" },
  PERSPECTIVE: { label: "PERSPECTIVE", sub: "Strategic Vision", fit: "Strategy, leadership, coaching, advisory — senior roles needing judgment and clear values.", icon: Eye, color: "#3d5df0", tint: "#eef1ff" },
};

const TRIGUNA_META = {
  Sattva: { label: "Composure", color: "#5da88f" },
  Rajas: { label: "Energy & Drive", color: "#e3a13d" },
  Tamas: { label: "Change Resistance", color: "#c7607a" },
};

const humanKey = (key) => {
  if (!key) return "—";
  const [el, mode] = String(key).split("-");
  const a = ELEMENT_META[INTERNAL_TO_DISPLAY[el]]?.label || "";
  const b = TRIGUNA_META[mode]?.label || "";
  return [a, b].filter(Boolean).join(" · ") || "—";
};

const scoreLabelFor = (v) => (v >= 80 ? "Excellent" : v >= 65 ? "Good" : v >= 30 ? "Average" : "Needs discussion");

function getBand(score) {
  if (score < 20) return "Quiet Expression";
  if (score < 40) return "Emerging";
  if (score < 60) return "Balanced";
  if (score < 80) return "Strong Expression";
  return "Dominant Expression";
}

function getBandBlurb(score) {
  if (score < 20) return "Rarely shows up day to day.";
  if (score < 40) return "Shows up sometimes, not a go-to trait.";
  if (score < 60) return "Shows up in a fairly even, situational way.";
  if (score < 80) return "Shows up often — one of their go-to traits.";
  return "Shows up constantly — a defining trait.";
}

/* ---------------------------------------------------------
   Small building blocks
--------------------------------------------------------- */

function ScoreRing({ value = 0, size = 68 }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#eef0f6" strokeWidth="6" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="#f5a623" strokeWidth="6" fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center",
        justifyContent: "center", fontWeight: 700, fontSize: 18, color: "#7a4a06",
      }}>{value}</div>
    </div>
  );
}

function ParamCard({ p, accent = "#3d5df0" }) {
  const band = getBand(p.score);
  const dots = Math.max(1, Math.min(5, Math.round(p.score / 20)));
  return (
    <div style={{
      background: "#fff", border: "1px solid #eceef5", borderRadius: 12, padding: 14,
      display: "flex", flexDirection: "column", gap: 9,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1c2333" }}>{p.name}</div>
        <div title={getBandBlurb(p.score)} style={{
          fontSize: 10.5, fontWeight: 700, color: accent, background: `${accent}1a`,
          padding: "2px 8px", borderRadius: 99, flexShrink: 0, whiteSpace: "nowrap", cursor: "default",
        }}>{band}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 4, flex: 1 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} style={{
              flex: 1, height: 6, borderRadius: 3,
              background: n <= dots ? accent : "#e7eaf3",
            }} />
          ))}
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#8892a8", flexShrink: 0 }}>{p.score}/100</div>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11.5, color: "#2f7a52", lineHeight: 1.4 }}>
        <CheckCircle2 size={13} style={{ marginTop: 1, flexShrink: 0 }} />
        <span><strong>Strength:</strong> {p.light}</span>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11.5, color: "#a4700e", lineHeight: 1.4 }}>
        <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
        <span><strong>Watch for:</strong> {p.shadow}</span>
      </div>
    </div>
  );
}

function ElementSection({ element, isOpen, onToggle, isDominant, isGrowthArea }) {
  const meta = ELEMENT_META[element.key];
  const Icon = meta.icon;
  const band = getBand(element.score);

  return (
    <div style={{
      background: "#fff", border: "1px solid #eceef5", borderRadius: 14,
      marginBottom: 12, overflow: "hidden",
    }}>
      <button onClick={onToggle} style={{
        width: "100%", background: "transparent", border: "none", cursor: "pointer",
        padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, background: meta.tint,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon size={18} color={meta.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "#1c2333" }}>{element.key}</span>
            {isDominant && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#3d5df0", background: "#eef1ff", padding: "1px 8px", borderRadius: 99 }}>Strongest</span>}
            {isGrowthArea && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#a4700e", background: "#fff3dc", padding: "1px 8px", borderRadius: 99 }}>Growth area</span>}
          </div>
          <div style={{ fontSize: 12, color: "#8892a8", marginTop: 2 }}>{element.sub}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: meta.color }}>{element.score}</div>
          <div style={{ fontSize: 10.5, color: "#8892a8" }}>{band}</div>
        </div>
        <ChevronDown size={16} color="#b7bdd0" style={{
          flexShrink: 0, transition: "transform 0.15s", transform: isOpen ? "rotate(180deg)" : "none",
        }} />
      </button>

      {isOpen && (
        <div style={{ padding: "0 16px 18px" }}>
          <div style={{
            background: meta.tint, borderRadius: 10, padding: "10px 12px", marginBottom: 14,
            fontSize: 12, color: "#3c4457", lineHeight: 1.5,
          }}>
            <strong style={{ color: meta.color }}>Best fit for: </strong>{element.fit}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {element.params.map((p) => <ParamCard key={p.name} p={p} accent={meta.color} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function BehavioralDriversDetail({ elements }) {
  const maxScore = Math.max(...elements.map((e) => e.score));
  const minScore = Math.min(...elements.map((e) => e.score));
  const sorted = [...elements].sort((a, b) => b.score - a.score);
  const [open, setOpen] = useState({ [sorted[0].key]: true });

  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  return (
    <div>
      <div style={{
        background: "#fff", border: "1px solid #eceef5", borderRadius: 14, padding: "18px 18px 6px",
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#5c6580", marginBottom: 2 }}>ELEMENT SCORES</div>
        <div style={{ fontSize: 12, color: "#8892a8", marginBottom: 10 }}>At a glance — tap a card below to see what's behind each number.</div>
        <BarChart
          data={sorted.map((e) => ({
            label: e.key,
            value: e.score,
            color: e.score === maxScore ? "#3d5df0" : e.score === minScore ? "#e3a13d" : "#9db3ff",
          }))}
        />
        <div style={{ display: "flex", gap: 14, marginTop: 8, marginBottom: 14, fontSize: 11.5, color: "#8892a8" }}>
          <span><span style={{ color: "#3d5df0", fontWeight: 700 }}>●</span> dominant energy</span>
          <span><span style={{ color: "#e3a13d", fontWeight: 700 }}>●</span> growth area</span>
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: "#5c6580", marginBottom: 10 }}>
        ELEMENTS, STRONGEST FIRST — TAP TO EXPAND
      </div>
      {sorted.map((e) => (
        <ElementSection
          key={e.key}
          element={e}
          isOpen={!!open[e.key]}
          onToggle={() => toggle(e.key)}
          isDominant={e.score === maxScore}
          isGrowthArea={e.score === minScore}
        />
      ))}
    </div>
  );
}

function polarPoint(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function PieChart({ data, size = 170 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  let cumulative = 0;
  const cx = size / 2, cy = size / 2, r = size / 2 - 6;

  const slices = data.map((d) => {
    const startAngle = (cumulative / total) * 360;
    cumulative += d.value;
    const endAngle = (cumulative / total) * 360;
    const large = endAngle - startAngle > 180 ? 1 : 0;
    const start = polarPoint(cx, cy, r, startAngle);
    const end = polarPoint(cx, cy, r, endAngle);
    const path = `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`;
    return { ...d, path, pct: Math.round((d.value / total) * 100) };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth={2} />)}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: "#3c4457", fontWeight: 600 }}>{s.label}</span>
            <span style={{ color: "#8892a8" }}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data, width = 360, height = 200 }) {
  const pad = 28;
  const labelBand = 44;
  const maxVal = 5;
  const stepX = (width - 2 * pad) / (data.length - 1 || 1);
  const points = data.map((d, i) => ({
    x: pad + i * stepX,
    y: pad + (1 - d.value / maxVal) * (height - pad - labelBand - pad),
  }));
  const pathD = points.map((p, i) => (i === 0 ? "M" : "L") + `${p.x},${p.y}`).join(" ");

  // word-wrap labels (max 2 lines, break at word boundaries)
  function wrapLines(label) {
    const words = label.split(" ");
    if (words.length <= 2) return words;
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }
  const wrapped = data.map((d) => wrapLines(d.label));

  // auto-size font to longest single word in the label set
  const allWords = wrapped.flat();
  const maxWordLen = Math.max(1, ...allWords.map((w) => w.length));
  const availPerLabel = (width - 2 * pad) / data.length;
  const fontSize = Math.max(7, Math.min(10, availPerLabel / (maxWordLen * 0.62)));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block", overflow: "visible" }}>
      {[1, 2, 3, 4, 5].map((v) => {
        const y = pad + (1 - v / maxVal) * (height - pad - labelBand - pad);
        return <line key={v} x1={pad} y1={y} x2={width - pad} y2={y} stroke="#eef0f7" strokeWidth={1} />;
      })}
      <path d={pathD} fill="none" stroke="#3d5df0" strokeWidth={2.5} />
      {points.map((p, i) => {
        const lines = wrapped[i];
        const lh = fontSize + 3;
        const baseY = height - labelBand + 4;
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill="#3d5df0" />
            <text x={p.x} y={p.y - 10} fontSize={fontSize} fontWeight="700" fill="#3d5df0" textAnchor="middle">{data[i].value}</text>
            {lines.map((line, li) => (
              <text key={li} x={p.x} y={baseY + li * lh} fontSize={fontSize} fill="#8892a8" textAnchor="middle">{line}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function BarChart({ data, width = 360, height = 200, maxVal = 100 }) {
  const pad = 30;
  const labelBand = 58;
  const chartW = width - 2 * pad;
  const chartH = height - pad - labelBand;
  const gap = 14;
  const barW = (chartW - gap * (data.length - 1)) / Math.max(1, data.length);
  const available = barW + gap;
  const maxLen = Math.max(1, ...data.map((d) => d.label.length));
  const fontSize = Math.max(7, Math.min(10.5, available / (maxLen * 0.66)));
  const charsPerLine = Math.max(2, Math.floor(available / (fontSize * 0.66)));

  function wrapLabel(label) {
    if (label.length <= charsPerLine) return [label];
    const lines = [];
    let cur = "";
    for (const w of label.split(" ")) {
      if (cur && cur.length + 1 + w.length > charsPerLine) {
        lines.push(cur);
        cur = w;
      } else {
        cur = cur ? cur + " " + w : w;
      }
    }
    if (cur) lines.push(cur);
    const out = [];
    for (const l of lines) {
      if (l.length > charsPerLine) {
        const mid = Math.ceil(l.length / 2);
        out.push(l.slice(0, mid), l.slice(mid));
      } else {
        out.push(l);
      }
    }
    return out.slice(0, 2);
  }

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {[0, 25, 50, 75, 100].map((v) => {
        const y = pad + (1 - v / maxVal) * chartH;
        return <line key={v} x1={pad - 6} y1={y} x2={width - 6} y2={y} stroke="#eef0f7" strokeWidth={1} />;
      })}
      {data.map((d, i) => {
        const barH = (d.value / maxVal) * chartH;
        const x = pad + i * (barW + gap);
        const y = pad + chartH - barH;
        const lines = wrapLabel(d.label);
        const lh = fontSize + 3;
        const baseY = height - 16;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barW} height={barH} rx={5} fill={d.color || "#3d5df0"} />
            <text x={x + barW / 2} y={y - 8} fontSize="11" fontWeight="700" fill="#1c2333" textAnchor="middle">{d.value}</text>
            {lines.map((line, li) => (
              <text
                key={li}
                x={x + barW / 2}
                y={lines.length > 1 ? baseY - lh + li * lh : baseY}
                fontSize={fontSize}
                fontWeight={500}
                fill="#8892a8"
                textAnchor="middle"
              >{line}</text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function RankBarChart({ items }) {
  return (
    <div>
      {items.map((it) => (
        <div key={it.name} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
            <span style={{ color: "#3c4457", fontWeight: 600 }}>{it.name}</span>
            <span style={{ fontWeight: 700, color: it.color }}>{it.value}</span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: "#eef0f7" }}>
            <div style={{ height: "100%", width: `${it.value}%`, borderRadius: 99, background: it.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------
   Screen 1 — Intro (dark, matches scorecard hero palette)
--------------------------------------------------------- */

function IntroScreen({ onStart }) {
  return (
    <div className="ii-dark-screen" style={{
      width: "100%", minHeight: "100dvh", boxSizing: "border-box",
      background: "linear-gradient(180deg, #16204a 0%, #0a0f22 45%, #05070f 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "64px 24px 56px", textAlign: "center",
      fontFamily: "'Inter', ui-sans-serif, -apple-system, system-ui, sans-serif",
    }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 16px",
        borderRadius: 99, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.35)",
        fontSize: 13, marginBottom: 28, fontWeight: 500,
      }}>
        <Sparkles size={14} color="#ffffff" /> <span style={{ color: "#ffffff !important" }}>Behavioral reflection layer</span>
      </div>

      <h1 style={{ fontSize: 40, lineHeight: 1.15, fontWeight: 800, margin: "0 0 6px", letterSpacing: -0.5, color: "#ffffff !important" }}>
        See how they work.
      </h1>
      <h1 style={{
        fontSize: 40, lineHeight: 1.15, fontWeight: 800, margin: "0 0 22px", letterSpacing: -0.5,
        color: "#ffffff !important",
      }}>
        Not just what they said.
      </h1>

      <p style={{
        maxWidth: 460, margin: "0 auto 36px", color: "#ffffff !important", fontSize: 15.5, lineHeight: 1.6,
      }}>
        Inner Intelligence reads a candidate's name, date of birth, and resume, then maps
        21 behavioral parameters across four elements — how they drive, think, connect, and
        hold steady under pressure — grouped into 6 meaningful categories.
      </p>

      <button onClick={onStart} style={{
        background: "#3d5df0", color: "#ffffff !important", border: "none", padding: "14px 26px",
        borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 8,
        boxShadow: "0 10px 30px -8px rgba(61,93,240,0.6)",
      }}>
        Generate profile <ArrowRight size={16} />
      </button>

      <div style={{
        marginTop: 48, display: "flex", justifyContent: "center", gap: 44, flexWrap: "wrap",
      }}>
        {[["6", "CATEGORIES"], ["4", "CORE ELEMENTS"], ["21", "BEHAVIORAL PARAMETERS"]].map(([n, l]) => (
          <div key={l}>
            <div style={{ fontSize: 27, fontWeight: 800, color: "#ffffff !important" }}>{n}</div>
            <div style={{ fontSize: 10.5, letterSpacing: 1, color: "#ffffff !important", marginTop: 4, opacity: 0.75 }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Screen 2 — Date of birth
--------------------------------------------------------- */

function DateScreen({ name, setName, dob, hasDob, onContinue, onSkip, saving }) {
  const dobDisplay = dob ? new Date(dob + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
  return (
    <div className="ii-dark-screen" style={{
      width: "100%", minHeight: "100dvh", boxSizing: "border-box", background: "radial-gradient(120% 90% at 50% -10%, #16204a 0%, #070b18 55%, #05070f 100%)",
      color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "56px 24px", fontFamily: "'Inter', ui-sans-serif, -apple-system, system-ui, sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 380, background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: 30,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: "rgba(76,111,255,0.16)",
          display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18,
        }}>
          <Calendar size={19} color="#8fa8ff" />
        </div>
        <h2 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 6px" }}>When were they born?</h2>
        <p style={{ fontSize: 13.5, color: "#ffffff", opacity: 0.75, lineHeight: 1.55, margin: "0 0 24px" }}>
          Date of birth is set in Add Candidate. Without it you'll only see a
          name-only preview.
        </p>

        <label style={{ fontSize: 12, color: "#ffffff", opacity: 0.65, display: "block", marginBottom: 6 }}>Candidate name</label>
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Priya Sharma"
          style={{
            width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "11px 13px",
            color: "#fff", fontSize: 14.5, marginBottom: 18, outline: "none",
          }}
        />

        <label style={{ fontSize: 12, color: "#ffffff", opacity: 0.65, display: "block", marginBottom: 6 }}>Date of birth</label>
        {hasDob && dob ? (
          <div style={{
            width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "11px 13px",
            color: "#fff", fontSize: 14.5, marginBottom: 8,
          }}>
            {dobDisplay}
          </div>
        ) : (
          <div style={{
            width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "11px 13px",
            color: "#e8b653", fontSize: 13, lineHeight: 1.5, marginBottom: 8,
          }}>
            Date of Birth is not available. Please update the candidate's Date of Birth in Add Candidate.
          </div>
        )}

        <button
          onClick={hasDob ? onContinue : onSkip}
          disabled={!name.trim() || saving}
          style={{
            width: "100%", background: name.trim() && !saving ? "#3d5df0" : "rgba(61,93,240,0.35)", color: "#fff",
            border: "none", padding: "13px", borderRadius: 11, fontSize: 14.5, fontWeight: 600,
            cursor: name.trim() && !saving ? "pointer" : "not-allowed", marginBottom: 12,
          }}
        >
          {saving ? "Saving & computing…" : (hasDob ? "Save & continue" : "Continue — preview only")}
        </button>
        {hasDob && (
          <button
            onClick={onSkip}
            disabled={saving}
            style={{
              width: "100%", background: "transparent", color: "#ffffff", opacity: 0.7, border: "none",
              fontSize: 13.5, cursor: saving ? "not-allowed" : "pointer", padding: "6px",
            }}
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Screen 3 — Loading
--------------------------------------------------------- */

function LoadingScreen({ onDone }) {
  const messages = [
    "Reading name and date of birth…",
    "Building the 9-number base…",
    "Mapping the 21 behavioral parameters…",
    "Grouping into 6 categories…",
    "Assembling the signature…",
  ];
  const [i, setI] = useState(0);

  useEffect(() => {
    const step = setInterval(() => setI((v) => Math.min(v + 1, messages.length - 1)), 480);
    const done = setTimeout(onDone, 2100);
    return () => { clearInterval(step); clearTimeout(done); };
  }, []);

  return (
    <div className="ii-dark-screen" style={{
      width: "100%", minHeight: "100dvh", boxSizing: "border-box", background: "radial-gradient(120% 90% at 50% -10%, #16204a 0%, #070b18 55%, #05070f 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "'Inter', ui-sans-serif, -apple-system, system-ui, sans-serif",
    }}>
      <div style={{
        width: 46, height: 46, borderRadius: "50%", border: "3px solid rgba(143,168,255,0.2)",
        borderTopColor: "#8fa8ff", animation: "iispin 0.85s linear infinite", marginBottom: 22,
      }} />
      <div style={{ color: "#ffffff", fontSize: 14.5 }}>{messages[i]}</div>
      <style>{`@keyframes iispin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ---------------------------------------------------------
   Screen 4 — Profile filled
--------------------------------------------------------- */

function FilledScreen({ name, dob, hasDob, onOpenReport, onBack }) {
  const dobDisplay = dob ? new Date(dob + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
  return (
    <div className="ii-dark-screen" style={{
      width: "100%", minHeight: "100dvh", boxSizing: "border-box", background: "radial-gradient(120% 90% at 50% -10%, #16204a 0%, #070b18 55%, #05070f 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "56px 24px",
      fontFamily: "'Inter', ui-sans-serif, -apple-system, system-ui, sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 380, background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: 30, textAlign: "center",
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: "50%", background: "rgba(76,111,255,0.16)",
          display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
        }}>
          <Check size={22} color="#8fa8ff" />
        </div>
        <div style={{ color: "#ffffff", fontSize: 19, fontWeight: 700, marginBottom: 4 }}>{name || "Candidate"}</div>
        <div style={{ color: "#ffffff", opacity: 0.7, fontSize: 13.5, marginBottom: 22 }}>
          {hasDob ? `Born ${dobDisplay}` : "No date of birth — preview only"}
        </div>

        {!hasDob && (
          <div style={{
            width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)", padding: "10px 12px", borderRadius: 10,
            fontSize: 12.5, color: "#e8b653", lineHeight: 1.5, marginBottom: 12,
          }}>
            <Calendar size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Date of Birth is not available. Please update the candidate's Date of Birth in Add Candidate.
          </div>
        )}

        <button onClick={onOpenReport} style={{
          width: "100%", background: "#3d5df0", color: "#fff", border: "none", padding: "13px",
          borderRadius: 11, fontSize: 14.5, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          View full report <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Detail content per card (light theme)
--------------------------------------------------------- */

function CardDetail({ card }) {
  switch (card.id) {
    case "categories":
      return (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#5c6580", marginBottom: 10 }}>
            SIX MEANINGFUL CATEGORIES — SCORED 0–100
          </div>
          <div style={{ fontSize: 12.5, color: "#8892a8", marginBottom: 16, lineHeight: 1.55 }}>
            Expression, Attitude, Unmasked, Personality, and Soul Urge are scored from behavioral parameters.
            Masked traits (Ambition, Competitive Drive, Dominance, Ego) are interview-only — they shift with context
            and get scenario prompts instead of flat resume scores.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
            {card.categories && Object.entries(card.categories).map(([key, cat]) => (
              <div key={key} style={{
                border: "1px solid #eceef5", borderRadius: 10, padding: "12px",
                background: cat.score != null ? "#fff" : "#f9fafc",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1c2333" }}>{cat.name}</div>
                  {cat.score != null ? (
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: cat.score >= 70 ? "#2f7a52" : cat.score >= 40 ? "#a4700e" : "#8892a8",
                      background: cat.score >= 70 ? "#eaf7ef" : cat.score >= 40 ? "#fff3dc" : "#f2f3f8",
                      padding: "2px 8px", borderRadius: 99,
                    }}>{cat.score}/100</div>
                  ) : (
                    <div style={{ fontSize: 11, color: "#8892a8", fontStyle: "italic" }}>Interview-only</div>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: "#5c6580", marginBottom: 6 }}>{cat.desc}</div>
                {cat.params && cat.params.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {cat.params.map((p) => (
                      <span key={p.name} style={{
                        fontSize: 10.5, color: "#5c6580", background: "#f2f3f8",
                        padding: "2px 7px", borderRadius: 6,
                      }}>{p.name} {p.score != null ? `(${p.score})` : ''}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {card.maskedTraits && card.maskedTraits.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#5c6580", marginBottom: 10 }}>
                MASKED TRAITS — INTERVIEW SCENARIOS
              </div>
              <div style={{ fontSize: 12.5, color: "#8892a8", marginBottom: 12, lineHeight: 1.55 }}>
                These traits shift with context — they surface under pressure, not on a resume.
                Use these scenarios in the interview to observe them directly.
              </div>
              {card.maskedTraits.map((m, i) => (
                <div key={i} style={{
                  background: "#fff8ef", border: "1px solid #f2e2c4", borderRadius: 10,
                  padding: "12px 14px", marginBottom: 10,
                }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#a4700e", marginBottom: 4 }}>{m.trait}</div>
                  <div style={{ fontSize: 13, color: "#3c4457", lineHeight: 1.5 }}>{m.prompt}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    case "signature":
      return (
        <div>
          <div style={{
            background: "#f2f5ff", border: "1px solid #dde4ff", borderRadius: 12, padding: 16, marginBottom: 18,
          }}>
            <div style={{ fontSize: 12, color: "#5169e0", fontWeight: 600, marginBottom: 4 }}>SIGNATURE</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: "#1c2333" }}>{card.sig?.name || "—"}</div>
            <div style={{ fontSize: 13, color: "#5c6580", marginTop: 4 }}>{card.sig?.desc || ""}</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#5c6580", marginBottom: 10 }}>DRIVE MODES</div>
          <PieChart data={card.triguna} />
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140, background: "#f4fbf6", border: "1px solid #dcefe1", borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#2f7a52", marginBottom: 6 }}>Light signals</div>
              <div style={{ fontSize: 12.5, color: "#3c4457" }}>
                {(card.sig?.lightSignals || []).map((s) => `${s.param} (${s.score})`).join(", ") || "—"}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 140, background: "#fff8ef", border: "1px solid #f2e2c4", borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#a4700e", marginBottom: 6 }}>Growth edges</div>
              <div style={{ fontSize: 12.5, color: "#3c4457" }}>
                {(card.sig?.growthEdges || []).map((s) => `${s.param} (${s.score})`).join(", ") || "—"}
              </div>
            </div>
          </div>
          {card.sig?.pattern && (
            <div style={{ fontSize: 12.5, color: "#8892a8", marginTop: 14, lineHeight: 1.55 }}>
              Pattern noticed: <strong style={{ color: "#3c4457" }}>{card.sig.pattern.name}</strong> — {card.sig.pattern.desc}
            </div>
          )}
        </div>
      );
    case "conclusion":
      return (
        <div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#5c6580", marginBottom: 10 }}>TOP &amp; BOTTOM SIGNALS</div>
            <RankBarChart items={card.rankItems || []} />
          </div>
          {card.verdict && (
            <div style={{ background: "#f7f8fc", borderRadius: 10, padding: 14, fontSize: 13, color: "#3c4457", lineHeight: 1.6 }}>
              <strong>Final read:</strong> {card.verdict}
            </div>
          )}
        </div>
      );
    case "deeper":
      return (
        <div>
          <div style={{
            background: "#fff", border: "1px solid #eceef5", borderRadius: 14, padding: "20px 14px 14px",
            marginBottom: 18,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#5c6580", marginBottom: 12 }}>SIX LENSES, SCORED 0–5</div>
            <LineChart data={(card.deeper || []).map((d) => ({ label: d.name, value: d.score }))} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {(card.deeper || []).map((d) => (
              <div key={d.name} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                border: "1px solid #eceef5", borderRadius: 10, padding: "10px 12px",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1c2333" }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: "#a2a9bd" }}>{d.score}/5</div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 99,
                  color: d.outcome === "Good" ? "#2f7a52" : "#6c6033",
                  background: d.outcome === "Good" ? "#eaf7ef" : "#fbf6e6",
                }}>{d.outcome}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12.5, color: "#8892a8", lineHeight: 1.55 }}>
            A softer, second lens — computed from the same numbers, separately from the 25 core
            parameters. Especially useful for culture fit and for balancing a team.
          </div>
        </div>
      );
    case "prep":
      return (
        <div>
          <div style={{
            background: "#fff8ef", border: "1px solid #f2e2c4", borderRadius: 10, padding: 12, marginBottom: 16,
            fontSize: 13, color: "#3c4457",
          }}>
            Focused on the lowest-scoring parameter: <strong>{card.focus || "—"}</strong>
          </div>
          {(card.prompts || []).map((q, idx) => (
            <div key={idx} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: idx < (card.prompts || []).length - 1 ? "1px solid #f0f1f6" : "none" }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", background: "#eef1ff", color: "#3d5df0",
                fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>{idx + 1}</div>
              <div style={{ fontSize: 13, color: "#3c4457", lineHeight: 1.5 }}>{q}</div>
            </div>
          ))}
        </div>
      );
    case "fit":
      return (
        <div>
          {card.company ? (
            <>
              <div style={{
                display: "inline-block", fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
                color: card.company.tone === "strong" ? "#2f7a52" : "#6c6033",
                background: card.company.tone === "strong" ? "#eaf7ef" : "#fbf6e6",
                marginBottom: 12,
              }}>{card.company.echo || "Neutral"}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#5c6580", marginBottom: 10 }}>
                ALIGNMENT WITH {card.company.name ? card.company.name.toUpperCase() : "COMPANY"}
              </div>
              {(card.company.dims || []).length ? <PieChart data={card.company.dims} /> : null}
              <p style={{ fontSize: 13, color: "#3c4457", lineHeight: 1.6, margin: "16px 0 14px" }}>
                {card.company.summary || "This candidate's profile partially echoes the company's character."}
              </p>
              <div style={{ fontSize: 12, color: "#8892a8" }}>
                Set a company profile (name, founder, founded year) to sharpen this reading further.
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "#3c4457", lineHeight: 1.6, margin: "0 0 14px" }}>
                No company numerology profile is set up yet, so this reading is on hold.
              </p>
              <div style={{ fontSize: 12, color: "#8892a8" }}>
                Set a company profile (name, founder, founded year) to compare the candidate's
                rhythm against an organisation's founding character.
              </div>
            </>
          )}
        </div>
      );
    default:
      return null;
  }
}

/* ---------------------------------------------------------
   Full-screen feature detail
--------------------------------------------------------- */

function FeatureDetail({ feature, onBack }) {
  const Icon = feature.icon;
  return (
    <div style={{
      width: "100%", minHeight: "70vh", boxSizing: "border-box", background: "#f7f8fb",
      fontFamily: "'Inter', ui-sans-serif, -apple-system, system-ui, sans-serif",
    }}>
      <div style={{
        borderBottom: "1px solid #e7eaf3", padding: "14px 20px", display: "flex",
        alignItems: "center", gap: 14, background: "#fff",
      }}>
        <button onClick={onBack} style={{
          background: "#f2f3f8", border: "1px solid #e7eaf3", borderRadius: 8, padding: "6px 12px",
          fontSize: 13, color: "#3c4457", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          flexShrink: 0,
        }}>
          <ArrowLeft size={14} /> Back
        </button>
        <div style={{
          width: 32, height: 32, borderRadius: 9, background: "#eef1ff",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon size={16} color="#3d5df0" />
        </div>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: "#1c2333" }}>{feature.title}</div>
      </div>

      <div style={{ maxWidth: feature.id === "drivers" ? 860 : 640, margin: "0 auto", padding: "24px 20px 60px" }}>
        <p style={{ fontSize: 13.5, color: "#8892a8", marginTop: 0, marginBottom: 22, lineHeight: 1.55 }}>{feature.desc}</p>
        {feature.id === "drivers" ? <BehavioralDriversDetail elements={feature.elements} /> : <CardDetail card={feature} />}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Screen 5 — Report
--------------------------------------------------------- */

function ReportScreen({ name, hasDob, scoreValue, cards, onBack, onUnlock, employeeId }) {
  const [activeFeature, setActiveFeature] = useState(null);

  if (activeFeature) {
    return <FeatureDetail feature={activeFeature} onBack={() => setActiveFeature(null)} />;
  }

  function handleDownloadPdf() {
    const token = localStorage.getItem('token');
    window.open(`/api/admin/employees/${employeeId}/numerology/pdf${token ? `?token=${token}` : ''}`, '_blank');
  }

  return (
    <div style={{
      width: "100%", minHeight: "70vh", boxSizing: "border-box", background: "#f7f8fb",
      fontFamily: "'Inter', ui-sans-serif, -apple-system, system-ui, sans-serif",
    }}>
      <div style={{
        borderBottom: "1px solid #e7eaf3", padding: "14px 20px", display: "flex",
        alignItems: "center", gap: 16, background: "#fff",
      }}>
        <button onClick={onBack} style={{
          background: "#f2f3f8", border: "1px solid #e7eaf3", borderRadius: 8, padding: "6px 12px",
          fontSize: 13, color: "#3c4457", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
        }}>
          <ArrowLeft size={14} /> Back to list
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1c2333", flex: 1 }}>Score: {name}</div>
        <button onClick={handleDownloadPdf} style={{
          background: "#3d5df0", border: "none", borderRadius: 8, padding: "7px 14px",
          fontSize: 12.5, fontWeight: 600, color: "#fff", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <Download size={14} /> Download PDF
        </button>
      </div>

      <div style={{ padding: "0 20px", background: "#fff", borderBottom: "1px solid #e7eaf3" }}>
        <div style={{ display: "flex", gap: 22, fontSize: 13.5 }}>
          <div style={{ padding: "12px 0", color: "#8892a8" }}>Scorecard</div>
          <div style={{ padding: "12px 0", color: "#3d5df0", fontWeight: 600, borderBottom: "2px solid #3d5df0" }}>Inner Intelligence</div>
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "24px 20px 60px" }}>
        {!hasDob && (
          <div style={{
            background: "#fff8ef", border: "1px solid #f2e2c4", borderRadius: 12, padding: "14px 16px",
            fontSize: 13, color: "#7a5c14", marginBottom: 20, lineHeight: 1.5,
          }}>
            Date of Birth is not available. Please update the candidate's Date of Birth in Add Candidate. This is a name-only preview.
          </div>
        )}

        <div style={{
          background: "#fff", border: "1px solid #e7eaf3", borderRadius: 14, padding: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1c2333", marginBottom: 4 }}>{name}</div>
            <div style={{ fontSize: 13, color: "#8892a8" }}>Full behavioral profile — 6 categories, 4 elements, 21 parameters, plus fit signals.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, color: "#a4700e", background: "#fff3dc",
              padding: "5px 12px", borderRadius: 99,
            }}>{scoreLabelFor(scoreValue)}</div>
            <ScoreRing value={scoreValue} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {cards.map((c) => {
            const locked = c.gated && !hasDob;
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                onClick={() => !locked && setActiveFeature(c)}
                style={{
                  textAlign: "left", background: "#fff", border: "1px solid #e7eaf3", borderRadius: 14,
                  padding: 18, cursor: locked ? "default" : "pointer", opacity: locked ? 0.55 : 1,
                  display: "flex", flexDirection: "column", gap: 10, width: "100%",
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 9, background: "#eef1ff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {locked ? <Lock size={16} color="#3d5df0" /> : <Icon size={16} color="#3d5df0" />}
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "#1c2333" }}>{c.title}</div>
                <div style={{ fontSize: 12.5, color: "#8892a8", lineHeight: 1.5, minHeight: 32 }}>{c.desc}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: "#3d5df0", fontWeight: 600 }}>{c.meta}</span>
                  {!locked && <ChevronRight size={14} color="#b7bdd0" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Root — wired to live backend data
--------------------------------------------------------- */

export default function ExactInnerIntelligence({ employeeId }) {
  const [step, setStep] = useState("intro");
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [hasDob, setHasDob] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gated, setGated] = useState(false);

  const [elements, setElements] = useState([]);
  const [sig, setSig] = useState(null);
  const [triguna, setTriguna] = useState([]);
  const [deeper, setDeeper] = useState([]);
  const [conclusion, setConclusion] = useState(null);
  const [prep, setPrep] = useState(null);
  const [company, setCompany] = useState(null);
  const [scoreValue, setScoreValue] = useState(0);
  const [categories, setCategories] = useState(null);
  const [maskedTraits, setMaskedTraits] = useState([]);

  async function loadAll() {
    setGated(false);
    try {
      const sc = await api.get(`/api/admin/employees/${employeeId}/scorecard`).catch(() => null);
      const cand = sc?.scorecard || null;
      const candName = cand?.applicant_name || "";
      setName((prev) => prev || candName);

      const cn = await api.get(`/api/admin/employees/${employeeId}/tri-nature/core-numbers`).catch(() => null);
      const hasProfile = !!(cn && cn.hasProfile && cn.dob);
      setHasDob(hasProfile);
      if (cn && cn.dob) setDob(cn.dob);
      if (cn && cn.name) setName(cn.name);

      const [t, n, o, p, c] = await Promise.all([
        api.get(`/api/admin/employees/${employeeId}/tri-nature`).catch(() => null),
        api.get(`/api/admin/employees/${employeeId}/numerology/numo-params`).catch(() => null),
        api.get(`/api/admin/employees/${employeeId}/overall-conclusion`).catch(() => null),
        api.get(`/api/admin/employees/${employeeId}/numerology/interview-prep`).catch(() => null),
        api.get(`/api/admin/employees/${employeeId}/numerology/company-match`).catch(() => null),
      ]);

      if (t && t.hasProfile && t.elements) {
        const elKeys = Object.keys(ELEMENT_META);
        const build = elKeys.map((dk) => {
          const internal = Object.keys(INTERNAL_TO_DISPLAY).find((k) => INTERNAL_TO_DISPLAY[k] === dk);
          const meta = ELEMENT_META[dk];
          const params = t.parameters
            ? Object.entries(t.parameters)
                .filter(([, p]) => p.element === internal)
                .map(([pname, p]) => ({ name: pname, score: p.score, light: p.light, shadow: p.shadow }))
            : [];
          return { key: dk, sub: meta.sub, fit: meta.fit, color: meta.color, tint: meta.tint, icon: meta.icon, score: t.elements[internal] ?? 0, params };
        });
        setElements(build);
        setSig(t.signature || null);
        const raw = t.triguna && t.triguna.raw ? t.triguna.raw : {};
        setTriguna([
          { label: TRIGUNA_META.Sattva.label, value: raw.Sattva ?? 0, color: TRIGUNA_META.Sattva.color },
          { label: TRIGUNA_META.Rajas.label, value: raw.Rajas ?? 0, color: TRIGUNA_META.Rajas.color },
          { label: TRIGUNA_META.Tamas.label, value: raw.Tamas ?? 0, color: TRIGUNA_META.Tamas.color },
        ].filter((x) => x.value > 0));
        setCategories(t.categories || null);
        setMaskedTraits(t.maskedTraits || []);
      } else {
        setElements([]);
        setSig(null);
        setTriguna([]);
        setCategories(null);
        setMaskedTraits([]);
      }

      const params = (n && n.params) || [];
      setDeeper(params.map((p) => ({
        name: p.name,
        score: Math.round(p.score || 0),
        outcome: p.outcome || "Neutral",
      })));

      const conc = (o && o.conclusion) || null;
      setConclusion(conc);
      setPrep(p || null);

      if (c && c.hasComparison) {
        const dims = (c.alignment && c.alignment.dimensions) || [];
        setCompany({
          name: c.company?.name || "Company",
          echo: c.echo || c.outcome || "Neutral",
          tone: c.tone || "neutral",
          summary: c.supportNarrative || "",
          dims: dims.map((d) => {
            const diff = d.diff != null ? d.diff : 2;
            const value = Math.max(15, Math.min(85, Math.round(78 - diff * 12)));
            return { label: `${d.dimension.replace(" Alignment", "")} match`, value, color: "#3d5df0" };
          }).map((d, i) => ({ ...d, color: ["#3d5df0", "#5da88f", "#c7607a"][i % 3] })),
        });
      } else {
        setCompany(null);
      }

      const wPct = cand && cand.weighted_pct != null ? cand.weighted_pct : null;
      if (wPct != null) {
        setScoreValue(wPct);
      } else if (t && t.hasProfile && t.elements) {
        const vals = Object.values(t.elements).filter((v) => typeof v === "number");
        setScoreValue(vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0);
      } else {
        setScoreValue(0);
      }
    } catch (e) {
      if (String(e.message).toLowerCase().includes("not enabled")) setGated(true);
    }
  }

  useEffect(() => { loadAll(); }, [employeeId]);

  async function handleContinue() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (dob) {
        await api.post(`/api/admin/employees/${employeeId}/numerology`, JSON.stringify({ date_of_birth: dob, numerology_name: name.trim() }));
        setHasDob(true);
      } else {
        setHasDob(false);
      }
      await loadAll();
      setStep("loading");
    } catch (e) {
      alert(e.message);
      setStep("date");
    } finally {
      setSaving(false);
    }
  }

  if (gated) {
    return (
      <div style={{ maxWidth: 480, margin: "40px auto", textAlign: "center", color: "#5c6480", fontFamily: "Inter, sans-serif", fontSize: 13 }}>
        Inner Intelligence is not enabled. Set ENABLE_INNER_INTELLIGENCE=true and restart the backend.
      </div>
    );
  }

  const numoAvg = deeper.length
    ? Math.round((deeper.reduce((a, d) => a + d.score, 0) / deeper.length) * 20)
    : 0;

  const greenTop = conclusion ? conclusion.greenFlags.slice(0, 3) : [];
  const redTop = conclusion ? conclusion.redFlags.slice(0, 3) : [];
  const rankItems = [
    ...greenTop.map((f) => ({ name: f.name, value: Number(f.score) || 0, color: "#2f7a52" })),
    ...redTop.map((f) => ({ name: f.name, value: Number(f.score) || 0, color: "#a4700e" })),
  ];

  const cards = [
    {
      id: "drivers", icon: Gem, title: "Behavioral Drivers",
      desc: "4 elements · 21 parameters, with strengths and edges, scored and explained.",
      meta: `${elements.length} elements`, gated: true, elements,
    },
    {
      id: "signature", icon: Compass, title: "Core Signature",
      desc: sig ? `${sig.name} — dominant behavioral pattern and communication archetype.` : "Dominant behavioral pattern and communication archetype.",
      meta: sig ? humanKey(sig.key) : "—", gated: true, sig, triguna,
    },
    {
      id: "conclusion", icon: Flag, title: "Overall Conclusion",
      desc: conclusion
        ? `${greenTop.length} green flags, ${redTop.length} worth exploring — plus the final read.`
        : "Green flags, worth-exploring signals, best parts, and the final read.",
      meta: conclusion ? `${greenTop.length} green · ${redTop.length} watch` : "—",
      gated: true, rankItems, verdict: conclusion ? conclusion.finalVerdict : "",
    },
    {
      id: "categories", icon: Sparkles, title: "6 Categories",
      desc: "Expression, Attitude, Unmasked, Personality, Soul Urge — plus Masked traits for interview.",
      meta: "6 lenses", gated: true, categories, maskedTraits,
    },
    {
      id: "deeper", icon: Sparkles, title: "Deeper Parameters",
      desc: "Six additional lenses — stillness, luck, harmony, destiny, karmic balance, and intuition.",
      meta: numoAvg ? `${numoAvg}/100 avg` : "Inner Intelligence", gated: true, deeper,
    },
    {
      id: "prep", icon: PenLine, title: "Interview Prep",
      desc: prep && prep.focus
        ? `Focus: ${prep.focus} — 3 conversation openers from this candidate's own signals.`
        : "Conversation openers generated straight from this candidate's own signals.",
      meta: "3 prompt sets", gated: true,
      focus: prep ? prep.focus : null,
      prompts: prep ? prep.prompts : [],
    },
    {
      id: "fit", icon: Building2, title: "Company Fit",
      desc: company
        ? `How the candidate's current profile echoes ${company.name}'s founding character.`
        : "How this candidate's profile aligns with an organisation's founding character.",
      meta: company ? company.name : "No company set", gated: false, company,
    },
  ];

  return (
    <div style={{ width: "100%", height: "100%", borderRadius: 0, overflow: "auto", boxSizing: "border-box" }}>
      <style>{`
        .ii-dark-screen, .ii-dark-screen h1, .ii-dark-screen h2, .ii-dark-screen h3,
        .ii-dark-screen p, .ii-dark-screen span, .ii-dark-screen div, .ii-dark-screen label,
        .ii-dark-screen button, .ii-dark-screen input {
          color: #ffffff !important;
        }
        .ii-dark-screen input::placeholder { color: rgba(255,255,255,0.5) !important; }
      `}</style>
      {step === "intro" && <IntroScreen onStart={() => setStep("date")} />}

      {step === "date" && (
        <DateScreen
          name={name} setName={setName} dob={dob} hasDob={hasDob} saving={saving}
          onContinue={handleContinue}
          onSkip={() => { setHasDob(false); setStep("loading"); }}
        />
      )}

      {step === "loading" && <LoadingScreen onDone={() => setStep("filled")} />}

      {step === "filled" && (
        <FilledScreen
          name={name} dob={dob} hasDob={hasDob}
          onOpenReport={() => setStep("report")}
          onBack={() => setStep("date")}
        />
      )}

      {step === "report" && (
        <ReportScreen
          name={name} hasDob={hasDob} scoreValue={scoreValue} cards={cards}
          onBack={() => setStep("intro")}
          onUnlock={() => setStep("date")}
          employeeId={employeeId}
        />
      )}
    </div>
  );
}