import { useEffect, useState } from "react";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { sharePickCard } from "../shareCard.js";
import { scorePrediction, aiPredictionFor } from "../poisson.js";

export default function MyPicks({ user, matches, predictions, onRequireSignIn }) {
  if (!user) {
    return (
      <p className="empty">
        <button className="btn solid" onClick={onRequireSignIn}>
          Sign in
        </button>
        <br />
        <br />
        Sign in to see your prediction history.
      </p>
    );
  }
  return (
    <>
      <StatsRow matches={matches} predictions={predictions} />
      <ShareCardButton user={user} matches={matches} predictions={predictions} />
      <FormGraph matches={matches} predictions={predictions} />
      <TiebreakerCard user={user} />
      <SettingsToggles user={user} />
      <History matches={matches} predictions={predictions} />
    </>
  );
}

function ShareCardButton({ user, matches, predictions }) {
  const [busy, setBusy] = useState(false);
  const [nickname, setNickname] = useState("");
  useEffect(
    () =>
      onSnapshot(doc(db, "users", user.uid), (s) =>
        setNickname(s.exists() ? s.data().nickname || "" : "")
      ),
    [user.uid]
  );
  const hasPicks = matches.some((m) => predictions[m.id]);
  if (!hasPicks) return null;
  return (
    <div className="panel row-panel">
      <div>
        <p className="panel-eyebrow">Share your picks</p>
        <p className="panel-note">
          Generate an image of your predictions to drop in the group chat. Receipts included.
        </p>
      </div>
      <button
        className="btn solid"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await sharePickCard({ user, matches, predictions, nickname });
          } catch (e) {
            alert(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Rendering…" : "Share card"}
      </button>
    </div>
  );
}

function FormGraph({ matches, predictions }) {
  const settled = matches
    .filter((m) => m.status === "finished" && predictions[m.id])
    .sort((a, b) => (a.kickoff?.toMillis?.() || 0) - (b.kickoff?.toMillis?.() || 0));

  if (settled.length < 2) return null;

  const userScores = settled.map((m) => scorePrediction(predictions[m.id], m));
  const aiScores = settled.map((m) => {
    const ai = aiPredictionFor(m);
    return ai ? scorePrediction(ai, m) : null;
  });
  const userRows = userScores.map((s) => s?.total ?? 0);
  const aiRows = aiScores.map((s) => s?.total ?? 0);
  const hasAi = aiScores.some((s) => s !== null && s !== undefined);

  const W = 600, H = 140, padX = 6, padY = 14;

  let cumU = 0, cumA = 0;
  const cumUser = userRows.map((p) => (cumU += p ?? 0));
  const cumAi   = aiRows.map((p)   => (cumA += p ?? 0));

  const allVals = [...cumUser, ...(hasAi ? cumAi : [])];
  const max = Math.max(...allVals, 1);

  const x = (i) => padX + (i / (settled.length - 1)) * (W - padX * 2);
  const y = (v) => H - padY - (v / max) * (H - padY * 2);

  const userLine = cumUser.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const aiLine   = cumAi.map((v, i)   => `${x(i)},${y(v)}`).join(" ");

  // Dot size/colour keys off whether the call landed exact / a result / a
  // points-scoring call at all (total > 0), so stacked knockout totals still
  // render sensibly rather than only matching the old literal 5/3 values.
  const rank = (s) => (s?.exact ? 2 : s?.total > 0 ? 1 : 0);
  const userRank = userScores.map(rank);
  const aiRank = aiScores.map(rank);

  const userExact  = userScores.filter((s) => s?.exact).length;
  const userResult = userScores.filter((s) => s?.result && !s?.exact).length;
  const userAcc    = Math.round((userScores.filter((s) => (s?.total ?? 0) > 0).length / settled.length) * 100);

  const aiExact    = aiScores.filter((s) => s?.exact).length;
  const aiResult   = aiScores.filter((s) => s?.result && !s?.exact).length;
  const aiAcc      = hasAi ? Math.round((aiScores.filter((s) => (s?.total ?? 0) > 0).length / settled.length) * 100) : null;

  const ptsDiff = cumUser[cumUser.length - 1] - (hasAi ? cumAi[cumAi.length - 1] : 0);

  return (
    <div className="panel">
      <p className="panel-eyebrow">Form</p>
      <svg
        className="form-graph"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Cumulative points over ${settled.length} settled picks`}
      >
        {/* AI model line (dashed, blue) */}
        {hasAi && (
          <>
            <polyline
              points={aiLine}
              fill="none"
              stroke="var(--blue)"
              strokeWidth="2.5"
              strokeDasharray="6 4"
              strokeLinejoin="round"
              opacity="0.8"
            />
            {cumAi.map((v, i) => (
              <circle
                key={"ai" + i}
                cx={x(i)}
                cy={y(v)}
                r={aiRank[i] === 2 ? 5 : aiRank[i] === 1 ? 4 : 2.5}
                fill="var(--blue)"
                opacity="0.75"
              />
            ))}
          </>
        )}
        {/* User line (solid, volt) */}
        <polyline points={userLine} fill="none" stroke="var(--volt)" strokeWidth="3" strokeLinejoin="round" />
        {cumUser.map((v, i) => (
          <circle
            key={"u" + i}
            cx={x(i)}
            cy={y(v)}
            r={userRank[i] === 2 ? 5 : userRank[i] === 1 ? 4 : 2.5}
            fill={userRank[i] === 2 ? "var(--volt)" : userRank[i] === 1 ? "var(--chalk)" : "var(--chalk-25)"}
          />
        ))}
      </svg>

      {/* Legend */}
      {hasAi && (
        <div className="form-legend">
          <span className="form-legend-item">
            <svg width="24" height="10" viewBox="0 0 24 10" aria-hidden="true">
              <line x1="0" y1="5" x2="24" y2="5" stroke="var(--volt)" strokeWidth="3" />
            </svg>
            You
          </span>
          <span className="form-legend-item">
            <svg width="24" height="10" viewBox="0 0 24 10" aria-hidden="true">
              <line x1="0" y1="5" x2="24" y2="5" stroke="var(--blue)" strokeWidth="2.5" strokeDasharray="6 4" />
            </svg>
            AI model
          </span>
        </div>
      )}

      {/* Summary */}
      <p className="panel-note" style={{ marginTop: "6px" }}>
        <b style={{ color: "var(--volt)" }}>You</b>{" "}
        {userAcc}% scored ({userExact} exact, {userResult} right results across {settled.length} matches)
        {hasAi && ptsDiff !== 0 && (
          <span
            className="form-vs-ai"
            style={{ background: ptsDiff > 0 ? "rgba(200,255,30,0.15)" : "rgba(255,107,92,0.15)",
                     color: ptsDiff > 0 ? "var(--volt)" : "var(--red)" }}
          >
            {ptsDiff > 0 ? "+" : ""}{ptsDiff} PTS VS AI
          </span>
        )}
        {hasAi && (
          <>
            <br />
            <b style={{ color: "var(--blue)" }}>AI</b>{" "}
            {aiAcc}% scored ({aiExact} exact, {aiResult} right results across {settled.length} matches)
          </>
        )}
      </p>
    </div>
  );
}

function StatsRow({ matches, predictions }) {
  let points = 0,
    exact = 0,
    results = 0,
    made = 0;
  matches.forEach((m) => {
    const p = predictions[m.id];
    if (!p) return;
    made++;
    const s = scorePrediction(p, m);
    if (!s) return;
    points += s.total;
    if (s.exact) exact++;
    else if (s.result) results++;
  });
  return (
    <div className="stats-row">
      <Stat label="Points" value={points} accent />
      <Stat label="Exact scores" value={exact} />
      <Stat label="Right results" value={results} />
      <Stat label="Picks made" value={made} />
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="stat-box">
      <span className={"stat-num" + (accent ? " accent" : "")}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function TiebreakerCard({ user }) {
  const [settings, setSettings] = useState(undefined); // undefined=loading, null=none
  const [mine, setMine] = useState(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        doc(db, "settings", "tiebreaker"),
        (s) => setSettings(s.exists() ? s.data() : null),
        () => setSettings(null)
      ),
    []
  );
  useEffect(
    () =>
      onSnapshot(doc(db, "tiebreakers", user.uid), (s) => {
        const d = s.exists() ? s.data() : null;
        setMine(d);
        if (d) setValue(String(d.value));
      }),
    [user.uid]
  );

  if (!settings) return null;
  const closed = settings.answer !== null && settings.answer !== undefined;

  async function save() {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 500) {
      alert("Enter a whole number between 0 and 500.");
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, "tiebreakers", user.uid), {
        uid: user.uid,
        value: n,
        updatedAt: serverTimestamp(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (e) {
      alert("Could not save tiebreaker: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <p className="panel-eyebrow">Tiebreaker</p>
      <p className="panel-q">{settings.question}</p>
      {closed ? (
        <p className="panel-note">
          Answer: <b className="accent-text">{settings.answer}</b>
          {mine && (
            <>
              {" "}
              · you said <b>{mine.value}</b> (off by {Math.abs(mine.value - settings.answer)})
            </>
          )}
          . Ties on the leaderboard are broken by closest guess.
        </p>
      ) : (
        <div className="tb-input-row">
          <input
            className="tb-input"
            type="number"
            min="0"
            max="500"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Tiebreaker answer"
            placeholder="0"
          />
          <button className="btn solid" onClick={save} disabled={saving || value === ""}>
            {saving ? "Saving…" : saved ? "Saved ✓" : mine ? "Update" : "Submit"}
          </button>
        </div>
      )}
    </div>
  );
}

function SettingsToggles({ user }) {
  const [autoPickOn, setAutoPickOn] = useState(null); // null = loading

  useEffect(
    () =>
      onSnapshot(doc(db, "users", user.uid), (s) =>
        setAutoPickOn(s.exists() ? !!s.data().autoPickOn : false)
      ),
    [user.uid]
  );

  async function toggle() {
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          displayName: user.displayName || "Anonymous",
          photoURL: user.photoURL || "",
          email: user.email || "",
          autoPickOn: !autoPickOn,
        },
        { merge: true }
      );
    } catch (e) {
      alert("Could not update setting: " + e.message);
    }
  }

  if (autoPickOn === null) return null;
  return (
    <Toggle
      eyebrow="Auto-pick safety net"
      note={
        autoPickOn
          ? "If you forget a match, a 1–1 is lodged for you just before kickoff so you're never blanked."
          : "Forget a deadline? Turn this on and a default 1–1 is lodged for you just before kickoff."
      }
      on={autoPickOn}
      onToggle={toggle}
    />
  );
}

function Toggle({ eyebrow, note, on, onToggle }) {
  return (
    <div className="panel row-panel">
      <div>
        <p className="panel-eyebrow">{eyebrow}</p>
        <p className="panel-note">{note}</p>
      </div>
      <button
        className={"switch" + (on ? " on" : "")}
        role="switch"
        aria-checked={on}
        aria-label={eyebrow}
        onClick={onToggle}
      >
        <span className="knob" />
      </button>
    </div>
  );
}

function History({ matches, predictions }) {
  const rows = matches
    .filter((m) => predictions[m.id])
    .slice()
    .sort((a, b) => (b.kickoff?.toMillis?.() || 0) - (a.kickoff?.toMillis?.() || 0));

  if (rows.length === 0)
    return <p className="empty">No picks yet — head to Fixtures and call some scores.</p>;

  return (
    <>
      <h2 className="section-label">All picks</h2>
      <ol className="picks">
        {rows.map((m) => {
          const p = predictions[m.id];
          const s = scorePrediction(p, m);
          const cls = s === null ? "" : s.exact ? " gold" : s.total > 0 ? " ok" : " zero";
          return (
            <li key={m.id} className="pick-row">
              <span className="pick-teams">
                {m.home} <em>v</em> {m.away}
              </span>
              <span className="pick-called">
                {p.home}–{p.away}
                {p.autoPicked && <i className="auto-tag" title="Auto-pick">A</i>}
              </span>
              <span className="pick-actual">
                {m.status === "finished" ? `FT ${m.homeScore}–${m.awayScore}` : "—"}
              </span>
              <span className={"pick-pts" + cls}>
                {s === null ? "" : `+${s.total}`}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
