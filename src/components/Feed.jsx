import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection, query, where, orderBy, limit, startAfter, getDocs,
  doc, setDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { shareRoastCard } from "../roastShareCard.js";

const C = {
  accent: "#c9f24d", mint: "#5ef2a8", coral: "#ff6b6b",
  text: "#f4f5ef", mutedText: "#9aa08a",
  border: "rgba(255,255,255,0.09)", card: "rgba(255,255,255,0.035)",
  chip: "rgba(255,255,255,0.05)",
};

const PAGE = 15;

const REACTIONS = [
  { type: "fire", emoji: "🔥" },
  { type: "skull", emoji: "💀" },
  { type: "sob", emoji: "😭" },
  { type: "yawn", emoji: "🥱" },
];

const TRIGGER_LABEL = {
  BANKER_HIT: "🔥 Banker hit", CONFIDENT_WRONG: "💀 Confident & wrong",
  EXACT: "🎯 Exact", MODEL_DEFIER: "🧠 Model defier", UPSET: "⚡ Upset",
  CONTRARIAN_WRONG: "🙈 Should've listened", STREAK_N: "📈 On a streak",
  COWARD: "🐔 Played it safe",
};

const SORTS = [
  { id: "fresh", label: "Fresh", field: "createdAt" },
  { id: "hottest", label: "Hottest", field: "brutalScore" },
  { id: "brutal", label: "Most Brutal", field: "brutalScore" },
];

