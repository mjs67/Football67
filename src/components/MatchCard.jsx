import { useEffect, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase.js";
import { matchProbs, pct, predictKnockout, scoreP, scorePrediction, predictedAdvanceSide } from "../poisson.js";

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

export default function MatchCard({ match, user, prediction, onRequireSignIn }) {
  const kickoffMs = match.kickoff?.toMillis ? match.kickoff.toMillis() : 0;
  const countdown = useCountdown(kickoffMs);
  const locked = match.status === "finished" || !countdown;
  const isKnockout = match.phase === "knockout";

  const [home, setHome] = useState(prediction ? prediction.home : 0);
  const [away, setAway] = useState(prediction ? prediction.away : 0);
  // Knockout "who goes through" pick — "home" | "away". Only stored/scored on
  // a level prediction; a decisive score implies its own winner.
  const [advance, setAdvance] = useState(prediction?.advance ?? null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Sync local state when the stored prediction arrives/changes
  useEffect(() => {
    if (prediction) {
      setHome(prediction.home);
      setAway(prediction.away);
      setAdvance(prediction.advance ?? null);
    }
  }, [prediction?.home, prediction?.away, prediction?.advance]);

  const isLevel = home === away;
  const showAdvance = isKnockout && isLevel && match.status !== "finished" && !locked;

  // Default the advancer to the model's call, so a saved level scoreline always
  // carries a pick (the side shows pre-selected, matching the card); the player
  // can flip it. Cleared whenever the predicted score isn't level.
  const aiAdvance =
    isKnockout && match.odds
      ? predictKnockout(match.odds.lh, match.odds.la).advancer === "H"
        ? "home"
        : "away"
      : null;
  const effectiveAdvance = isLevel ? advance ?? aiAdvance : null;

  const dirty =
    !prediction ||
    prediction.home !== home ||
    prediction.away !== away ||
    (isLevel && (prediction.advance ?? null) !== (effectiveAdvance ?? null));

  const score = scorePrediction(prediction, match);

  // Human-readable verdict for a finished match (group: single tag; knockout:
  // stacked breakdown of whichever of the three components landed).
  const verdict = (() => {
    if (match.status !== "finished" || !prediction || !score) return null;
    const advSide = isKnockout ? predictedAdvanceSide(prediction) : null;
    const advTeam = advSide === "home" ? match.home : advSide === "away" ? match.away : null;
    const called =
      `You called ${prediction.home}–${prediction.away}` +
      (advTeam ? ` · ${advTeam} to go through` : "");
    if (!isKnockout) {
      const tag = score.exact ? "Exact score +5" : score.result ? "Right result +3" : "No points";
      return { cls: score.exact ? "v5" : score.result ? "v3" : "v0", text: `${called} · ${tag}` };
    }
    if (score.total === 0) return { cls: "v0", text: `${called} · No points` };
    const parts = [];
    if (score.exact) parts.push("exact +5");
    if (score.result) parts.push("result +3");
    if (score.advanceHit) parts.push("advance +2");
    return { cls: score.exact ? "v5" : "v3", text: `${called} · +${score.total} (${parts.join(" · ")})` };
  })();

  async function save() {
    if (!user) return onRequireSignIn();
    setSaving(true);
    try {
      await setDoc(doc(db, "predictions", `${user.uid}_${match.id}`), {
        uid: user.uid,
        matchId: match.id,
        home,
        away,
        // Knockout shootout pick; null on group games and decisive scorelines.
        advance: isLevel ? effectiveAdvance : null,
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

      {showAdvance && (
        <div className="ko-advance">
          <div className="ko-advance-head">
            <span>Level after extra time — who goes through?</span>
            <b className="ko-bonus-chip">+2</b>
          </div>
          <div className="ko-advance-options">
            <button
              type="button"
              className={"ko-team-btn" + (effectiveAdvance === "home" ? " on" : "")}
              aria-pressed={effectiveAdvance === "home"}
              onClick={() => setAdvance("home")}
            >
              <KoTeam name={match.home} flag={match.homeFlag} />
              {effectiveAdvance === "home" && <span className="ko-check" aria-hidden="true">✓</span>}
            </button>
            <button
              type="button"
              className={"ko-team-btn" + (effectiveAdvance === "away" ? " on" : "")}
              aria-pressed={effectiveAdvance === "away"}
              onClick={() => setAdvance("away")}
            >
              <KoTeam name={match.away} flag={match.awayFlag} />
              {effectiveAdvance === "away" && <span className="ko-check" aria-hidden="true">✓</span>}
            </button>
          </div>
          <p className="ko-advance-note">
            Shootouts are near coin-flips, so this is worth less than reading the 90 minutes.
          </p>
        </div>
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
          verdict ? (
            <span className={"verdict " + verdict.cls}>{verdict.text}</span>
          ) : (
            <span className="verdict">No prediction made</span>
          )
        ) : locked ? (
          <span className="verdict">
            Predictions closed
            {prediction
              ? ` · you called ${prediction.home}–${prediction.away}` +
                (isKnockout && prediction.advance
                  ? ` (${prediction.advance === "home" ? match.home : match.away} through)`
                  : "") +
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

      {isKnockout && (
        <p className="ko-score-legend">
          Knockout scoring stacks — <b>+5</b> exact score, <b>+3</b> correct result,
          and <b>+2</b> for calling who goes through (90 mins, extra time, or
          penalties). A perfect call is worth <b>10</b> pts.
        </p>
      )}
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

function KoTeam({ name, flag }) {
  const isUrl = typeof flag === "string" && flag.startsWith("http");
  return (
    <span className="ko-team">
      {isUrl ? (
        <img className="ko-crest" src={flag} alt="" loading="lazy" />
      ) : (
        <span className="ko-flag" aria-hidden="true">{flag || "⚽"}</span>
      )}
      <span className="ko-tname">{name}</span>
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
