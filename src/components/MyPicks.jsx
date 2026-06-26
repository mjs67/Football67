import { useEffect, useState } from "react";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { sharePickCard } from "../shareCard.js";

function pointsFor(pred, match) {
  if (!pred || !match || match.status !== "finished") return null;
  if (pred.home === match.homeScore && pred.away === match.awayScore) return 5;
  if (Math.sign(pred.home - pred.away) === Math.sign(match.homeScore - match.awayScore))
    return 3;
  return 0;
}

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
      <History matches={matches} predictions={predictions} user={user} />
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
  const rows = matches
    .filter((m) => m.status === "finished" && predictions[m.id])
    .sort((a, b) => (a.kickoff?.toMillis?.() || 0) - (b.kickoff?.toMillis?.() || 0))
    .map((m) => pointsFor(predictions[m.id], m));
  if (rows.length < 2) return null;

  const W = 600, H = 120, padX = 6, padY = 10;
  let cum = 0;
  const cumulative = rows.map((p) => (cum += p));
  const max = Math.max(...cumulative, 1);
  const x = (i) => padX + (i / (rows.length - 1)) * (W - padX * 2);
  const y = (v) => H - padY - (v / max) * (H - padY * 2);
  const line = cumulative.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  const exact = rows.filter((p) => p === 5).length;
  const result = rows.filter((p) => p === 3).length;
  const acc = Math.round(((exact + result) / rows.length) * 100);

  return (
    <div className="panel">
      <p className="panel-eyebrow">Form</p>
      <svg
        className="form-graph"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Cumulative points over ${rows.length} settled picks`}
      >
        <polyline points={line} fill="none" stroke="var(--volt)" strokeWidth="3" strokeLinejoin="round" />
        {cumulative.map((v, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(v)}
            r={rows[i] === 5 ? 5 : rows[i] === 3 ? 4 : 2.5}
            fill={rows[i] === 5 ? "var(--volt)" : rows[i] === 3 ? "var(--chalk)" : "var(--chalk-25)"}
          />
        ))}
      </svg>
      <p className="panel-note">
        {acc}% of your settled picks scored ({exact} exact, {result} right results across{" "}
        {rows.length} matches). Volt dots = exact scores.
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
    const pts = pointsFor(p, m);
    if (pts === 5) {
      points += 5;
      exact++;
    } else if (pts === 3) {
      points += 3;
      results++;
    }
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

const ROAST_TEMPLATES = [
  "{name} got {match} right and is now the most annoying person alive. +{pts} points and zero self-awareness to show for it.",
  "Nobody in this league has done less to deserve {pts} points than {name}. {match} handed it to them and they still think it was skill.",
  "{name} called {match} and is acting like they coached the winning side. You filled in a form. Calm down.",
  "The {match} result is in, {score}, and {name} collects +{pts}. A fraud has been rewarded. The system is broken.",
  "{name} predicted {match} correctly. So do people who do not watch football. This means nothing. You mean nothing.",
  "{name} called {match} right for the same reason a broken clock is right twice a day. Stupid luck. Not intelligence.",
  "Do not mistake {name} getting {pts} from {match} for understanding football. They do not. They never will.",
  "{name} saw {score} coming on {match}? No they did not. They guessed and hit and now we all have to pretend it meant something.",
  "The most insulting part of {match} is not the result. It is that {name} predicted it and genuinely believes they are good at this.",
  "{name} got {match} right and has been absolutely radioactive to be around ever since. +{pts} points, zero chill.",
  "There is not a single person in this league who wanted {name} to get {match} right. The universe ignored us. Again.",
  "{match} ends, {score}, {name} gets {pts} points, and the rest of us quietly consider our life choices that led to being in a league with them.",
  "{name} got {match} right. My dog would have gotten {match} right. The dog is not insufferable about it.",
  "A child. A random stranger. {name}. All equally capable of predicting {match}. Only one of them is making it a whole thing.",
  "Getting {match} right is not an achievement. {name} making it one is the achievement — of delusion.",
  "{pts} points from {match} for {name}. The prediction required no skill, no knowledge, and no brain. A perfect fit.",
  "{name} has used {match} as an opportunity to remind the league they exist. We were coping fine without the reminder.",
  "The confidence {name} has developed from {pts} points on {match} is medically concerning. Someone should intervene.",
  "{match} ends {score} and {name} — of all people — gets it right. This league has truly lost the plot.",
  "Out of everyone in this league, {name} is the last person who should be collecting {pts} from {match}. And yet.",
  "The {match} result handed {pts} points to {name} and I refuse to accept it. I am refusing. It means nothing.",
  "{score} on {match}. {pts} points to {name}. Whatever god runs this league hates the rest of us specifically.",
  "{name} predicted {match} correctly. I have stared at this for a while now. It still does not make sense.",
  "{name} is riding {match} and {pts} points like it will last. It will not. And we will all be there when it does not.",
  "This league collectively lost something today when {name} got {match} right. We will need time to process the {pts} points of injustice.",
  "Everyone watching {match} hoping {name} would get it wrong: we failed. +{pts} to the one person who deserved it least.",
  "The silence in this league after {name} scored {pts} from {match} was grief. Pure, unprocessed grief.",
  "{match} is over, {score}, and {name} walks away with {pts} points that belong to literally anyone else in this league.",
  "{name} got {match} right. We will never forget. Not the prediction. The insufferability that followed.",
  "Statistically, {name} was due for a correct prediction. The universe just had to run through every wrong person in the league first.",
];

function generatePickRoast(matchId, name, pts, match, score) {
  const seed = matchId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const index = (seed + name.length) % ROAST_TEMPLATES.length;
  return ROAST_TEMPLATES[index]
    .replace(/{name}/g,  name)
    .replace(/{pts}/g,   pts)
    .replace(/{match}/g, match)
    .replace(/{score}/g, score);
}

function PickRoast({ matchId, matchStatus, userName, pts, matchName, score }) {
  if (matchStatus !== "finished" || !pts || !userName) return null;
  const roast = generatePickRoast(matchId, userName, pts, matchName, score);
  return (
    <div className="pick-roast">
      <span className="pick-roast-flame">🔥</span>
      <p className="pick-roast-text">{roast}</p>
    </div>
  );
}

function History({ matches, predictions, user }) {
  const [nickname, setNickname] = useState("");
  useEffect(
    () =>
      onSnapshot(doc(db, "users", user.uid), (s) =>
        setNickname(s.exists() ? s.data().nickname || s.data().displayName || "" : "")
      ),
    [user.uid]
  );

  const rows = matches
    .filter((m) => predictions[m.id])
    .slice()
    .sort((a, b) => (b.kickoff?.toMillis?.() || 0) - (a.kickoff?.toMillis?.() || 0));

  if (rows.length === 0)
    return <p className="empty">No picks yet — head to Fixtures and call some scores.</p>;

  const displayName = nickname || user.displayName || "You";

  return (
    <>
      <h2 className="section-label">All picks</h2>
      <ol className="picks">
        {rows.map((m) => {
          const p = predictions[m.id];
          const pts = pointsFor(p, m);
          const score = m.status === "finished" ? `${m.homeScore}-${m.awayScore}` : null;
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
              <span
                className={
                  "pick-pts" + (pts === 5 ? " gold" : pts === 3 ? " ok" : pts === 0 ? " zero" : "")
                }
              >
                {pts === null ? "" : `+${pts}`}
              </span>
              {pts > 0 && (
                <PickRoast
                  matchId={m.id}
                  matchStatus={m.status}
                  userName={displayName}
                  pts={pts}
                  matchName={`${m.home} v ${m.away}`}
                  score={score}
                />
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
