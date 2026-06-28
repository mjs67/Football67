import { useEffect, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase.js";
import { matchProbs, pct, predictKnockout, scoreP } from "../poisson.js";

function pad(n) {
  return String(n).padStart(2, "0");
}

function useCountdown(targetMs) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = targetMs - now;
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pointsFor(pred, match) {
  if (!pred || match.status !== "finished") return null;
  if (pred.home === match.homeScore && pred.away === match.awayScore) return 5;
  if (Math.sign(pred.home - pred.away) === Math.sign(match.homeScore - match.awayScore))
    return 3;
  return 0;
}

export default function MatchCard({ match, user, prediction, onRequireSignIn }) {
  const kickoffMs = match.kickoff?.toMillis ? match.kickoff.toMillis() : 0;
  const countdown = useCountdown(kickoffMs);
  const locked = match.status === "finished" || !countdown;

  const [home, setHome] = useState(prediction ? prediction.home : 0);
  const [away, setAway] = useState(prediction ? prediction.away : 0);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Sync local steppers when the stored prediction arrives/changes
  useEffect(() => {
    if (prediction) {
      setHome(prediction.home);
      setAway(prediction.away);
    }
  }, [prediction?.home, prediction?.away]);

  const dirty =
    !prediction || prediction.home !== home || prediction.away !== away;
  const earned = pointsFor(prediction, match);

  async function save() {
    if (!user) return onRequireSignIn();
    setSaving(true);
    try {
      await setDoc(doc(db, "predictions", `${user.uid}_${match.id}`), {
        uid: user.uid,
        matchId: match.id,
        home,
        away,
        displayName: user.displayName || "Anonymous",
        photoURL: user.photoURL || "",
        updatedAt: serverTimestamp(),
      });
      // Make sure a leaderboard row exists for this player
      await setDoc(
        doc(db, "users", user.uid),
        {
          displayName: user.displayName || "Anonymous",
          photoURL: user.photoURL || "",
        },
        { merge: true }
      );
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
    } catch (e) {
      alert("Could not save prediction: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  const kickoffLabel = kickoffMs
    ? new Date(kickoffMs).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <article className={"card" + (locked ? " locked" : "")}>
      <div className="card-meta">
        <span className="comp">{match.competition || "Friendly"}</span>
        <span className="ko">
          {match.status === "finished" ? (
            <b className="ft-chip">FT</b>
          ) : countdown ? (
            <>
              {kickoffLabel} · <b className="count">{countdown}</b>
            </>
          ) : (
            <b className="live-chip">{match.live ? "● Live" : "Kicked off"}</b>
          )}
        </span>
      </div>

      {match.venue && <p className="venue">{match.venue}</p>}

      <div className="board">
        <Team name={match.home} flag={match.homeFlag} side="home" />

        <div className="scorebox">
          {match.status === "finished" ? (
            <div className="final">
              <span className="digit">{match.homeScore}</span>
              <span className="dash">–</span>
              <span className="digit">{match.awayScore}</span>
            </div>
          ) : (
            <div className="steppers">
              <Stepper value={home} onChange={setHome} disabled={locked} label={`${match.home} goals`} />
              <span className="dash">–</span>
              <Stepper value={away} onChange={setAway} disabled={locked} label={`${match.away} goals`} />
            </div>
          )}
        </div>

        <Team name={match.away} flag={match.awayFlag} side="away" />
      </div>

      {match.odds && match.status !== "finished" && (
        <OddsStrip odds={match.odds} home={home} away={away} locked={locked} match={match} />
      )}

      {(match.homeForm || match.awayForm || match.h2h) && match.status !== "finished" && (
        <div className="form-row">
          <FormPips form={match.homeForm} align="left" />
          {match.h2h ? (
            <span className="h2h" title="Head-to-head this season (home wins · draws · away wins)">
              H2H {match.h2h.homeWins}·{match.h2h.draws}·{match.h2h.awayWins}
            </span>
          ) : (
            <span className="h2h dim">First meeting</span>
          )}
          <FormPips form={match.awayForm} align="right" />
        </div>
      )}

      <div className="card-foot">
        {match.status === "finished" ? (
          prediction ? (
            <span className={"verdict v" + earned}>
              You called {prediction.home}–{prediction.away} ·{" "}
              {earned === 5 ? "Exact score +5" : earned === 3 ? "Right result +3" : "No points"}
            </span>
          ) : (
            <span className="verdict">No prediction made</span>
          )
        ) : locked ? (
          <span className="verdict">
            Predictions closed
            {prediction
              ? ` · you called ${prediction.home}–${prediction.away}` +
                (prediction.autoPicked ? " (auto-pick)" : "")
              : ""}
          </span>
        ) : (
          <button
            className="btn solid"
            onClick={save}
            disabled={saving || (!dirty && !!prediction)}
          >
            {saving
              ? "Saving…"
              : savedFlash
              ? "Locked in ✓"
              : prediction
              ? dirty
                ? "Update prediction"
                : "Prediction saved"
              : "Lock in prediction"}
          </button>
        )}
      </div>
    </article>
  );
}

function OddsStrip({ odds, home, away, locked, match }) {
  const { ph, pd, pa, top } = matchProbs(odds.lh, odds.la);
  const yourP = scoreP(odds.lh, odds.la, home, away);
  const ko = match?.phase === "knockout" ? predictKnockout(odds.lh, odds.la) : null;
  const advancer = ko ? (ko.advancer === "H" ? match.home : match.away) : null;
  return (
    <div className="odds-strip">
      <div
        className="odds-bar"
        role="img"
        aria-label={`Model win probabilities: home ${pct(ph)} percent, draw ${pct(pd)} percent, away ${pct(pa)} percent`}
      >
        <span className="seg home" style={{ flexGrow: ph }}>{pct(ph)}%</span>
        <span className="seg draw" style={{ flexGrow: pd }}>{pct(pd)}%</span>
        <span className="seg away" style={{ flexGrow: pa }}>{pct(pa)}%</span>
      </div>
      <p className="odds-note">
        {ko ? (
          <>
            AI Model: {advancer} to advance
            {ko.decided === "penalties" ? " on penalties" : ""} · most likely {ko.h}–{ko.a} ({pct(ko.p)}%)
          </>
        ) : (
          <>AI Model: most likely {top.h}–{top.a} ({pct(top.p)}%)</>
        )}
        {!locked && (
          <>
            {" "}· your call {home}–{away} ({pct(yourP)}%)
          </>
        )}
        {odds.n < 6 && <span className="odds-early"> · early-tournament estimate</span>}
      </p>
    </div>
  );
}

function FormPips({ form, align }) {
  const pips = (form || "").split("").slice(-5);
  return (
    <span className={"form-pips " + align} aria-label={form ? `Last ${pips.length}: ${pips.join(" ")}` : "No form data"}>
      {pips.length === 0 ? (
        <i className="pip none">–</i>
      ) : (
        pips.map((r, i) => (
          <i key={i} className={"pip " + r.toLowerCase()}>
            {r}
          </i>
        ))
      )}
    </span>
  );
}

function Team({ name, flag, side }) {
  const isUrl = typeof flag === "string" && flag.startsWith("http");
  return (
    <div className={"team " + side}>
      {isUrl ? (
        <img className="crest" src={flag} alt="" loading="lazy" />
      ) : (
        <span className="flag" aria-hidden="true">{flag || "⚽"}</span>
      )}
      <span className="tname">{name}</span>
    </div>
  );
}

function Stepper({ value, onChange, disabled, label }) {
  return (
    <div className="stepper">
      <button
        type="button"
        className="tick up"
        aria-label={`Increase ${label}`}
        disabled={disabled || value >= 15}
        onClick={() => onChange(value + 1)}
      >
        ▲
      </button>
      <output className="digit" aria-label={label}>{value}</output>
      <button
        type="button"
        className="tick down"
        aria-label={`Decrease ${label}`}
        disabled={disabled || value <= 0}
        onClick={() => onChange(value - 1)}
      >
        ▼
      </button>
    </div>
  );
}
