import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase.js";
import MatchRoast from "./MatchRoast.jsx";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const makeCode = () =>
  Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

export default function Groups({ user, matches = [], onRequireSignIn }) {
  const [groups, setGroups] = useState(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setGroups(null);
      return;
    }
    const q = query(collection(db, "groups"), where("members", "array-contains", user.uid));
    return onSnapshot(q, (snap) =>
      setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, [user]);

  if (!user)
    return (
      <p className="empty">
        <button className="btn solid" onClick={onRequireSignIn}>
          Sign in
        </button>
        <br />
        <br />
        Sign in to start a league with your friends.
      </p>
    );

  async function createGroup() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await addDoc(collection(db, "groups"), {
        name: trimmed.slice(0, 40),
        code: makeCode(),
        ownerUid: user.uid,
        members: [user.uid],
        createdAt: serverTimestamp(),
      });
      setName("");
    } catch (e) {
      alert("Could not create league: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinGroup() {
    const c = code.trim().toUpperCase();
    if (c.length !== 6) return alert("Invite codes are 6 characters.");
    setBusy(true);
    try {
      const snap = await getDocs(
        query(collection(db, "groups"), where("code", "==", c), limit(1))
      );
      if (snap.empty) {
        alert("No league found with that code.");
        return;
      }
      const g = snap.docs[0];
      if (g.data().members?.includes(user.uid)) {
        alert("You're already in that league.");
        return;
      }
      if ((g.data().members?.length || 0) >= 50) {
        alert("That league is full (50 players max).");
        return;
      }
      await updateDoc(g.ref, { members: arrayUnion(user.uid) });
      setCode("");
    } catch (e) {
      alert("Could not join league: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="group-actions">
        <div className="panel">
          <p className="panel-eyebrow">Start a league</p>
          <div className="tb-input-row">
            <input
              className="tb-input wide"
              value={name}
              maxLength={40}
              placeholder="League name"
              onChange={(e) => setName(e.target.value)}
              aria-label="League name"
            />
            <button className="btn solid" onClick={createGroup} disabled={busy || !name.trim()}>
              Create
            </button>
          </div>
        </div>
        <div className="panel">
          <p className="panel-eyebrow">Join with a code</p>
          <div className="tb-input-row">
            <input
              className="tb-input wide code"
              value={code}
              maxLength={6}
              placeholder="ABC123"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              aria-label="Invite code"
            />
            <button className="btn solid" onClick={joinGroup} disabled={busy || code.length !== 6}>
              Join
            </button>
          </div>
        </div>
      </div>

      {groups === null && <p className="empty">Loading leagues…</p>}
      {groups && groups.length === 0 && (
        <p className="empty">
          No leagues yet. Create one and share the invite code with your friends.
        </p>
      )}
      {groups?.map((g) => (
        <GroupTable key={g.id} group={g} me={user} matches={matches} />
      ))}
    </>
  );
}

function GroupTable({ group, me, matches }) {
  const [rows, setRows] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const ids = (group.members || []).slice(0, 50);
      const chunks = [];
      for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
      const all = [];
      for (const chunk of chunks) {
        const snap = await getDocs(
          query(collection(db, "users"), where(documentId(), "in", chunk))
        );
        snap.docs.forEach((d) => all.push({ id: d.id, ...d.data() }));
      }
      // Members with no users doc yet (never settled) still show with 0 pts
      const have = new Set(all.map((r) => r.id));
      ids.forEach((id) => {
        if (!have.has(id)) all.push({ id, displayName: "New player", points: 0 });
      });
      all.sort(
        (a, b) =>
          (b.points ?? 0) - (a.points ?? 0) ||
          (a.tbDistance ?? Infinity) - (b.tbDistance ?? Infinity) ||
          (b.exact ?? 0) - (a.exact ?? 0)
      );
      if (!cancelled) setRows(all);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [group.members]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(group.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable; code is visible anyway */
    }
  }

  async function leave() {
    if (!confirm(`Leave "${group.name}"?`)) return;
    try {
      await updateDoc(doc(db, "groups", group.id), { members: arrayRemove(me.uid) });
    } catch (e) {
      alert("Could not leave league: " + e.message);
    }
  }

  return (
    <section className="group">
      <header className="group-head">
        <h3 className="group-name">{group.name}</h3>
        <div className="group-tools">
          <button className="btn ghost sm" onClick={copyCode} title="Copy invite code">
            {copied ? "Copied ✓" : `Code: ${group.code}`}
          </button>
          {group.ownerUid !== me.uid && (
            <button className="btn ghost sm" onClick={leave}>
              Leave
            </button>
          )}
        </div>
      </header>
      {rows === null ? (
        <p className="empty">Loading standings…</p>
      ) : (
        <>
        <ol className="ladder">
          {rows.map((r, i) => (
            <li key={r.id} className={"ladder-row" + (r.id === me.uid ? " me" : "")}>
              <span className="pos">{i + 1}</span>
              <span className="who">
                {r.photoURL ? (
                  <img src={r.photoURL} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="who-fallback" aria-hidden="true" />
                )}
                {r.nickname || r.displayName || "Anonymous"}
                {r.id === group.ownerUid && <span className="owner-chip">C</span>}
              </span>
              <span className="stat">{r.exact ?? 0}</span>
              <span className="stat">{r.results ?? 0}</span>
              <span className="pts">{r.points ?? 0}</span>
            </li>
          ))}
        </ol>
        <RevealedPicks group={group} members={rows} matches={matches} />
        </>
      )}
    </section>
  );
}

function revealPoints(pred, match) {
  if (!pred || match.status !== "finished") return null;
  if (pred.home === match.homeScore && pred.away === match.awayScore) return 5;
  if (Math.sign(pred.home - pred.away) === Math.sign(match.homeScore - match.awayScore))
    return 3;
  return 0;
}

function RevealedPicks({ group, members, matches }) {
  // Most recent matches that have kicked off (live or finished)
  const kicked = useMemo(
    () =>
      matches
        .filter((m) => m.kickoff?.toMillis && m.kickoff.toMillis() <= Date.now())
        .sort((a, b) => b.kickoff.toMillis() - a.kickoff.toMillis())
        .slice(0, 3),
    [matches]
  );

  const [picks, setPicks] = useState(null); // matchId -> Map(uid -> pred)
  const [sharedMatchId, setSharedMatchId] = useState(null); // { id, mode: 'shared'|'copied' }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const out = {};
      for (const m of kicked) {
        try {
          const snap = await getDocs(
            query(collection(db, "predictions"), where("matchId", "==", m.id))
          );
          out[m.id] = new Map(snap.docs.map((d) => [d.data().uid, d.data()]));
        } catch {
          out[m.id] = null; // not revealable yet (clock skew right at kickoff)
        }
      }
      if (!cancelled) setPicks(out);
    }
    if (kicked.length > 0) load();
    else setPicks({});
    return () => {
      cancelled = true;
    };
  }, [kicked, group.id]);

  if (kicked.length === 0 || picks === null) return null;

  const memberIds = new Set((group.members || []).slice(0, 50));
  const named = members.filter((r) => memberIds.has(r.id));

  async function shareMatch(m, byUid) {
    // ── Canvas constants (matches shareCard.js palette) ──────────
    const W = 1080;
    const C = {
      night:   "#0a0a0c",
      pitch:   "#16161c",
      deep:    "#0e0e12",
      chalk:   "#f4f4f0",
      chalk60: "rgba(244,244,240,0.6)",
      chalk25: "rgba(244,244,240,0.25)",
      chalk12: "rgba(244,244,240,0.12)",
      volt:    "#c8ff1e",
      voltInk: "#161d02",
      red:     "#ff6b5c",
      blue:    "#4d7fff",
    };

    function roundRect(cx, x, y, w, h, r) {
      cx.beginPath();
      cx.moveTo(x + r, y);
      cx.arcTo(x + w, y,     x + w, y + h, r);
      cx.arcTo(x + w, y + h, x,     y + h, r);
      cx.arcTo(x,     y + h, x,     y,     r);
      cx.arcTo(x,     y,     x + w, y,     r);
      cx.closePath();
    }

    // Word-wrap helper: splits text into lines that fit within maxW
    function wrapText(ctx, text, maxW) {
      const words = text.split(" ");
      const lines = [];
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxW && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      return lines;
    }

    const canvas = document.createElement("canvas");
    canvas.width = W;
    // Height will be set after measuring chips + roast — use a temp canvas
    const measureCtx = document.createElement("canvas").getContext("2d");

    // ── Pre-measure chip widths to compute canvas height ────────
    const CHIP_H = 76;
    const CHIP_PAD_X = 28;
    const CHIP_GAP = 16;
    const CHIP_TOP = 280;
    const PAD = 72;

    const chips = named.map((r) => {
      const p = byUid?.get(r.id);
      const pts = p ? revealPoints(p, m) : null;
      return {
        name: (r.nickname || r.displayName || "Anon").split(" ")[0],
        pred: p ? `${p.home}–${p.away}` : "—",
        pts,
      };
    });

    measureCtx.font = "600 28px 'Barlow', sans-serif";
    const chipData = chips.map((c) => {
      measureCtx.font = "600 28px 'Barlow', sans-serif";
      const nameW = measureCtx.measureText(c.name).width;
      measureCtx.font = "700 30px 'Saira', sans-serif";
      const predW = measureCtx.measureText(c.pred).width;
      measureCtx.font = "700 24px 'Saira', sans-serif";
      const ptsW = c.pts !== null ? measureCtx.measureText(`+${c.pts}`).width + 14 : 0;
      const total = CHIP_PAD_X * 2 + nameW + 16 + predW + (ptsW ? 10 + ptsW : 0);
      return { ...c, w: total, nameW, predW, ptsW };
    });

    const maxRowW = W - PAD * 2;
    const chipRows = [[]];
    let rowW = 0;
    for (const chip of chipData) {
      if (chipRows[chipRows.length - 1].length > 0 && rowW + CHIP_GAP + chip.w > maxRowW) {
        chipRows.push([]);
        rowW = 0;
      }
      chipRows[chipRows.length - 1].push(chip);
      rowW += (chipRows[chipRows.length - 1].length > 1 ? CHIP_GAP : 0) + chip.w;
    }

    // ── Fetch roast text (only for finished matches) ─────────────
    let roastText = null;
    let roastLines = [];
    const ROAST_FONT = "400 30px 'Barlow', sans-serif";
    const ROAST_LINE_H = 44;
    const ROAST_PAD_TOP = 28;
    const ROAST_PAD_X = 28;

    if (m.status === "finished") {
      try {
        const roastSnap = await getDoc(doc(db, "groups", group.id, "matchRoasts", m.id));
        if (roastSnap.exists()) {
          roastText = roastSnap.data().roastText;
          measureCtx.font = ROAST_FONT;
          roastLines = wrapText(measureCtx, `🔥 ${roastText}`, maxRowW - ROAST_PAD_X * 2);
        }
      } catch {
        // Roast unavailable — draw without it
      }
    }

    // ── Compute total canvas height ───────────────────────────────
    const chipsBottom = CHIP_TOP + chipRows.length * (CHIP_H + CHIP_GAP) - CHIP_GAP;
    const roastBlockH = roastText
      ? ROAST_PAD_TOP + roastLines.length * ROAST_LINE_H + 32
      : 0;
    const FOOTER_H = 88;
    const H = Math.max(chipsBottom + roastBlockH + FOOTER_H, 480);
    canvas.height = H;
    const cx = canvas.getContext("2d");

    // ── Background ───────────────────────────────────────────────
    cx.fillStyle = C.night;
    cx.fillRect(0, 0, W, H);

    const glow = cx.createRadialGradient(W / 2, -40, 0, W / 2, -40, W * 0.7);
    glow.addColorStop(0, "rgba(200,255,30,0.07)");
    glow.addColorStop(1, "transparent");
    cx.fillStyle = glow;
    cx.fillRect(0, 0, W, H);

    // ── League + match header ────────────────────────────────────
    cx.textBaseline = "middle";

    cx.fillStyle = C.chalk60;
    cx.font = "600 30px 'Barlow', sans-serif";
    cx.textAlign = "left";
    cx.fillText(group.name.toUpperCase(), PAD, 72);

    cx.fillStyle = C.chalk;
    cx.font = "700 72px 'Saira Condensed', 'Arial Narrow', sans-serif";
    const matchLabel = `${m.home.toUpperCase()}  v  ${m.away.toUpperCase()}`;
    cx.fillText(matchLabel, PAD, 148);

    // Score chip
    const scoreStr = m.status === "finished"
      ? `FT ${m.homeScore}–${m.awayScore}`
      : "● LIVE";
    cx.font = "700 32px 'Saira', sans-serif";
    const scoreW = cx.measureText(scoreStr).width + 32;
    const scoreX = PAD;
    const scoreY = 185;
    roundRect(cx, scoreX, scoreY, scoreW, 48, 8);
    cx.fillStyle = m.status === "finished" ? C.volt : C.red;
    cx.fill();
    cx.fillStyle = m.status === "finished" ? C.voltInk : C.chalk;
    cx.textAlign = "left";
    cx.fillText(scoreStr, scoreX + 16, scoreY + 24);

    // ── Divider ──────────────────────────────────────────────────
    cx.strokeStyle = C.chalk12;
    cx.lineWidth = 2;
    cx.beginPath();
    cx.moveTo(PAD, 256); cx.lineTo(W - PAD, 256);
    cx.stroke();

    // ── Pick chips ───────────────────────────────────────────────
    chipRows.forEach((row, ri) => {
      let x = PAD;
      const y = CHIP_TOP + ri * (CHIP_H + CHIP_GAP);
      row.forEach((chip) => {
        roundRect(cx, x, y, chip.w, CHIP_H, 10);
        cx.fillStyle = chip.pts === 5 ? "rgba(200,255,30,0.12)"
                     : chip.pts === 3 ? "rgba(244,244,240,0.06)"
                     : C.deep;
        cx.fill();
        cx.strokeStyle = chip.pts === 5 ? C.volt
                       : chip.pts === 3 ? C.chalk25
                       : C.chalk12;
        cx.lineWidth = chip.pts === 5 ? 2.5 : 1.5;
        roundRect(cx, x, y, chip.w, CHIP_H, 10);
        cx.stroke();

        const cy2 = y + CHIP_H / 2;
        let tx = x + CHIP_PAD_X;

        cx.fillStyle = C.chalk60;
        cx.font = "600 28px 'Barlow', sans-serif";
        cx.textAlign = "left";
        cx.fillText(chip.name, tx, cy2);
        tx += chip.nameW + 16;

        cx.fillStyle = chip.pts === 5 ? C.volt : C.chalk;
        cx.font = "700 30px 'Saira', sans-serif";
        cx.fillText(chip.pred, tx, cy2);
        tx += chip.predW;

        if (chip.pts !== null) {
          tx += 10;
          cx.fillStyle = chip.pts === 5 ? C.volt : chip.pts === 3 ? C.chalk : C.chalk25;
          cx.font = "700 24px 'Saira', sans-serif";
          cx.fillText(`+${chip.pts}`, tx, cy2);
        }

        x += chip.w + CHIP_GAP;
      });
    });

    // ── Roast block ──────────────────────────────────────────────
    if (roastText && roastLines.length > 0) {
      const roastY = chipsBottom + ROAST_PAD_TOP;

      // Thin divider above roast
      cx.strokeStyle = "rgba(255,255,255,0.07)";
      cx.lineWidth = 1.5;
      cx.beginPath();
      cx.moveTo(PAD, roastY - 14); cx.lineTo(W - PAD, roastY - 14);
      cx.stroke();

      cx.font = ROAST_FONT;
      cx.fillStyle = C.chalk60;
      cx.textAlign = "left";
      roastLines.forEach((line, li) => {
        cx.fillText(line, PAD + ROAST_PAD_X, roastY + li * ROAST_LINE_H + ROAST_LINE_H / 2);
      });
    }

    // ── Footer ───────────────────────────────────────────────────
    cx.textAlign = "center";
    cx.fillStyle = C.volt;
    cx.font = "700 36px 'Saira Condensed', 'Arial Narrow', sans-serif";
    cx.fillText("WWW.FOOTBALL67.COM", W / 2, H - 48);

    // ── Share / download ─────────────────────────────────────────
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    const file = new File([blob], "football67-league.png", { type: "image/png" });

    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${m.home} v ${m.away} — ${group.name}`,
          text: `Check out our league picks on Football67!`,
        });
        setSharedMatchId({ id: m.id, mode: "shared" });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "football67-league.png";
        a.click();
        URL.revokeObjectURL(a.href);
        setSharedMatchId({ id: m.id, mode: "shared" });
      }
      setTimeout(() => setSharedMatchId(null), 1800);
    } catch (e) {
      if (e.name !== "AbortError") console.error("Share failed:", e);
    }
  }

  return (
    <div className="reveal">
      <h4 className="reveal-title">Locked-in picks <span>revealed at kickoff</span></h4>
      {kicked.map((m) => {
        const byUid = picks[m.id];
        return (
          <div className="reveal-match" key={m.id}>
            <p className="reveal-head">
              <b>{m.home}</b> v <b>{m.away}</b>
              {m.status === "finished" ? (
                <span className="reveal-ft"> FT {m.homeScore}–{m.awayScore}</span>
              ) : (
                <span className="reveal-live"> ● Live</span>
              )}
              <button
                className="btn ghost sm reveal-share-btn"
                onClick={() => shareMatch(m, byUid)}
                title="Share this match's picks"
              >
                {sharedMatchId?.id === m.id ? "Shared ✓" : "Share"}
              </button>
            </p>
            <div className="reveal-chips">
              {named.map((r) => {
                const p = byUid?.get(r.id);
                const pts = p ? revealPoints(p, m) : null;
                return (
                  <span
                    className={
                      "reveal-chip" +
                      (pts === 5 ? " gold" : pts === 3 ? " ok" : pts === 0 ? " zero" : "")
                    }
                    key={r.id}
                  >
                    {(r.nickname || r.displayName || "Anon").split(" ")[0]}
                    <b>{p ? `${p.home}–${p.away}` : "—"}</b>
                    {pts !== null && <i>+{pts}</i>}
                  </span>
                );
              })}
            </div>
            {m.status === "finished" && (
              <MatchRoast
                leagueId={group.id}
                matchId={m.id}
                matchStatus={m.status}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
