import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../firebase.js";

const ROUND_NAMES = {
  4: ["Semi-finals", "Final"],
  8: ["Quarter-finals", "Semi-finals", "Final"],
  16: ["Round of 16", "Quarter-finals", "Semi-finals", "Final"],
  32: ["Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Final"],
};

// Champion-tier points by lock-round window (0=R16 … 3=Final).
const DEFAULT_TIER_POINTS = [20, 14, 9, 5];

// Earliest round whose lock window is still open = the tier a pick made "now"
// is stamped with. Each window closes 1h before that round's first kickoff
// (settings.bracket.deadlines[r]).
function currentTier(deadlines, rounds, now) {
  for (let r = 0; r < rounds; r++) {
    const dl = deadlines?.[String(r)]?.toMillis?.() ?? 0;
    if (dl && now < dl) return r;
  }
  return rounds - 1;
}

export default function Bracket({ user, onRequireSignIn }) {
  const [settings, setSettings] = useState(undefined);
  const [champ, setChamp] = useState(null);     // saved { team, tier, history }
  const [koMatches, setKoMatches] = useState([]); // finished knockout matches
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

  // Finished knockout matches: the single source of truth for who's out / who won.
  useEffect(
    () =>
      onSnapshot(
        query(
          collection(db, "matches"),
          where("phase", "==", "knockout"),
          where("status", "==", "finished")
        ),
        (snap) => setKoMatches(snap.docs.map((d) => d.data())),
        () => setKoMatches([])
      ),
    []
  );

  useEffect(() => {
    if (!user) {
      setChamp(null);
      return;
    }
    return onSnapshot(doc(db, "brackets", user.uid), (s) => {
      setChamp(s.exists() ? s.data().champion || null : null);
    });
  }, [user]);

  if (settings === undefined) return <p className="empty">Loading…</p>;
  if (settings === null)
    return (
      <p className="empty">
        The champion pick opens once the group stage wraps up. Check back soon.
      </p>
    );

  const { teams, rounds } = settings;
  const tierPoints = settings.tierPoints || DEFAULT_TIER_POINTS;
  const deadlines = settings.deadlines || {};
  const names = ROUND_NAMES[teams.length] || [];
  const tierNow = currentTier(deadlines, rounds, now);
  const finalLockMs = deadlines?.[String(rounds - 1)]?.toMillis?.() ?? 0;
  const allLocked = finalLockMs ? now >= finalLockMs : false;

  // Resolve who advanced in each finished knockout match (handles ET/penalties
  // via advancedTeam, falling back to score for older docs).
  const slotWinners = [];
  for (const m of koMatches) {
    let won = m.advancedTeam || null;
    if (!won && m.homeScore != null && m.awayScore != null && m.homeScore !== m.awayScore) {
      won = m.homeScore > m.awayScore ? m.home : m.away;
    }
    // A finished match eliminates the team that did NOT advance.
    if (won) slotWinners.push({ home: m.home, away: m.away, won, slot: m.bracketSlot });
  }
  // Tournament winner = whoever advanced from the final slot.
  const winner = slotWinners.find((s) => s.slot === `r${rounds - 1}-0`)?.won || null;

  // Teams eliminated so far.
  const eliminated = new Set();
  for (const s of slotWinners) {
    if (s.home && s.home !== s.won) eliminated.add(s.home);
    if (s.away && s.away !== s.won) eliminated.add(s.away);
  }
  const aliveTeams = teams.filter((t) => !eliminated.has(t));

  return (
    <ChampionView
      teams={teams}
      aliveTeams={aliveTeams}
      names={names}
      tierPoints={tierPoints}
      tierNow={tierNow}
      winner={winner}
      eliminated={eliminated}
      champ={champ}
      allLocked={allLocked}
      user={user}
      saving={saving}
      savedFlash={savedFlash}
      onRequireSignIn={onRequireSignIn}
      onSave={async (nextChamp) => {
        if (!user) return onRequireSignIn();
        setSaving(true);
        try {
          await setDoc(
            doc(db, "brackets", user.uid),
            {
              uid: user.uid,
              champion: nextChamp || null,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          await setDoc(
            doc(db, "users", user.uid),
            { displayName: user.displayName || "Anonymous", photoURL: user.photoURL || "" },
            { merge: true }
          );
          setSavedFlash(true);
          setTimeout(() => setSavedFlash(false), 1600);
        } catch (e) {
          alert("Could not save pick: " + e.message);
        } finally {
          setSaving(false);
        }
      }}
    />
  );
}

function ChampionView({
  teams, aliveTeams, names, tierPoints, tierNow, winner, eliminated,
  champ, allLocked, user, saving, savedFlash, onSave, onRequireSignIn,
}) {
  const [draft, setDraft] = useState(champ);
  useEffect(() => setDraft(champ), [champ]);

  const champTeam = draft?.team || null;
  const champTier = draft?.tier ?? null;
  const champTierPts = champTier != null ? tierPoints[champTier] : null;
  const tierNowPts = tierPoints[tierNow];
  const champEliminated = champTeam ? eliminated.has(champTeam) : false;
  const earned = winner && champTeam === winner ? champTierPts : winner ? 0 : null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(champ);

  function pick(team) {
    if (allLocked || winner) return;
    if (!user) return onRequireSignIn();
    if (draft && draft.team === team) return; // re-confirm same team: no tier change
    const history = { ...(draft?.history || {}) };
    history[tierNow] = team;
    setDraft({ team, tier: tierNow, history });
  }

  return (
    <>
      <div className="panel bracket-status">
        <div>
          <p className="panel-eyebrow">Champion prediction</p>
          <p className="panel-note">
            {winner ? (
              earned > 0 ? (
                <>You called <b className="accent-text">{champTeam}</b> from the {names[champTier]} window · <b className="accent-text">+{earned} pts</b></>
              ) : champTeam ? (
                <>Your pick <b>{champTeam}</b> didn't win it. Champion: {winner}.</>
              ) : (
                <>Tournament winner: {winner}. You made no pick.</>
              )
            ) : allLocked ? (
              <>Locked in: <b className="accent-text">{champTeam || "—"}</b>. Points land when the winner is confirmed.</>
            ) : champTeam ? (
              champEliminated ? (
                <><b className="accent-text">{champTeam} is out.</b> Pick again — locks now at the {names[tierNow]} tier (<b>{tierNowPts} pts</b>).</>
              ) : (
                <>Your pick: <b className="accent-text">{champTeam}</b>, locked at <b>{champTierPts} pts</b>. Switching now re-stamps to {tierNowPts} pts.</>
              )
            ) : (
              <>Pick who wins the tournament. Locking now is worth <b className="accent-text">{tierNowPts} pts</b> — the value drops each round.</>
            )}
          </p>
        </div>
        {!allLocked && !winner && (
          <button
            className="btn solid"
            onClick={() => onSave(draft)}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : savedFlash ? "Saved ✓" : dirty ? "Save pick" : "Saved"}
          </button>
        )}
      </div>

      <div className="champ-page">
        <div className={"champ-hero" + (champTeam ? " set" : "") + (earned > 0 ? " won" : "")}>
          <span className="champ-hero-trophy" aria-hidden="true">🏆</span>
          <span className="champ-hero-team">{winner || champTeam || "Pick your winner"}</span>
          {champTeam && !winner && (
            <span className="champ-hero-tier">
              Locked at <b>{champTierPts} pts</b> · {names[champTier]}
            </span>
          )}
        </div>

        {!winner && !allLocked && (
          <div className="champ-pick-panel">
            <p className="champ-pick-hint">
              Tap your champion — worth <b className="accent-text">{tierNowPts} pts</b> if you lock now
            </p>
            <div className="champ-grid">
              {teams.map((t) => {
                const out = eliminated.has(t);
                const selected = champTeam === t;
                return (
                  <button
                    key={t}
                    type="button"
                    className={"champ-cell" + (selected ? " selected" : "") + (out ? " out" : "")}
                    disabled={out}
                    onClick={() => pick(t)}
                    aria-pressed={selected}
                  >
                    {selected && <span className="champ-cell-star" aria-hidden="true">★ </span>}
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
