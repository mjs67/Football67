import { useEffect, useMemo, useRef, useState } from "react";
import { doc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase.js";
import { matchProbs, pct, predict1x2, aiPredictionFor, scorePrediction } from "../poisson.js";

// ── theme tokens (match the app's dark / neon-lime look) ──
const C = {
  accent: "#c9f24d",
  mint: "#5ef2a8",
  coral: "#ff6b6b",
  text: "#f4f5ef",
  muted: "#8f948040",
  mutedText: "#9aa08a",
  card: "rgba(255,255,255,0.035)",
  border: "rgba(255,255,255,0.09)",
  chip: "rgba(255,255,255,0.05)",
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const toMillis = (k) =>
  !k ? 0 : typeof k.toMillis === "function" ? k.toMillis() : k.seconds ? k.seconds * 1000 : new Date(k).getTime();

function fmtCountdown(ms) {
  if (ms <= 0) return "locked";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// v2 §2.1 — outcome derived from a scoreline
const outcomeOf = (h, a) => (h > a ? "1" : h === a ? "X" : "2");

export default function MatchCard({ match, user, prediction, onRequireSignIn, gameweekMatches, allPredictions }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const kickoffMs = toMillis(match.kickoff);
  const settled = match.status === "finished";
  const locked = !settled && now >= kickoffMs;
  const open = !settled && !locked;

  // Live countdown — only tick while the card is still open.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  // Model numbers from the stored Poisson odds (absent on finished matches).
  const model = useMemo(() => {
    if (!match.odds) return null;
    const { ph, pd, pa } = matchProbs(match.odds.lh, match.odds.la);
    const ai = aiPredictionFor(match); // { home, away } most-likely scoreline
    const oc = { H: "1", D: "X", A: "2" }[predict1x2(match.odds.lh, match.odds.la)];
    return { pct: { "1": pct(ph), X: pct(pd), "2": pct(pa) }, score: ai, outcome: oc };
  }, [match]);

  const picked = prediction?.outcome || (prediction ? outcomeOf(prediction.home, prediction.away) : null);
  const hasExact = !!prediction?.scoreExact;

  // ── write-through autosave (§2.4: no submit button) ──
  async function writePick(next) {
    if (!user) return onRequireSignIn?.();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const ref = doc(db, "predictions", `${user.uid}_${match.id}`);
      await setDoc(
        ref,
        {
          uid: user.uid,
          matchId: match.id,
          // v2 fields
          outcome: next.outcome,
          scoreExact: !!next.scoreExact,
          isBanker: next.isBanker ?? prediction?.isBanker ?? false,
          // bridge fields (current rules require int home/away 0–15)
          home: clamp(next.home, 0, 9),
          away: clamp(next.away, 0, 9),
          displayName: user.displayName || "Anonymous",
          photoURL: user.photoURL || "",
          updatedAt: serverTimestamp(),
          ...(prediction ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true }
      );
    } catch (e) {
      console.error("Save failed:", e);
      alert("Couldn't save your pick — " + (e.code || e.message));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // Tap 1 / X / 2 → set result, default the scoreline from the model (§2.2 A).
  function pickOutcome(oc) {
    if (locked || settled) return;
    const base =
      model?.score && model.outcome === oc
        ? model.score
        : oc === "1"
        ? { home: 1, away: 0 }
        : oc === "X"
        ? { home: 1, away: 1 }
        : { home: 0, away: 1 };
    writePick({ outcome: oc, home: base.home, away: base.away, scoreExact: hasExact && picked === oc });
  }

  function saveExact(h, a) {
    writePick({ outcome: outcomeOf(h, a), home: h, away: a, scoreExact: true });
    setSheetOpen(false);
  }

  async function toggleBanker() {
    if (!picked || locked || settled || !user) return;
    const turningOn = !prediction.isBanker;
    // Turning OFF is a plain single write.
    if (!turningOn) {
      return writePick({ outcome: picked, home: prediction.home, away: prediction.away, scoreExact: hasExact, isBanker: false });
    }
    // Turning ON: one banker per gameweek — clear it from any still-open
    // sibling in the same gameweek in one atomic batch. Locked/finished
    // siblings are skipped (rules block edits after kickoff, and an atomic
    // batch would fail if it tried); that edge is finalised server-side in P3.
    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, "predictions", `${user.uid}_${match.id}`),
        {
          uid: user.uid, matchId: match.id, outcome: picked, scoreExact: hasExact,
          home: prediction.home, away: prediction.away, isBanker: true,
          displayName: user.displayName || "Anonymous", photoURL: user.photoURL || "",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      for (const sib of gameweekMatches || []) {
        if (sib.id === match.id) continue;
        const sp = allPredictions?.[sib.id];
        const sibOpen = sib.status !== "finished" && toMillis(sib.kickoff) > Date.now();
        if (sp?.isBanker && sibOpen) {
          batch.set(doc(db, "predictions", `${user.uid}_${sib.id}`), { isBanker: false, updatedAt: serverTimestamp() }, { merge: true });
        }
      }
      await batch.commit();
    } catch (e) {
      console.error("Banker toggle failed:", e);
      alert("Couldn't set banker — " + (e.code || e.message));
    }
  }

  // Settled scoring for the reveal (§2.5).
  const settledScore = settled ? scorePrediction(prediction, match) : null;
  const resultOutcome = settled ? outcomeOf(match.homeScore, match.awayScore) : null;
  const wasCorrect = settled && prediction && picked === resultOutcome;

  const kickoffLabel = new Date(kickoffMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${prediction?.isBanker ? C.accent : C.border}`,
        borderRadius: 16,
        padding: "14px 16px",
        marginTop: 12,
        position: "relative",
      }}
    >
      {/* header row: teams + status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>
          {match.home} <span style={{ color: C.mutedText, fontWeight: 400 }}>v</span> {match.away}
        </div>
        <StatusPill {...{ settled, locked, open, now, kickoffMs, kickoffLabel }} />
      </div>

      {/* competition / venue line */}
      {(match.competition || match.venue) && (
        <div style={{ color: C.mutedText, fontSize: 11, marginTop: 2 }}>
          {[match.competition, match.venue].filter(Boolean).join(" · ")}
        </div>
      )}

      {/* SETTLED reveal */}
      {settled ? (
        <SettledView
          match={match}
          prediction={prediction}
          picked={picked}
          hasExact={hasExact}
          wasCorrect={wasCorrect}
          score={settledScore}
        />
      ) : (
        <>
          {/* 1 / X / 2 chips with model % */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
            {["1", "X", "2"].map((oc) => {
              const active = picked === oc;
              const isModel = model?.outcome === oc;
              return (
                <button
                  key={oc}
                  disabled={locked}
                  onClick={() => (user ? pickOutcome(oc) : onRequireSignIn?.())}
                  style={{
                    padding: "10px 4px",
                    borderRadius: 12,
                    border: `1px solid ${active ? C.accent : C.border}`,
                    background: active ? C.accent : C.chip,
                    color: active ? "#0c0f08" : C.text,
                    fontWeight: 800,
                    cursor: locked ? "not-allowed" : "pointer",
                    opacity: locked && !active ? 0.4 : 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{oc === "1" ? "Home" : oc === "X" ? "Draw" : "Away"}</span>
                  {model && (
                    <span style={{ fontSize: 11, fontWeight: 600, opacity: active ? 0.8 : 0.6 }}>
                      {model.pct[oc]}%{isModel ? " ◆" : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* exact score + banker row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <button
              disabled={locked}
              onClick={() => (user ? setSheetOpen(true) : onRequireSignIn?.())}
              style={{
                flex: 1,
                padding: "9px 12px",
                borderRadius: 10,
                border: `1px dashed ${C.border}`,
                background: "transparent",
                color: hasExact ? C.text : C.mutedText,
                fontWeight: 600,
                cursor: locked ? "not-allowed" : "pointer",
                opacity: locked ? 0.4 : 1,
              }}
            >
              {hasExact ? `Exact: ${prediction.home}–${prediction.away}` : "＋ Add exact score (+2)"}
            </button>

            <button
              disabled={!picked || locked}
              onClick={toggleBanker}
              aria-pressed={!!prediction?.isBanker}
              title="Banker: 2× points & 2× roast if right"
              style={{
                padding: "9px 12px",
                borderRadius: 10,
                border: `1px solid ${prediction?.isBanker ? C.accent : C.border}`,
                background: prediction?.isBanker ? "rgba(201,242,77,0.15)" : "transparent",
                color: prediction?.isBanker ? C.accent : C.mutedText,
                fontWeight: 700,
                cursor: !picked || locked ? "not-allowed" : "pointer",
                opacity: !picked || locked ? 0.4 : 1,
              }}
            >
              {prediction?.isBanker ? "🔥 Banker" : "☆ Banker"}
            </button>
          </div>

          {/* state footnote */}
          <div style={{ marginTop: 8, fontSize: 11, color: C.mutedText, minHeight: 14 }}>
            {locked
              ? "🔒 Locked at kickoff — your pick is frozen."
              : picked
              ? `Editable until ${kickoffLabel}${saving ? " · saving…" : " · saved ✓"}`
              : "Pick right, get roasted."}
          </div>
        </>
      )}

      {/* exact-score bottom sheet (§2.2 B) */}
      {sheetOpen && (
        <ScoreSheet
          initial={{ home: prediction?.home ?? model?.score?.home ?? 1, away: prediction?.away ?? model?.score?.away ?? 0 }}
          model={model?.score}
          onClose={() => setSheetOpen(false)}
          onSave={saveExact}
        />
      )}
    </div>
  );
}

function StatusPill({ settled, locked, open, now, kickoffMs, kickoffLabel }) {
  let label, color;
  if (settled) {
    label = "FT";
    color = C.mutedText;
  } else if (locked) {
    label = "LOCKED";
    color = C.coral;
  } else {
    label = `locks in ${fmtCountdown(kickoffMs - now)}`;
    color = C.accent;
  }
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color,
        border: `1px solid ${C.border}`,
        borderRadius: 999,
        padding: "3px 9px",
        whiteSpace: "nowrap",
      }}
    >
      {open ? `⏱ ${label}` : label}
    </span>
  );
}

function SettledView({ match, prediction, picked, hasExact, wasCorrect, score }) {
  const good = wasCorrect;
  const missed = !prediction;
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: missed ? "transparent" : good ? "rgba(94,242,168,0.12)" : "rgba(255,107,107,0.12)",
          border: `1px solid ${missed ? C.border : good ? C.mint : C.coral}`,
          borderRadius: 12,
          padding: "10px 12px",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18, color: C.text }}>
          {match.homeScore}–{match.awayScore}
        </div>
        {missed ? (
          <div style={{ color: C.mutedText, fontSize: 12 }}>You ghosted this one — no roast, no points.</div>
        ) : (
          <div style={{ textAlign: "right" }}>
            <div style={{ color: good ? C.mint : C.coral, fontWeight: 700, fontSize: 13 }}>
              You: {picked === "1" ? "Home" : picked === "X" ? "Draw" : "Away"}
              {hasExact ? ` ${prediction.home}–${prediction.away}` : ""} {prediction.isBanker ? "🔥" : ""}
            </div>
            <div style={{ color: C.mutedText, fontSize: 12 }}>
              {score?.total ? `+${score.total} pts` : "0 pts"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// §2.2 B — steppers 0–9 + "use model score"
function ScoreSheet({ initial, model, onClose, onSave }) {
  const [h, setH] = useState(initial.home);
  const [a, setA] = useState(initial.away);
  const step = (setter, v, d) => setter(clamp(v + d, 0, 9));

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40 }} />
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 41,
          background: "#14170e",
          borderTop: `1px solid ${C.border}`,
          borderRadius: "18px 18px 0 0",
          padding: "18px 18px 26px",
          maxWidth: 520,
          margin: "0 auto",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 4, background: C.border, margin: "0 auto 14px" }} />
        <div style={{ color: C.text, fontWeight: 700, textAlign: "center", marginBottom: 16 }}>Exact score</div>

        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 18 }}>
          <Stepper value={h} onDec={() => step(setH, h, -1)} onInc={() => step(setH, h, 1)} />
          <span style={{ color: C.mutedText, fontWeight: 800, fontSize: 22 }}>–</span>
          <Stepper value={a} onDec={() => step(setA, a, -1)} onInc={() => step(setA, a, 1)} />
        </div>

        {model && (
          <button
            onClick={() => {
              setH(model.home);
              setA(model.away);
            }}
            style={{
              display: "block",
              margin: "18px auto 0",
              padding: "8px 14px",
              borderRadius: 999,
              border: `1px solid ${C.border}`,
              background: "transparent",
              color: C.accent,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ⚡ Use model score ({model.home}–{model.away})
          </button>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "12px", borderRadius: 12, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontWeight: 700, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(h, a)}
            style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: C.accent, color: "#0c0f08", fontWeight: 800, cursor: "pointer" }}
          >
            Save {h}–{a}
          </button>
        </div>
      </div>
    </>
  );
}

function Stepper({ value, onDec, onInc }) {
  const btn = {
    width: 44,
    height: 44,
    borderRadius: 12,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: C.text,
    fontSize: 22,
    fontWeight: 800,
    cursor: "pointer",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button onClick={onDec} style={btn} aria-label="decrease">−</button>
      <span style={{ minWidth: 30, textAlign: "center", color: C.accent, fontWeight: 900, fontSize: 30 }}>{value}</span>
      <button onClick={onInc} style={btn} aria-label="increase">+</button>
    </div>
  );
}
