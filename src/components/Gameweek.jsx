import { useEffect, useMemo, useRef, useState } from "react";
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../firebase.js";
import { aiPredictionFor, predict1x2 } from "../poisson.js";
import MatchCard from "./MatchCard.jsx";

const C = {
  accent: "#c9f24d",
  text: "#f4f5ef",
  mutedText: "#9aa08a",
  border: "rgba(255,255,255,0.09)",
  card: "rgba(255,255,255,0.035)",
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const toMillis = (k) =>
  !k ? 0 : typeof k.toMillis === "function" ? k.toMillis() : k.seconds ? k.seconds * 1000 : new Date(k).getTime();
const outcomeOf = (h, a) => (h > a ? "1" : h === a ? "X" : "2");

function fmtCountdown(ms) {
  if (ms <= 0) return "0m";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Group matches into gameweeks by `matchday`. Matches with no matchday
// (cup ties, or older docs synced before the field existed) fall into a
// single "Other" bucket keyed null.
function buildGameweeks(matches) {
  const byGw = new Map();
  for (const m of matches) {
    const key = m.matchday ?? null;
    if (!byGw.has(key)) byGw.set(key, []);
    byGw.get(key).push(m);
  }
  const weeks = [...byGw.entries()]
    .map(([number, ms]) => {
      const sorted = ms.slice().sort((a, b) => toMillis(a.kickoff) - toMillis(b.kickoff));
      return {
        number,
        matches: sorted,
        firstKickoff: toMillis(sorted[0].kickoff),
        lastKickoff: toMillis(sorted[sorted.length - 1].kickoff),
      };
    })
    .sort((a, b) => {
      if (a.number == null) return 1;
      if (b.number == null) return -1;
      return a.number - b.number;
    });
  return weeks;
}

export default function Gameweek({ matches, user, predictions, onRequireSignIn }) {
  const [now, setNow] = useState(Date.now());
  const [filling, setFilling] = useState(false);
  const [activeGw, setActiveGw] = useState(null); // null = auto (current)
  const fillRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const weeks = useMemo(() => buildGameweeks(matches), [matches]);

  // Current gameweek = earliest week that still has an unlocked fixture;
  // if all are locked/finished, show the latest week.
  const currentNumber = useMemo(() => {
    const live = weeks.find((w) => w.matches.some((m) => m.status !== "finished" && toMillis(m.kickoff) > now));
    return (live || weeks[weeks.length - 1])?.number ?? null;
  }, [weeks, now]);

  const shownNumber = activeGw !== null ? activeGw : currentNumber;
  const week = weeks.find((w) => w.number === shownNumber) || weeks[0];

  if (!week) return <p style={{ color: C.mutedText, textAlign: "center", padding: 24 }}>No fixtures yet.</p>;

  // Header stats for the shown week.
  const total = week.matches.length;
  const openMatches = week.matches.filter((m) => m.status !== "finished" && toMillis(m.kickoff) > now);
  const pickedCount = week.matches.filter((m) => predictions[m.id]?.outcome).length;
  const unpickedOpen = openMatches.filter((m) => !predictions[m.id]?.outcome);
  const nextLock = openMatches.reduce((min, m) => Math.min(min, toMillis(m.kickoff)), Infinity);
  const hasBanker = week.matches.some((m) => predictions[m.id]?.isBanker);

  // §2.2 C — fill every unpicked, still-open fixture with the model result.
  async function fillFromModel() {
    if (!user) return onRequireSignIn?.();
    if (fillRef.current || unpickedOpen.length === 0) return;
    fillRef.current = true;
    setFilling(true);
    try {
      const batch = writeBatch(db);
      for (const m of unpickedOpen) {
        const ai = aiPredictionFor(m);
        const score = ai || { home: 1, away: 0 };
        const oc = m.odds ? { H: "1", D: "X", A: "2" }[predict1x2(m.odds.lh, m.odds.la)] : outcomeOf(score.home, score.away);
        batch.set(
          doc(db, "predictions", `${user.uid}_${m.id}`),
          {
            uid: user.uid,
            matchId: m.id,
            outcome: oc,
            scoreExact: false,
            isBanker: false,
            home: clamp(score.home, 0, 9),
            away: clamp(score.away, 0, 9),
            displayName: user.displayName || "Anonymous",
            photoURL: user.photoURL || "",
            autoFilled: true,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      await batch.commit();
    } catch (e) {
      console.error("Fill failed:", e);
      alert("Couldn't fill the gameweek — " + (e.code || e.message));
    } finally {
      fillRef.current = false;
      setFilling(false);
    }
  }

  return (
    <div>
      {/* gameweek switcher */}
      {weeks.length > 1 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 4 }}>
          {weeks.map((w) => {
            const on = w.number === shownNumber;
            return (
              <button
                key={String(w.number)}
                onClick={() => setActiveGw(w.number)}
                style={{
                  flex: "0 0 auto",
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: `1px solid ${on ? C.accent : C.border}`,
                  background: on ? C.accent : "transparent",
                  color: on ? "#0c0f08" : C.mutedText,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {w.number == null ? "Cup / Other" : `GW ${w.number}`}
              </button>
            );
          })}
        </div>
      )}

      {/* persistent header (§2.4) */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "#0e1109",
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "12px 14px",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ color: C.text, fontWeight: 800, fontSize: 15 }}>
              {week.number == null ? "Cup / Other" : `Gameweek ${week.number}`}
            </div>
            <div style={{ color: C.mutedText, fontSize: 12, marginTop: 2 }}>
              <b style={{ color: pickedCount === total ? C.accent : C.text }}>{pickedCount}</b> / {total} picked
              {nextLock !== Infinity && <> · next lock in <b style={{ color: C.accent }}>{fmtCountdown(nextLock - now)}</b></>}
              {nextLock === Infinity && <> · all locked</>}
            </div>
          </div>

          {unpickedOpen.length > 0 && (
            <button
              onClick={fillFromModel}
              disabled={filling}
              style={{
                flex: "0 0 auto",
                padding: "9px 12px",
                borderRadius: 10,
                border: "none",
                background: C.accent,
                color: "#0c0f08",
                fontWeight: 800,
                fontSize: 13,
                cursor: filling ? "wait" : "pointer",
              }}
            >
              {filling ? "Filling…" : `⚡ Fill ${unpickedOpen.length} from model`}
            </button>
          )}
        </div>

        {/* progress bar */}
        <div style={{ height: 4, borderRadius: 4, background: "rgba(255,255,255,0.08)", marginTop: 10, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${total ? (pickedCount / total) * 100 : 0}%`, background: C.accent, transition: "width .3s" }} />
        </div>

        {!hasBanker && openMatches.length > 0 && (
          <div style={{ color: C.mutedText, fontSize: 11, marginTop: 8 }}>
            ☆ Tip: mark one pick as your <b style={{ color: C.accent }}>Banker</b> for 2× points &amp; 2× roast.
          </div>
        )}
      </div>

      {/* fixtures */}
      {week.matches.map((m) => (
        <MatchCard
          key={m.id}
          match={m}
          user={user}
          prediction={predictions[m.id]}
          onRequireSignIn={onRequireSignIn}
          siblingBanker={hasBanker}
          gameweekMatches={week.matches}
          allPredictions={predictions}
        />
      ))}
    </div>
  );
}
