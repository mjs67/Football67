import { useEffect, useState } from "react";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase.js";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const makeCode = () =>
  Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

export default function Groups({ user, onRequireSignIn }) {
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
        <GroupTable key={g.id} group={g} me={user} />
      ))}
    </>
  );
}

function GroupTable({ group, me }) {
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
                {r.displayName || "Anonymous"}
                {r.id === group.ownerUid && <span className="owner-chip">C</span>}
              </span>
              <span className="stat">{r.exact ?? 0}</span>
              <span className="stat">{r.results ?? 0}</span>
              <span className="pts">{r.points ?? 0}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
