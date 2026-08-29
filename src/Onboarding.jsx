import { useState } from "react";
import { collection, doc, getDocs, limit, query, setDoc, where } from "firebase/firestore";
import { db } from "../firebase.js";

// Same rule as the profile editor so the handle stays consistent everywhere.
const HANDLE_RE = /^[A-Za-z0-9 _-]{3,20}$/;

// MVP: EPL is the only active league; the rest are shown but disabled (§15.6).
const LEAGUES = [
  { id: "epl", name: "Premier League", active: true },
  { id: "laliga", name: "La Liga", active: false },
  { id: "seriea", name: "Serie A", active: false },
  { id: "bundesliga", name: "Bundesliga", active: false },
  { id: "ligue1", name: "Ligue 1", active: false },
];

// First-run gate (§14.1). Forces a chosen handle before the app is usable.
// Writes the handle to `nickname` — the same field the rest of the app reads —
// so leaderboards, leagues and roasts all pick it up. Google name/email stay
// private in Firebase Auth and are never surfaced.
export default function Onboarding({ user, onDone }) {
  const [handle, setHandle] = useState("");
  const [followed, setFollowed] = useState(["epl"]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggleLeague = (id) =>
    setFollowed((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  async function finish() {
    setError("");
    const h = handle.trim();
    if (!HANDLE_RE.test(h)) {
      setError("3–20 characters: letters, numbers, spaces, - and _ only.");
      return;
    }
    if (followed.length === 0) {
      setError("Follow at least one league.");
      return;
    }
    setBusy(true);
    try {
      // Best-effort uniqueness (matches the profile editor). A Cloud Function
      // reserving handles is the race-proof version for later.
      const clash = await getDocs(
        query(collection(db, "users"), where("nickname", "==", h), limit(1))
      );
      if (!clash.empty && clash.docs[0].id !== user.uid) {
        setError("That handle is taken.");
        setBusy(false);
        return;
      }

      await setDoc(
        doc(db, "users", user.uid),
        {
          displayName: user.displayName || "Anonymous",
          photoURL: user.photoURL || "",
          nickname: h,
          followedLeagues: followed,
        },
        { merge: true }
      );

      onDone?.(); // the App snapshot flips the gate; this just picks the landing tab
    } catch (e) {
      console.error(e);
      setError("Something went wrong — try again.");
      setBusy(false);
    }
  }

  return (
    <section className="onboarding" style={{ maxWidth: 460, margin: "24px auto", padding: "0 16px" }}>
      <p className="hero-eyebrow">One quick step</p>
      <h1 style={{ marginTop: 4 }}>Pick a handle</h1>
      <p className="panel-note">
        This is the only name shown on your predictions, leaderboards and leagues.
        Your Google name and email stay private.
      </p>

      <div className="tb-input-row" style={{ marginTop: 16 }}>
        <input
          className="tb-input wide"
          value={handle}
          maxLength={20}
          placeholder="e.g. offside_oracle"
          aria-label="Handle"
          autoComplete="off"
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && finish()}
        />
      </div>

      <h2 className="section-label" style={{ marginTop: 24 }}>Follow leagues</h2>
      <div role="group" aria-label="Leagues to follow">
        {LEAGUES.map((l) => (
          <button
            key={l.id}
            type="button"
            disabled={!l.active}
            aria-pressed={followed.includes(l.id)}
            onClick={() => l.active && toggleLeague(l.id)}
            className={followed.includes(l.id) ? "tab active" : "tab"}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              marginTop: 8,
              opacity: l.active ? 1 : 0.4,
              cursor: l.active ? "pointer" : "not-allowed",
            }}
          >
            {l.name}
            {!l.active && " — soon"}
          </button>
        ))}
      </div>

      {error && (
        <p className="profile-hint" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn solid lg"
        onClick={finish}
        disabled={busy}
        style={{ width: "100%", marginTop: 24 }}
      >
        {busy ? "Setting up…" : "Start predicting"}
      </button>
    </section>
  );
}
