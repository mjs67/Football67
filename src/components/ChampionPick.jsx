import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase.js";

function pad(n) {
  return String(n).padStart(2, "0");
}

// Live countdown to a target timestamp. Returns null once the target has
// passed (caller falls back to its own "locked" UI at that point).
function useCountdown(targetMs) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!targetMs) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [targetMs]);
  if (!targetMs) return null;
  const diff = targetMs - now;
  if (diff <= 0) return null;
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
  };
}

// "Pick the tournament winner" page. One team, locked at the first knockout
// kickoff, +30 once the Final is played. The settings/champion doc (written by
// scripts/championPick.js) drives every state below; the actual award lives in
// recompute.js, so this component only reads and records the pick.
export default function ChampionPick({ user, onRequireSignIn }) {
  const [settings, setSettings] = useState(undefined); // undefined=loading, null=not opened
  const [mine, setMine] = useState(null);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        doc(db, "settings", "champion"),
        (s) => setSettings(s.exists() ? s.data() : null),
        () => setSettings(null)
      ),
    []
  );

  useEffect(() => {
    if (!user) {
      setMine(null);
      return;
    }
    return onSnapshot(doc(db, "championPicks", user.uid), (s) => {
      const d = s.exists() ? s.data() : null;
      setMine(d);
      if (d) setSelected(d.team);
    });
  }, [user]);

  const lockMs = settings?.lockAt?.toMillis ? settings.lockAt.toMillis() : 0;
  const countdown = useCountdown(lockMs);

  if (!user) {
    return (
      <p className="empty">
        <button className="btn solid" onClick={onRequireSignIn}>
          Sign in
        </button>
        <br />
        <br />
        Sign in to pick your tournament winner.
      </p>
    );
  }

  if (settings === undefined) return <p className="empty">Loading…</p>;

  if (!settings) {
    return (
      <div className="panel">
        <p className="panel-eyebrow">Champion</p>
        <p className="panel-q">Pick the winner — coming soon</p>
        <p className="panel-note">
          Once the knockout teams are confirmed you'll pick one team to win it all.
          Get it right and you bank a one-off <b className="accent-text">+30</b> after the Final.
        </p>
      </div>
    );
  }

  const locked = lockMs > 0 && Date.now() >= lockMs;
  const winner = settings.winner || null;
  const teams = settings.teams || [];
  const flags = settings.flags || {};
  const lockLabel = settings.lockAt?.toDate
    ? settings.lockAt.toDate().toLocaleString(undefined, {
        weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        timeZoneName: "short",
      })
    : "";

  async function save() {
    if (!selected || saving || locked || winner) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "championPicks", user.uid), {
        uid: user.uid,
        team: selected,
        updatedAt: serverTimestamp(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (e) {
      alert("Could not save your pick: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Result state: the Final has been played ──────────────────────────────
  if (winner) {
    const hit = mine && mine.team === winner;
    return (
      <div className="panel">
        <p className="panel-eyebrow">Champion · Full time</p>
        <p className="panel-q">
          Winner: <span className="accent-text">{winner}</span>
        </p>
        {mine ? (
          hit ? (
            <p className="panel-note">
              You called it — <b className="accent-text">+30</b> banked. 🏆
            </p>
          ) : (
            <p className="panel-note">
              You picked <b>{mine.team}</b>. No bonus this time.
            </p>
          )
        ) : (
          <p className="panel-note">You didn't make a champion pick.</p>
        )}
      </div>
    );
  }

  // ── Locked state: picks closed, awaiting the Final ───────────────────────
  if (locked) {
    return (
      <div className="panel">
        <p className="panel-eyebrow">Champion · Locked</p>
        {mine ? (
          <>
            <p className="panel-q">
              Your pick: <span className="accent-text">{mine.team}</span>
            </p>
            <p className="panel-note">Picks are locked. +30 if they lift the trophy.</p>
          </>
        ) : (
          <>
            <p className="panel-q">No pick locked in</p>
            <p className="panel-note">The window closed before you chose a winner.</p>
          </>
        )}
      </div>
    );
  }

  // ── Open state: choose a team ────────────────────────────────────────────
  return (
    <div className="panel">
      <p className="panel-eyebrow">Champion · {settings.stageLabel || "Knockouts"}</p>
      <p className="panel-q">Pick your tournament winner</p>
      <p className="panel-note">
        One team, one shot. <b className="accent-text">+30</b> if they win it all.
        {lockLabel ? ` Locks ${lockLabel}.` : ""}
      </p>

      {countdown && (
        <div className="champ-countdown">
          <span className="champ-countdown-label">Picks lock in</span>
          <div className="champ-countdown-clock">
            {countdown.d > 0 && (
              <span className="champ-countdown-unit">
                <b>{countdown.d}</b>d
              </span>
            )}
            <span className="champ-countdown-unit">
              <b>{pad(countdown.h)}</b>h
            </span>
            <span className="champ-countdown-unit">
              <b>{pad(countdown.m)}</b>m
            </span>
            <span className="champ-countdown-unit">
              <b>{pad(countdown.s)}</b>s
            </span>
          </div>
        </div>
      )}

      <div className="champ-grid">
        {teams.map((team) => (
          <button
            key={team}
            className={"champ-team" + (selected === team ? " selected" : "")}
            onClick={() => setSelected(team)}
            aria-pressed={selected === team}
          >
            {flags[team] ? (
              <img className="champ-flag" src={flags[team]} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="champ-flag fallback" aria-hidden="true" />
            )}
            <span className="champ-name">{team}</span>
          </button>
        ))}
      </div>

      <div className="tb-input-row champ-actions">
        <button
          className="btn solid"
          onClick={save}
          disabled={saving || !selected || (mine && selected === mine.team)}
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : mine ? "Update pick" : "Lock it in"}
        </button>
      </div>
    </div>
  );
}
