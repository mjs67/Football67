import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase.js";
import { displayNameOf } from "../nameUtils.js";
import { compareStandings } from "../standings.js";
import { Avatar } from "./PlayerIdentity.jsx";

// Maps each scope to the field names that back it. "overall" is the
// existing all-time table (unchanged); "group" and "knockout" read the
// buckets recompute.js writes alongside it — same user doc, different
// fields, so nobody's all-time standing is ever touched by these views.
const SCOPES = {
  overall: {
    label: "Overall",
    points: "points", exact: "exact", results: "results", predictionsCount: "predictionsCount",
  },
  group: {
    label: "Group Stage",
    points: "groupPoints", exact: "groupExact", results: "groupResults", predictionsCount: "groupPredictionsCount",
  },
  knockout: {
    label: "Knockout",
    points: "knockoutPoints", exact: "knockoutExact", results: "knockoutResults", predictionsCount: "knockoutPredictionsCount",
  },
};

export default function Leaderboard({ me }) {
  const [scope, setScope] = useState("overall");
  const [rows, setRows] = useState(null);

  useEffect(() => {
    setRows(null); // show the loading state while switching scopes
    const f = SCOPES[scope];
    const q = query(
      collection(db, "users"),
      orderBy(f.points, "desc"),
      limit(100)
    );
    return onSnapshot(
      q,
      (snap) => {
        const r = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Ties broken by: tiebreaker distance (closest guess) → exact scores
        // for the active scope → alphanumeric on name (shared comparator in
        // standings.js, so the Groups table and roast targeting can never
        // disagree about who's ahead).
        r.sort((a, b) => compareStandings(a, b, { pointsKey: f.points, exactKey: f.exact }));
        setRows(r);
      },
      () => setRows([])
    );
  }, [scope]);

  const f = SCOPES[scope];

  return (
    <>
      <div className="scope-switch" role="tablist" aria-label="Leaderboard scope">
        {Object.entries(SCOPES).map(([key, s]) => (
          <button
            key={key}
            role="tab"
            aria-selected={scope === key}
            className={scope === key ? "scope-pill active" : "scope-pill"}
            onClick={() => setScope(key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="empty">Loading table…</p>
      ) : rows.length === 0 ? (
        <p className="empty">
          {scope === "overall"
            ? "Nobody on the table yet. Points appear automatically once matches finish and the sync job runs."
            : `No ${f.label.toLowerCase()} points yet — check back once those fixtures kick off.`}
        </p>
      ) : (
        <ol className="ladder">
          <li className="ladder-head" aria-hidden="true">
            <span className="pos">#</span>
            <span className="who">Player</span>
            <span className="stat">Exact</span>
            <span className="stat">Results</span>
            <span className="stat rate">Pts/Pred</span>
            <span className="pts">Pts</span>
          </li>
          {rows.map((r, i) => {
            const count = r[f.predictionsCount] ?? 0;
            const rate = count > 0 ? (r[f.points] ?? 0) / count : null;
            return (
              <li key={r.id} className={"ladder-row" + (me && r.id === me.uid ? " me" : "")}>
                <span className="pos">{i + 1}</span>
                <span className="who">
                  <Avatar photoURL={r.photoURL} />
                  {displayNameOf(r)}
                </span>
                <span className="stat">{r[f.exact] ?? 0}</span>
                <span className="stat">{r[f.results] ?? 0}</span>
                <span className="stat rate">{rate === null ? "—" : rate.toFixed(1)}</span>
                <span className="pts">{r[f.points] ?? 0}</span>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
