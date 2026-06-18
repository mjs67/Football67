// src/components/MatchRoast.jsx
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export default function MatchRoast({ leagueId, matchId, matchStatus }) {
  const [roast, setRoast] = useState(null);

  useEffect(() => {
    // Only load roast once the match is finished
    if (matchStatus !== "finished") return;

    const ref = doc(db, "leagues", leagueId, "matchRoasts", matchId);
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        setRoast(snap.data().roastText);
      }
    });

    return () => unsub();
  }, [leagueId, matchId, matchStatus]);

  if (!roast) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        padding: "8px 14px 10px",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(0,0,0,0.15)",
      }}
    >
      <span style={{ fontSize: "14px", marginTop: "2px", flexShrink: 0 }}>
        🔥
      </span>
      <p
        style={{
          fontSize: "12px",
          lineHeight: "1.6",
          color: "rgba(255,255,255,0.5)",
          margin: 0,
        }}
      >
        {roast}
      </p>
    </div>
  );
}