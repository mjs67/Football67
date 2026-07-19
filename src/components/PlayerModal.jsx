// src/components/PlayerModal.jsx
// Opens when a player's name is tapped on the leaderboard. Shows:
//   1. A rank-based roast (playerRoasts.js) — deterministic per player.
//   2. Their scored-percentage stat.
//   3. A cumulative points trajectory (inline SVG, same house style as the
//      FormGraph in MyPicks), with the +67 champion bonus as a final spike.
//
// All three come straight off the leaderboard row, which is the (public) user
// doc that recompute.js populates with `pointsHistory` and `overallRank`. So
// in steady state the modal makes NO Firestore reads and needs NO security-
// rule changes — everything is already in hand and readable by anyone.
//
// The only async path is a one-time fallback: if `overallRank` hasn't been
// written yet (a deploy before recompute has run with the new fields), we
// resolve rank from the public users table so the roast still appears. The
// trajectory has no fallback — it simply waits for the next recompute.
import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../firebase.js";
import { displayNameOf } from "../nameUtils.js";
import { compareStandings } from "../standings.js";
import { roastForRank } from "../playerRoasts.js";
import { Avatar } from "./PlayerIdentity.jsx";

const CHAMPION_BONUS = 67;

function Trajectory({ points }) {
  if (!points || points.length < 2) {
    return (
      <p style={{ fontSize: "13px", color: "rgba(244,244,240,0.45)", margin: "8px 0 0" }}>
        Not enough settled picks yet to chart a trajectory.
      </p>
    );
  }

  const W = 600, H = 180, padX = 10, padTop = 16, padBottom = 26;
  const max = Math.max(...points.map((p) => p.cum), 1);
  const x = (i) => padX + (i / (points.length - 1)) * (W - padX * 2);
  const y = (v) => H - padBottom - (v / max) * (H - padTop - padBottom);

  const line = points.map((p, i) => `${x(i)},${y(p.cum)}`).join(" ");

  const ticks = 4;
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max / ticks) * i));

  const dotColor = (kind) =>
    kind === "champ" || kind === "exact" ? "var(--volt)"
      : kind === "result" ? "rgba(200,255,30,0.55)"
        : "rgba(244,244,240,0.25)";

  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Cumulative points across ${points.length} scoring events, ending at ${last.cum}`}
      style={{ width: "100%", height: "auto", display: "block", marginTop: "6px" }}
    >
      {gridVals.map((v) => (
        <g key={v}>
          <line x1={padX} x2={W - padX} y1={y(v)} y2={y(v)} stroke="rgba(244,244,240,0.08)" strokeWidth="1" />
          <text x={padX} y={y(v) - 3} fill="rgba(244,244,240,0.35)" style={{ font: "400 11px var(--numeral, sans-serif)" }}>
            {v}
          </text>
        </g>
      ))}

      <polyline points={line} fill="none" stroke="var(--volt)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(i)} cy={y(p.cum)}
          r={p.kind === "champ" ? 5 : 3.5}
          fill={dotColor(p.kind)}
          stroke="var(--pitch)" strokeWidth={p.kind === "champ" ? 2 : 1}
        >
          <title>{`${p.label}: +${p.gained} (running ${p.cum})`}</title>
        </circle>
      ))}

      {last.kind === "champ" && (
        <text
          x={x(points.length - 1)} y={y(last.cum) - 10}
          textAnchor="end" fill="var(--volt)"
          style={{ font: "700 12px var(--numeral, sans-serif)" }}
        >
          +{CHAMPION_BONUS}
        </text>
      )}
    </svg>
  );
}

export default function PlayerModal({ row, onClose }) {
  const uid = row.id;
  const name = displayNameOf(row);
  const scored = (row.exact ?? 0) + (row.results ?? 0);
  const total = row.predictionsCount ?? 0;
  const pct = total > 0 ? Math.round((scored / total) * 100) : 0;
  const points = Array.isArray(row.pointsHistory) ? row.pointsHistory : [];

  // Stored rank is the steady-state path; fall back to a table query only if
  // recompute hasn't written overallRank yet.
  const [rank, setRank] = useState(row.overallRank ?? null);

  useEffect(() => {
    if (row.overallRank != null) return; // already have it — no read
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "users"), orderBy("points", "desc"), limit(100)));
        if (cancelled) return;
        const standings = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => compareStandings(a, b));
        const idx = standings.findIndex((u) => u.id === uid);
        setRank(idx >= 0 ? idx + 1 : standings.length + 1);
      } catch {
        if (!cancelled) setRank(null);
      }
    })();
    return () => { cancelled = true; };
  }, [uid, row.overallRank]);

  const roast = rank != null ? roastForRank(rank, uid, name) : null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={`${name} — points and roast`}
        style={{
          width: "100%", maxWidth: "560px",
          background: "var(--pitch)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "16px", padding: "20px",
          maxHeight: "90vh", overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
            <Avatar photoURL={row.photoURL} />
          </span>
          <p style={{ flex: 1, margin: 0, fontWeight: 600, fontSize: "16px", color: "var(--chalk)" }}>
            {name}
            {rank != null && (
              <span style={{ color: "rgba(244,244,240,0.4)", fontWeight: 500, fontSize: "13px", marginLeft: 8 }}>
                #{rank} overall
              </span>
            )}
          </p>
          <button
            onClick={onClose} aria-label="Close"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(244,244,240,0.5)", fontSize: "22px", lineHeight: 1, padding: "0 4px",
            }}
          >×</button>
        </div>

        {/* Roast */}
        {roast && (
          <div style={{
            display: "flex", gap: "8px", margin: "14px 0",
            padding: "12px 14px", borderRadius: "10px",
            background: "rgba(200,255,30,0.07)", border: "1px solid rgba(200,255,30,0.15)",
          }}>
            <span style={{ fontSize: "15px", flexShrink: 0, marginTop: "1px" }}>🔥</span>
            <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.55, color: "rgba(244,244,240,0.85)" }}>
              {roast}
            </p>
          </div>
        )}

        {/* Hit-rate stat */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span style={{ fontSize: "26px", fontWeight: 700, color: "var(--chalk)", fontFamily: "var(--numeral, sans-serif)" }}>
            {pct}%
          </span>
          <span style={{ fontSize: "13px", color: "rgba(244,244,240,0.6)" }}>scored</span>
        </div>
        <p style={{ margin: "2px 0 14px", fontSize: "13px", color: "rgba(244,244,240,0.4)" }}>
          {row.exact ?? 0} exact, {row.results ?? 0} right results across {total} matches
        </p>

        {/* Legend */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
          <span style={chip("rgba(200,255,30,0.15)", "var(--volt)")}>exact +5</span>
          <span style={chip("rgba(244,244,240,0.08)", "rgba(244,244,240,0.6)")}>result +3</span>
          <span style={chip("rgba(200,255,30,0.15)", "var(--volt)")}>champion +67</span>
        </div>

        {/* Trajectory (from stored history — no reads) */}
        <Trajectory points={points} />
      </div>
    </div>
  );
}

function chip(bg, color) {
  return {
    fontSize: "11px", padding: "3px 8px", borderRadius: "6px",
    background: bg, color, fontWeight: 500,
  };
}