export default function Feed({ user, onRequireSignIn }) {
  const [sort, setSort] = useState("fresh");
  const [roasts, setRoasts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // roastId -> { fire, skull, sob, yawn } tallies
  const [counts, setCounts] = useState({});
  // roastId -> the current user's chosen reaction type (or undefined)
  const [mine, setMine] = useState({});

  const sortField = useMemo(() => SORTS.find((s) => s.id === sort).field, [sort]);

  // Fetch reaction docs for a set of roastIds (≤30 per 'in' query) and fold
  // their tallies + the current user's own reaction into state.
  const loadReactions = useCallback(async (ids) => {
    if (ids.length === 0) return;
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      const snap = await getDocs(query(collection(db, "reactions"), where("roastId", "in", chunk)));
      const tally = {};
      const my = {};
      chunk.forEach((id) => (tally[id] = { fire: 0, skull: 0, sob: 0, yawn: 0 }));
      snap.forEach((d) => {
        const r = d.data();
        if (tally[r.roastId] && tally[r.roastId][r.type] != null) tally[r.roastId][r.type]++;
        if (user && d.id === `${user.uid}_${r.roastId}`) my[r.roastId] = r.type;
      });
      setCounts((c) => ({ ...c, ...tally }));
      setMine((m) => ({ ...m, ...my }));
    }
  }, [user]);

  const loadPage = useCallback(async (reset) => {
    setLoading(true);
    setError("");
    try {
      let q = query(
        collection(db, "roasts"),
        where("public", "==", true),
        orderBy(sortField, "desc"),
        limit(PAGE)
      );
      if (!reset && cursor) q = query(q, startAfter(cursor));
      const snap = await getDocs(q);
      const batch = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCursor(snap.docs[snap.docs.length - 1] || cursor);
      setDone(snap.size < PAGE);
      setRoasts((prev) => (reset ? batch : [...prev, ...batch]));
      await loadReactions(batch.map((r) => r.id));
    } catch (e) {
      console.error(e);
      setError(e.code === "failed-precondition"
        ? "Feed index still building — try again in a minute."
        : "Couldn't load the feed.");
    } finally {
      setLoading(false);
    }
  }, [sortField, cursor, loadReactions]);

  // Reset + reload whenever the sort changes.
  useEffect(() => {
    setRoasts([]); setCursor(null); setDone(false);
    loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  async function react(roastId, type) {
    if (!user) return onRequireSignIn?.();
    const ref = doc(db, "reactions", `${user.uid}_${roastId}`);
    const current = mine[roastId];
    // optimistic update
    setCounts((c) => {
      const t = { ...(c[roastId] || { fire: 0, skull: 0, sob: 0, yawn: 0 }) };
      if (current) t[current] = Math.max(0, t[current] - 1);
      if (current !== type) t[type] = (t[type] || 0) + 1;
      return { ...c, [roastId]: t };
    });
    setMine((m) => ({ ...m, [roastId]: current === type ? undefined : type }));
    try {
      if (current === type) {
        await deleteDoc(ref); // toggle off
      } else {
        await setDoc(ref, { roastId, type, updatedAt: serverTimestamp() });
      }
    } catch (e) {
      console.error("Reaction failed:", e);
      loadReactions([roastId]); // resync on failure
    }
  }

  // Hottest: client-sort the loaded set by total reactions, then brutalScore.
  const shown = useMemo(() => {
    if (sort !== "hottest") return roasts;
    const total = (id) => {
      const t = counts[id];
      return t ? t.fire + t.skull + t.sob + t.yawn : 0;
    };
    return [...roasts].sort((a, b) => total(b.id) - total(a.id) || (b.brutalScore || 0) - (a.brutalScore || 0));
  }, [roasts, counts, sort]);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {SORTS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSort(s.id)}
            style={{
              padding: "6px 14px", borderRadius: 999,
              border: `1px solid ${sort === s.id ? C.accent : C.border}`,
              background: sort === s.id ? C.accent : "transparent",
              color: sort === s.id ? "#0c0f08" : C.mutedText,
              fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <p style={{ color: C.coral, fontSize: 13 }}>{error}</p>}
      {!loading && roasts.length === 0 && !error && (
        <p style={{ color: C.mutedText, textAlign: "center", padding: 24 }}>
          No roasts yet. They land when matches finish.
        </p>
      )}

      {shown.map((r) => {
        const t = counts[r.id] || { fire: 0, skull: 0, sob: 0, yawn: 0 };
        return (
          <div key={r.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 800, color: C.text }}>{r.targetName}</span>
              <span style={{ fontSize: 11, color: C.accent, border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 9px" }}>
                {TRIGGER_LABEL[r.trigger] || r.trigger}
              </span>
            </div>
            <p style={{ color: C.text, fontSize: 15, lineHeight: 1.45, margin: "0 0 8px" }}>{r.text}</p>
            <div style={{ color: C.mutedText, fontSize: 12, marginBottom: 12 }}>
              {r.matchName}{r.finalScore ? ` · ${r.finalScore}` : ""}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {REACTIONS.map(({ type, emoji }) => {
                const on = mine[r.id] === type;
                return (
                  <button
                    key={type}
                    onClick={() => react(r.id, type)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "6px 10px", borderRadius: 999,
                      border: `1px solid ${on ? C.accent : C.border}`,
                      background: on ? "rgba(201,242,77,0.15)" : C.chip,
                      color: on ? C.accent : C.text, fontWeight: 700, fontSize: 13, cursor: "pointer",
                    }}
                  >
                    <span>{emoji}</span>
                    <span>{t[type] || 0}</span>
                  </button>
                );
              })}
              <button
                onClick={() => shareRoastCard({ roast: r }).catch((e) => e.name !== "AbortError" && alert(e.message))}
                title="Share this roast"
                style={{
                  marginLeft: "auto", padding: "6px 12px", borderRadius: 999,
                  border: `1px solid ${C.border}`, background: C.chip,
                  color: C.text, fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}
              >
                ↗ Share
              </button>
            </div>
          </div>
        );
      })}

      {!done && roasts.length > 0 && (
        <button
          onClick={() => loadPage(false)}
          disabled={loading}
          style={{ display: "block", margin: "8px auto 0", padding: "10px 18px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontWeight: 700, cursor: "pointer" }}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
