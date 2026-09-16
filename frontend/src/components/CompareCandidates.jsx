import { useState, useEffect } from "react";
import { api } from "../services/api";

function scoreColor(s) {
  if (s >= 4) return "#16a34a";
  if (s === 3) return "#f5a623";
  if (s <= 2 && s > 0) return "#ef4444";
  return "#cbd5e1";
}

export default function CompareCandidates({ candidateIds, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!candidateIds || candidateIds.length < 2) return;
    setLoading(true);
    api
      .post("/api/admin/candidates/compare", { candidateIds })
      .then((res) => {
        setData(res.candidates);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || "Failed to load comparison");
        setLoading(false);
      });
  }, [candidateIds]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#5c6580" }}>
        Loading comparison...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>
        {error}
        <div style={{ marginTop: 12 }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 16px",
              border: "1px solid #ddd",
              borderRadius: 6,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  const paramRows = data[0].scores || [];

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1c2333" }}>
          Compare Candidates ({data.length})
        </h3>
        <button
          onClick={onClose}
          style={{
            padding: "6px 16px",
            border: "1px solid #ddd",
            borderRadius: 6,
            background: "#fff",
            cursor: "pointer",
            fontSize: 13,
            color: "#5c6580",
          }}
        >
          Close
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            minWidth: 600,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderBottom: "2px solid #e2e5f1",
                  color: "#5c6580",
                  fontWeight: 600,
                  minWidth: 160,
                  position: "sticky",
                  left: 0,
                  background: "#fff",
                  zIndex: 1,
                }}
              >
                Parameter
              </th>
              {data.map((c) => (
                <th
                  key={c.id}
                  style={{
                    textAlign: "center",
                    padding: "10px 12px",
                    borderBottom: "2px solid #e2e5f1",
                    minWidth: 130,
                  }}
                >
                  <div style={{ fontWeight: 700, color: "#1c2333", fontSize: 14 }}>
                    {c.name || "Unknown"}
                  </div>
                  <div style={{ fontWeight: 400, color: "#8892a8", fontSize: 11 }}>
                    {c.position || c.client || c.email || ""}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Overall Score Row */}
            <tr style={{ background: "#f8f9fc" }}>
              <td
                style={{
                  padding: "10px 12px",
                  fontWeight: 700,
                  color: "#1c2333",
                  borderBottom: "1px solid #eceef5",
                  position: "sticky",
                  left: 0,
                  background: "#f8f9fc",
                  zIndex: 1,
                }}
              >
                Overall Score
              </td>
              {data.map((c) => (
                <td
                  key={c.id}
                  style={{
                    textAlign: "center",
                    padding: "10px 12px",
                    borderBottom: "1px solid #eceef5",
                  }}
                >
                  {c.weighted_pct != null ? (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 12px",
                        borderRadius: 20,
                        background: c.badge.color,
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      {c.weighted_pct}%
                    </span>
                  ) : (
                    <span style={{ color: "#9CA3AF" }}>—</span>
                  )}
                  <div
                    style={{
                      fontSize: 11,
                      color: c.badge.color,
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    {c.badge.label}
                  </div>
                </td>
              ))}
            </tr>

            {/* JD Match Row */}
            <tr>
              <td
                style={{
                  padding: "8px 12px",
                  fontWeight: 600,
                  color: "#5c6580",
                  borderBottom: "1px solid #eceef5",
                  position: "sticky",
                  left: 0,
                  background: "#fff",
                  zIndex: 1,
                }}
              >
                JD Match
              </td>
              {data.map((c) => (
                <td
                  key={c.id}
                  style={{
                    textAlign: "center",
                    padding: "8px 12px",
                    borderBottom: "1px solid #eceef5",
                    fontWeight: 600,
                    color: c.capability_match_pct ? "#1c2333" : "#9CA3AF",
                  }}
                >
                  {c.capability_match_pct != null
                    ? `${c.capability_match_pct}%`
                    : "—"}
                </td>
              ))}
            </tr>

            {/* Parameter Rows */}
            {paramRows.map((param) => {
              const scores = data.map(
                (c) => c.scores.find((s) => s.parameter_id === param.parameter_id)?.score || 0
              );
              const maxScore = Math.max(...scores);
              const minScore = Math.min(...scores.filter((s) => s > 0));
              const hasRange = maxScore !== minScore && minScore > 0;

              return (
                <tr
                  key={param.parameter_id}
                  style={{ background: "#fff" }}
                >
                  <td
                    style={{
                      padding: "7px 12px",
                      borderBottom: "1px solid #f0f2f7",
                      position: "sticky",
                      left: 0,
                      background: "#fff",
                      zIndex: 1,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "#1c2333" }}>
                      {param.name}
                    </span>
                    <span style={{ color: "#8892a8", fontSize: 11, marginLeft: 4 }}>
                      (w:{param.weightage})
                    </span>
                  </td>
                  {data.map((c, ci) => {
                    const s =
                      c.scores.find((s) => s.parameter_id === param.parameter_id)
                        ?.score || 0;
                    const isBest = hasRange && s === maxScore;
                    const isWorst = hasRange && s === minScore && s > 0;
                    return (
                      <td
                        key={c.id}
                        style={{
                          textAlign: "center",
                          padding: "7px 12px",
                          borderBottom: "1px solid #f0f2f7",
                          background: isBest
                            ? "#f0fdf4"
                            : isWorst
                            ? "#fef2f2"
                            : undefined,
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: 28,
                            height: 28,
                            lineHeight: "28px",
                            borderRadius: 14,
                            background: scoreColor(s),
                            color: s > 0 ? "#fff" : "#cbd5e1",
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          {s || "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Strengths & Gaps Section */}
      <div style={{ marginTop: 20, padding: '16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#1c2333' }}>Strengths & Gaps</h4>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.length}, 1fr)`, gap: 16 }}>
          {data.map((c) => {
            const highScores = (c.scores || []).filter(s => s.score >= 4).map(s => s.name);
            const lowScores = (c.scores || []).filter(s => s.score <= 2 && s.score > 0).map(s => s.name);
            return (
              <div key={c.id} style={{ background: '#fff', borderRadius: 6, padding: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#1c2333', marginBottom: 8 }}>{c.name || 'Unknown'}</div>
                {highScores.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', marginBottom: 4 }}>Strengths</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {highScores.map((s, i) => <span key={i} style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 10 }}>{s}</span>)}
                    </div>
                  </div>
                )}
                {lowScores.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>Gaps</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {lowScores.map((s, i) => <span key={i} style={{ fontSize: 11, background: '#fef2f2', color: '#991b1b', padding: '2px 8px', borderRadius: 10 }}>{s}</span>)}
                    </div>
                  </div>
                )}
                {highScores.length === 0 && lowScores.length === 0 && (
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>No standout strengths or gaps</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
