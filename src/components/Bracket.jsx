import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase.js";

const ROUND_NAMES = {
  4: ["Semi-finals", "Final"],
  8: ["Quarter-finals", "Semi-finals", "Final"],
  16: ["Round of 16", "Quarter-finals", "Semi-finals", "Final"],
};

export default function Bracket({ user, onRequireSignIn }) {
  const [settings, setSettings] = useState(undefined);
  const [picks, setPicks] = useState({});
  const [savedPicks, setSavedPicks] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(
    () =>
      onSnapshot(
        doc(db, "settings", "bracket"),
        (s) => setSettings(s.exists() ? s.data() : null),
        () => setSettings(null)
      ),
    []
  );

  useEffect(() => {
    if (!user) {
      setPicks({});
      setSavedPicks(null);
      return;
    }
    return onSnapshot(doc(db, "brackets", user.uid), (s) => {
      const p = s.exists() ? s.data().picks || {} : {};
      setSavedPicks(p);
      setPicks(p);
    });
  }, [user]);

  if (settings === undefined) return <p className="empty">Loading bracket…</p>;
  if (settings === null)
    return (
      <p className="empty">
        The knockout bracket opens once the group stage wraps up. Check back soon.
      </p>
    );

  const { teams, rounds, points, results = {} } = settings;
  const deadlineMs = settings.deadline?.toMillis?.() || 0;
  const locked = now >= deadlineMs;
  const names = ROUND_NAMES[teams.length] || [];

  return (
    <BracketView
      teams={teams}
      rounds={rounds}
      points={points}
      names={names}
      results={results}
      picks={picks}
      setPicks={setPicks}
      locked={locked}
      deadlineMs={deadlineMs}
      user={user}
      savedPicks={savedPicks}
      saving={saving}
      savedFlash={savedFlash}
      onSave={async () => {
        if (!user) return onRequireSignIn();
        setSaving(true);
        try {
          await setDoc(doc(db, "brackets", user.uid), {
            picks,
            updatedAt: serverTimestamp(),
          });
          setSavedFlash(true);
          setTimeout(() => setSavedFlash(false), 1600);
        } catch (e) {
          alert("Could not save bracket: " + e.message);
        } finally {
          setSaving(false);
        }
      }}
      onRequireSignIn={onRequireSignIn}
    />
  );
}

function BracketView({
  teams, rounds, points, names, results, picks, setPicks,
  locked, deadlineMs, user, savedPicks, saving, savedFlash, onSave, onRequireSignIn,
}) {
  // participants of match (r, i): round 0 from seeding, later rounds from picks
  const participants = useMemo(() => {
    const map = {};
    let count = teams.length / 2;
    for (let i = 0; i < count; i++) map[`r0-${i}`] = [teams[2 * i], teams[2 * i + 1]];
    for (let r = 1; r < rounds; r++) {
      count /= 2;
      for (let i = 0; i < count; i++) {
        map[`r${r}-${i}`] = [picks[`r${r - 1}-${2 * i}`] || null, picks[`r${r - 1}-${2 * i + 1}`] || null];
      }
    }
    return map;
  }, [teams, rounds, picks]);

  function select(matchId, team) {
    if (locked) return;
    if (!user) return onRequireSignIn();
    const next = { ...picks, [matchId]: team };
    // Cascade: clear downstream picks that relied on the replaced team
    const [, rStr, iStr] = matchId.match(/^r(\d+)-(\d+)$/);
    let r = Number(rStr);
    let i = Number(iStr);
    let replaced = picks[matchId];
    while (replaced && replaced !== team && r + 1 < rounds) {
      const upId = `r${r + 1}-${Math.floor(i / 2)}`;
      if (next[upId] === replaced) {
        const upReplaced = next[upId];
        delete next[upId];
        replaced = upReplaced;
        r += 1;
        i = Math.floor(i / 2);
      } else break;
    }
    setPicks(next);
  }

  const dirty = JSON.stringify(picks) !== JSON.stringify(savedPicks || {});
  const champion = picks[`r${rounds - 1}-0`];
  const totalEarned = Object.entries(results).reduce((sum, [id, winner]) => {
    const r = Number(id.match(/^r(\d+)-/)?.[1] ?? -1);
    return sum + ((savedPicks || {})[id] === winner ? points[r] || 0 : 0);
  }, 0);

  const deadlineLabel = deadlineMs
    ? new Date(deadlineMs).toLocaleString(undefined, {
        weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";

  let count = teams.length / 2;
  const columns = [];
  for (let r = 0; r < rounds; r++) {
    columns.push({ r, n: count, name: names[r] || `Round ${r + 1}`, pts: points[r] });
    count /= 2;
  }

  return (
    <>
      <div className="panel bracket-status">
        <div>
          <p className="panel-eyebrow">Knockout bracket</p>
          <p className="panel-note">
            {locked
              ? Object.keys(results).length > 0
                ? <>Bracket locked · you've earned <b className="accent-text">{totalEarned} pts</b> so far</>
                : "Bracket locked — points land as real winners are confirmed."
              : <>Pick a winner all the way to the trophy. Locks {deadlineLabel}.</>}
          </p>
        </div>
        {!locked && (
          <button className="btn solid" onClick={onSave} disabled={saving || !dirty}>
            {saving ? "Saving…" : savedFlash ? "Saved ✓" : dirty ? "Save bracket" : "Bracket saved"}
          </button>
        )}
      </div>

      <div className="bracket-scroll">
        <div className="bracket">
          {columns.map(({ r, n, name, pts }) => (
            <div className="b-round" key={r}>
              <h3 className="b-round-name">
                {name} <span className="b-pts">+{pts}</span>
              </h3>
              {Array.from({ length: n }, (_, i) => {
                const id = `r${r}-${i}`;
                const [a, b] = participants[id] || [null, null];
                return (
                  <div className="b-match" key={id}>
                    <Slot id={id} team={a} picks={picks} results={results} locked={locked} onSelect={select} />
                    <Slot id={id} team={b} picks={picks} results={results} locked={locked} onSelect={select} />
                  </div>
                );
              })}
            </div>
          ))}
          <div className="b-round b-champ-col">
            <h3 className="b-round-name">Champion</h3>
            <div className={"b-champ" + (champion ? " set" : "")}>
              <span className="b-trophy" aria-hidden="true">🏆</span>
              {results[`r${rounds - 1}-0`] || champion || "—"}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Slot({ id, team, picks, results, locked, onSelect }) {
  const picked = team && picks[id] === team;
  const actual = results[id];
  const verdict = actual && picked ? (actual === team ? " correct" : " wrong") : "";
  return (
    <button
      type="button"
      className={"b-slot" + (picked ? " picked" : "") + verdict + (team ? "" : " tbd")}
      disabled={locked || !team}
      onClick={() => team && onSelect(id, team)}
      aria-pressed={picked}
    >
      {team || "TBD"}
      {actual === team && team && <span className="b-check" aria-hidden="true"> ✓</span>}
    </button>
  );
}
