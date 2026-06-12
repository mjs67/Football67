import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase.js";

export default function Leaderboard({ me }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, "users"),
      orderBy("points", "desc"),
      limit(100)
    );
    return onSnapshot(
      q,
      (snap) => {
        const r = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Ties broken by tiebreaker distance (closest guess), then exact scores
        r.sort(
          (a, b) =>
            (b.points ?? 0) - (a.points ?? 0) ||
            (a.tbDistance ?? Infinity) - (b.tbDistance ?? Infinity) ||
            (b.exact ?? 0) - (a.exact ?? 0)
        );
        setRows(r);
      },
      () => setRows([])
    );
  }, []);

  if (rows === null) return <p className="empty">Loading table…</p>;
  if (rows.length === 0)
    return (
      <p className="empty">
        Nobody on the table yet. Points appear automatically once matches
        finish and the sync job runs.
      </p>
    );

  return (
    <ol className="ladder">
      <li className="ladder-head" aria-hidden="true">
        <span className="pos">#</span>
        <span className="who">Player</span>
        <span className="stat">Exact</span>
        <span className="stat">Results</span>
        <span className="pts">Pts</span>
      </li>
      {rows.map((r, i) => (
        <li key={r.id} className={"ladder-row" + (me && r.id === me.uid ? " me" : "")}>
          <span className="pos">{i + 1}</span>
          <span className="who">
            {r.photoURL ? (
              <img src={r.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="who-fallback" aria-hidden="true" />
            )}
            {r.displayName || "Anonymous"}
          </span>
          <span className="stat">{r.exact ?? 0}</span>
          <span className="stat">{r.results ?? 0}</span>
          <span className="pts">{r.points ?? 0}</span>
        </li>
      ))}
    </ol>
  );
}
