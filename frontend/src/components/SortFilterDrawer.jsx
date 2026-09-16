import { useState, useEffect } from "react";
import { api } from "../services/api";

const BASE_SECTIONS = [
  {
    id: "sort",
    label: "Sort by",
    type: "radio",
    options: ["Recently added", "Overall Score", "JD Match", "Name"],
    defaultValue: "Recently added",
    openByDefault: true,
  },
  {
    id: "order",
    label: "Order",
    type: "radio",
    options: ["High to low", "Low to high"],
    defaultValue: "High to low",
    openByDefault: true,
  },
  {
    id: "scoreRange",
    label: "Score",
    type: "checkbox",
    options: ["90-100 (Excellent)", "80-89 (Good)", "70-79", "Below 70"],
    defaultValue: [],
    openByDefault: true,
  },
  {
    id: "experience",
    label: "Experience",
    type: "checkbox",
    options: ["0-2 years", "2-5 years", "5+ years"],
    defaultValue: [],
    openByDefault: true,
  },
  {
    id: "evaluation",
    label: "Evaluation status",
    type: "radio",
    options: ["All", "Evaluated", "Not evaluated"],
    defaultValue: "All",
    openByDefault: true,
  },
];

function buildDefaultValues(sections) {
  const values = {};
  sections.forEach((s) => {
    values[s.id] = s.type === "checkbox" ? [...s.defaultValue] : s.defaultValue;
  });
  return values;
}

function countActiveFilters(values, sections) {
  let count = 0;
  sections.forEach((s) => {
    const current = values[s.id];
    const def = s.type === "checkbox" ? [...s.defaultValue].sort().join(",") : s.defaultValue;
    const cur = s.type === "checkbox" ? [...(current || [])].sort().join(",") : current;
    if (def !== cur) count += 1;
  });
  return count;
}

export default function SortFilterDrawer({ resultCount = 0, onApply = () => {} }) {
  const [jds, setJds] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [openSections, setOpenSections] = useState(() => {
    const state = {};
    BASE_SECTIONS.forEach((s) => (state[s.id] = s.openByDefault));
    return state;
  });

  const sections = [
    ...BASE_SECTIONS.slice(0, 2),
    ...(jds.length > 0 ? [{
      id: "jd",
      label: "JD",
      type: "checkbox",
      options: jds.map(j => j.title + (j.client ? ` · ${j.client}` : '')),
      defaultValue: [],
      openByDefault: false,
    }] : []),
    ...BASE_SECTIONS.slice(2),
  ];

  const [values, setValues] = useState(() => buildDefaultValues(sections));
  const [draft, setDraft] = useState(() => buildDefaultValues(sections));

  useEffect(() => {
    api.get("/api/admin/job-descriptions").then(setJds).catch(() => {});
  }, []);

  const activeCount = countActiveFilters(values, sections);

  function openDrawer() {
    setDraft({ ...values });
    setIsOpen(true);
  }
  function closeDrawer() { setIsOpen(false); }
  function toggleSection(id) { setOpenSections((p) => ({ ...p, [id]: !p[id] })); }
  function setRadioValue(sid, opt) { setDraft((p) => ({ ...p, [sid]: opt })); }
  function toggleCheckboxValue(sid, opt) {
    setDraft((p) => {
      const cur = p[sid] || [];
      return { ...p, [sid]: cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt] };
    });
  }
  function handleClearAll() { setDraft(buildDefaultValues(sections)); }
  function handleApply() {
    setValues({ ...draft });
    onApply({ ...draft });
    setIsOpen(false);
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={openDrawer} style={triggerBtn}>
          <span>Sort and filter</span>
          {activeCount > 0 && <span style={badge}>{activeCount}</span>}
        </button>
        <span style={{ fontSize: 13, color: "#6b6b6b" }}>{resultCount} results</span>
      </div>

      {isOpen && (
        <div style={scrim} onClick={closeDrawer}>
          <div style={drawer} onClick={(e) => e.stopPropagation()}>
            <div style={header}>
              <span style={{ fontWeight: 600, fontSize: 16 }}>Sort and filter</span>
              <button onClick={closeDrawer} aria-label="Close" style={iconBtn}>✕</button>
            </div>

            <div style={body}>
              {sections.map((section) => {
                const open = openSections[section.id];
                return (
                  <div key={section.id} style={sectionWrap}>
                    <button onClick={() => toggleSection(section.id)} style={sectionHead}>
                      <span>{section.label}</span>
                      <span style={{ display: "inline-block", transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
                    </button>
                    {open && (
                      <div style={sectionBody}>
                        {section.options.map((opt) => (
                          <label key={opt} style={optionLabel}>
                            <input
                              type={section.type}
                              name={section.id}
                              checked={section.type === "checkbox" ? (draft[section.id] || []).includes(opt) : draft[section.id] === opt}
                              onChange={() => section.type === "checkbox" ? toggleCheckboxValue(section.id, opt) : setRadioValue(section.id, opt)}
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={footer}>
              <button onClick={handleClearAll} style={secBtn}>Clear all</button>
              <button onClick={handleApply} style={priBtn}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const triggerBtn = { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #d9d9d4", borderRadius: 8, padding: "8px 14px", fontSize: 14, cursor: "pointer" };
const badge = { background: "#e6f1fb", color: "#185fa5", fontSize: 12, padding: "2px 7px", borderRadius: 10 };
const scrim = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", justifyContent: "flex-end", zIndex: 1000 };
const drawer = { width: 320, maxWidth: "90vw", height: "100%", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "-8px 0 24px rgba(0,0,0,0.12)" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #eceae3" };
const iconBtn = { background: "transparent", border: "none", fontSize: 16, cursor: "pointer", padding: 4 };
const body = { flex: 1, overflowY: "auto", padding: "4px 20px" };
const sectionWrap = { borderBottom: "1px solid #eceae3" };
const sectionHead = { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", padding: "14px 0", fontSize: 14, fontWeight: 500, cursor: "pointer", textAlign: "left" };
const sectionBody = { display: "flex", flexDirection: "column", gap: 10, paddingBottom: 14 };
const optionLabel = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#3d3d3a", cursor: "pointer" };
const footer = { display: "flex", gap: 10, padding: "16px 20px", borderTop: "1px solid #eceae3" };
const secBtn = { flex: 1, background: "#fff", border: "1px solid #d9d9d4", borderRadius: 8, padding: "10px 0", fontSize: 14, cursor: "pointer" };
const priBtn = { flex: 1, background: "#1a1a18", color: "#fff", border: "1px solid #1a1a18", borderRadius: 8, padding: "10px 0", fontSize: 14, cursor: "pointer" };
