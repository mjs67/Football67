import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../firebase.js";

const ROUND_NAMES = {
  4: ["Semi-finals", "Final"],
  8: ["Quarter-finals", "Semi-finals", "Final"],
  16: ["Round of 16", "Quarter-finals", "Semi-finals", "Final"],
  32: ["Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Final"],
};

// The champion-tier point each lock-round window is worth (0=R16 … 3=Final).
const DEFAULT_TIER_POINTS = [20, 14, 9, 5];

// The earliest round whose lock-window is still open = the tier a pick made
// "now" would be stamped with. Each window closes 1h before that round's
// first kickoff (settings.bracket.deadlines[r]).
function currentTier(deadlines, rounds, now) {
  for (let r = 0; r < rounds; r++) {
    const dl = deadlines?.[String(r)]?.toMillis?.() ?? 0;
    if (dl && now < dl) return r;
  }
  return rounds - 1; // past the Final window — last-chance tier
}

export default function Bracket({ user, onRequireSignIn }) {
  const [settings, setSettings] = useState(undefined);
  const [doc_, setDoc_] = useState(null); // raw brackets/{uid} document
  const [picks, setPicks] = useState({}); // tree picks (visual, unscored)
  const [champ, setChamp] = useState(null); // { team, tier, history }
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

  // Finished knockout matches are the single source of truth for which teams
  // are out and who won — no separate results map on settings/bracket.
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
      setPicks({});
      setChamp(null);
      setDoc_(null);
      return;
    }
    return onSnapshot(doc(db, "brackets", user.uid), (s) => {
      const data = s.exists() ? s.data() : {};
      setDoc_(data);
      // Flatten tree picks from rounds schema (visual only).
      const merged = {};
      if (data.rounds) {
        for (const rd of Object.values(data.rounds)) Object.assign(merged, rd.picks || {});
      } else if (data.picks) {
        Object.assign(merged, data.picks);
      }
      setPicks(merged);
      setChamp(data.champion || null);
    });
  }, [user]);

  if (settings === undefined) return <p className="empty">Loading bracket…</p>;
  if (settings === null)
    return (
      <p className="empty">
        The knockout bracket opens once the group stage wraps up. Check back soon.
      </p>
    );

  const { teams, rounds } = settings;
  const tierPoints = settings.tierPoints || DEFAULT_TIER_POINTS;
  const deadlines = settings.deadlines || {};
  const names = ROUND_NAMES[teams.length] || [];
  const tierNow = currentTier(deadlines, rounds, now);
  // Past the final lock window with no pick changes possible.
  const finalLockMs = deadlines?.[String(rounds - 1)]?.toMillis?.() ?? 0;
  const allLocked = finalLockMs ? now >= finalLockMs : false;

  // Build slot -> advancing team from finished knockout matches (source of
  // truth). Prefer the explicit advancedTeam field (handles ET/penalties);
  // fall back to comparing scores for older docs synced before that field.
  const results = {};
  for (const m of koMatches) {
    if (!m.bracketSlot) continue;
    let won = m.advancedTeam || null;
    if (!won && m.homeScore != null && m.awayScore != null && m.homeScore !== m.awayScore) {
      won = m.homeScore > m.awayScore ? m.home : m.away;
    }
    if (won) results[m.bracketSlot] = won;
  }
  // Tournament winner = team that advanced from the final slot.
  const winner = results[`r${rounds - 1}-0`] || null;

  return (
    <BracketView
      teams={teams}
      rounds={rounds}
      tierPoints={tierPoints}
      tierNow={tierNow}
      names={names}
      results={results}
      winner={winner}
      picks={picks}
      setPicks={setPicks}
      champ={champ}
      setChamp={setChamp}
      allLocked={allLocked}
      deadlines={deadlines}
      now={now}
      user={user}
      doc_={doc_}
      saving={saving}
      savedFlash={savedFlash}
      onSave={async (nextPicks, nextChamp) => {
        if (!user) return onRequireSignIn();
        setSaving(true);
        try {
          // Rebuild rounds schema from flat tree picks (visual record only).
          const roundsMap = {};
          for (const [mid, team] of Object.entries(nextPicks)) {
            const r = Number(mid.match(/^r(\d+)-/)?.[1] ?? -1);
            if (r < 0) continue;
            roundsMap[r] = roundsMap[r] || { picks: {} };
            roundsMap[r].picks[mid] = team;
          }
          await setDoc(
            doc(db, "brackets", user.uid),
            {
              uid: user.uid,
              rounds: roundsMap,
              champion: nextChamp || null,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          // Ensure a leaderboard row exists.
          await setDoc(
            doc(db, "users", user.uid),
            { displayName: user.displayName || "Anonymous", photoURL: user.photoURL || "" },
            { merge: true }
          );
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
  teams, rounds, tierPoints, tierNow, names, results, winner,
  picks, setPicks, champ, setChamp, allLocked, deadlines, now,
  user, doc_, saving, savedFlash, onSave, onRequireSignIn,
}) {
  // Participants of match (r,i): round 0 from seeding, later from tree picks.
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

  // Working (unsaved) copies so Save commits picks + champion together.
  const [draftPicks, setDraftPicks] = useState(picks);
  const [draftChamp, setDraftChamp] = useState(champ);
  useEffect(() => setDraftPicks(picks), [picks]);
  useEffect(() => setDraftChamp(champ), [champ]);

  function selectTreeSlot(matchId, team) {
    if (allLocked || !user) return user ? null : onRequireSignIn();
    const next = { ...draftPicks, [matchId]: team };
    // Cascade: clear downstream tree picks that relied on the replaced team.
    const [, rStr, iStr] = matchId.match(/^r(\d+)-(\d+)$/);
    let r = Number(rStr), i = Number(iStr), replaced = draftPicks[matchId];
    while (replaced && replaced !== team && r + 1 < rounds) {
      const upId = `r${r + 1}-${Math.floor(i / 2)}`;
      if (next[upId] === replaced) {
        delete next[upId];
        replaced = next[upId];
        r += 1;
        i = Math.floor(i / 2);
      } else break;
    }
    setDraftPicks(next);
  }

  // Set the scoring champion pick. Tier re-stamps only when the TEAM changes.
  function selectChampion(team) {
    if (allLocked) return;
    if (!user) return onRequireSignIn();
    const prev = draftChamp;
    if (prev && prev.team === team) return; // re-confirm same team: no tier change
    const history = { ...(prev?.history || {}) };
    history[tierNow] = team;
    setDraftChamp({ team, tier: tierNow, history });
  }

  const dirty =
    JSON.stringify(draftPicks) !== JSON.stringify(picks) ||
    JSON.stringify(draftChamp) !== JSON.stringify(champ);

  const treeChampion = draftPicks[`r${rounds - 1}-0`]; // tree's final-slot pick
  const champTeam = draftChamp?.team || null;
  const champTier = draftChamp?.tier ?? null;
  const champTierPts = champTier != null ? tierPoints[champTier] : null;
  const tierNowPts = tierPoints[tierNow];

  // Has the champion pick been eliminated? (their team lost a recorded slot)
  const champEliminated = useMemo(() => {
    if (!champTeam) return false;
    // A team is out if a result exists where they were a participant but not the winner.
    for (const [mid, won] of Object.entries(results)) {
      const [a, b] = participants[mid] || [];
      if ((a === champTeam || b === champTeam) && won !== champTeam) return true;
    }
    return false;
  }, [champTeam, results, participants]);

  const earned = winner && champTeam === winner ? champTierPts : winner ? 0 : null;

  let count = teams.length / 2;
  const columns = [];
  for (let r = 0; r < rounds; r++) {
    columns.push({ r, n: count, name: names[r] || `Round ${r + 1}` });
    count /= 2;
  }

  // Teams still alive (not eliminated by a recorded result) — pickable champions.
  const aliveTeams = useMemo(() => {
    const out = new Set(teams);
    for (const [mid, won] of Object.entries(results)) {
      const [a, b] = participants[mid] || [];
      if (a && a !== won) out.delete(a);
      if (b && b !== won) out.delete(b);
    }
    return out;
  }, [teams, results, participants]);

  return (
    <>
      <div className="panel bracket-status">
        <div>
          <p className="panel-eyebrow">Champion prediction</p>
          <p className="panel-note">
            {winner ? (
              earned > 0 ? (
                <>You called <b className="accent-text">{champTeam}</b> from the{" "}
                  {names[champTier]} window · <b className="accent-text">+{earned} pts</b></>
              ) : champTeam ? (
                <>Your pick <b>{champTeam}</b> didn't win it. Champion: {winner}.</>
              ) : (
                <>Tournament winner: {winner}. You made no champion pick.</>
              )
            ) : allLocked ? (
              <>Champion locked: <b className="accent-text">{champTeam || "—"}</b>. Points land when the winner is confirmed.</>
            ) : champTeam ? (
              champEliminated ? (
                <><b className="accent-text">{champTeam} is out.</b> Re-pick a surviving team — locks now at the {names[tierNow]} tier (<b>{tierNowPts} pts</b>).</>
              ) : (
                <>Champion: <b className="accent-text">{champTeam}</b>, locked at <b>{champTierPts} pts</b>. Switching now re-stamps to {tierNowPts} pts.</>
              )
            ) : (
              <>Pick your tournament winner. Locking now is worth <b className="accent-text">{tierNowPts} pts</b> — the value drops each round.</>
            )}
          </p>
        </div>
        {!allLocked && !winner && (
          <button
            className="btn solid"
            onClick={() => onSave(draftPicks, draftChamp)}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : savedFlash ? "Saved ✓" : dirty ? "Save bracket" : "Bracket saved"}
          </button>
        )}
      </div>

      <div className="bracket-scroll">
        <div className="bracket">
          {columns.map(({ r, n, name }) => {
            const dl = deadlines?.[String(r)]?.toMillis?.() ?? 0;
            const roundLocked = dl ? now >= dl : false;
            const isTierRound = r === tierNow && !roundLocked;
            return (
              <div className={"b-round" + (roundLocked ? " b-round-locked" : "")} key={r}>
                <div className="b-round-header">
                  <h3 className="b-round-name">{name}</h3>
                  <DeadlinePill dl={dl} now={now} locked={roundLocked} tierPts={tierPoints[r]} isTier={isTierRound} />
                </div>
                {Array.from({ length: n }, (_, i) => {
                  const id = `r${r}-${i}`;
                  const [a, b] = participants[id] || [null, null];
                  return (
                    <div className={"b-match" + (roundLocked ? " b-match-locked" : "")} key={id}>
                      <Slot id={id} team={a} picks={draftPicks} results={results} champTeam={champTeam} locked={allLocked} onSelect={selectTreeSlot} />
                      <Slot id={id} team={b} picks={draftPicks} results={results} champTeam={champTeam} locked={allLocked} onSelect={selectTreeSlot} />
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div className="b-round b-champ-col">
            <div className="b-round-header">
              <h3 className="b-round-name">Champion</h3>
              {!winner && !allLocked && (
                <span className="b-deadline b-deadline-open">
                  Lock now → {tierNowPts} pts
                </span>
              )}
            </div>

            <div className={"b-champ" + (champTeam ? " set" : "") + (earned > 0 ? " won" : "")}>
              <span className="b-trophy" aria-hidden="true">🏆</span>
              {winner || champTeam || "—"}
            </div>

            {champTeam && (
              <div className="b-champ-tier">
                <span className="b-champ-tier-label">Locked at</span>
                <span className="b-champ-tier-pts">{champTierPts} pts</span>
                <span className="b-champ-tier-when">({names[champTier]})</span>
              </div>
            )}

            {!winner && !allLocked && (
              <ChampionPicker
                aliveTeams={aliveTeams}
                champTeam={champTeam}
                onPick={selectChampion}
                tierNowPts={tierNowPts}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function DeadlinePill({ dl, now, locked, tierPts, isTier }) {
  if (!dl) return null;
  if (locked) {
    return <span className="b-deadline b-deadline-locked">🔒 Locked</span>;
  }
  const diff = dl - now;
  const urgent = diff < 6 * 3600000; // under 6h
  const label = formatDeadline(dl, now);
  return (
    <span className={"b-deadline " + (urgent ? "b-deadline-urgent" : "b-deadline-open")}>
      {urgent ? "⏱ " : ""}{label}{isTier ? ` · +${tierPts}` : ""}
    </span>
  );
}

function formatDeadline(dl, now) {
  const diff = dl - now;
  if (diff <= 0) return "Closing";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h < 24) return h > 0 ? `Locks in ${h}h ${m}m` : `Locks in ${m}m`;
  return "Locks " + new Date(dl).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function ChampionPicker({ aliveTeams, champTeam, onPick, tierNowPts }) {
  const list = Array.from(aliveTeams);
  return (
    <div className="b-champ-picker">
      <p className="b-champ-picker-hint">Tap your winner ({tierNowPts} pts now)</p>
      <div className="b-champ-options">
        {list.map((t) => (
          <button
            key={t}
            type="button"
            className={"b-champ-opt" + (champTeam === t ? " selected" : "")}
            onClick={() => onPick(t)}
            aria-pressed={champTeam === t}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slot({ id, team, picks, results, champTeam, locked, onSelect }) {
  const picked = team && picks[id] === team;
  const actual = results[id];
  const verdict = actual && picked ? (actual === team ? " correct" : " wrong") : "";
  const isChamp = team && team === champTeam;
  return (
    <button
      type="button"
      className={"b-slot" + (picked ? " picked" : "") + verdict + (team ? "" : " tbd") + (isChamp ? " is-champ" : "")}
      disabled={locked || !team}
      onClick={() => team && onSelect(id, team)}
      aria-pressed={picked}
    >
      {isChamp && <span className="b-champ-star" aria-hidden="true">★ </span>}
      {team || "TBD"}
      {actual === team && team && <span className="b-check" aria-hidden="true"> ✓</span>}
    </button>
  );
}
