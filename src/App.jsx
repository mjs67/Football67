import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase.js";
import MatchCard from "./components/MatchCard.jsx";
import Leaderboard from "./components/Leaderboard.jsx";
import MyPicks from "./components/MyPicks.jsx";
import Groups from "./components/Groups.jsx";
import Bracket from "./components/Bracket.jsx";

const TABS = [
  { id: "fixtures", label: "Fixtures" },
  { id: "picks", label: "My Picks" },
  { id: "bracket", label: "Bracket" },
  { id: "groups", label: "Leagues" },
  { id: "table", label: "Leaderboard" },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState("fixtures");
  const [matches, setMatches] = useState([]);
  const [predictions, setPredictions] = useState({}); // matchId -> prediction
  const [loadingMatches, setLoadingMatches] = useState(true);

  // Auth state
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
  }, []);

  // Matches (live)
  useEffect(() => {
    const q = query(collection(db, "matches"), orderBy("kickoff", "asc"));
    return onSnapshot(q, (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoadingMatches(false);
    });
  }, []);

  // My predictions (live)
  useEffect(() => {
    if (!user) {
      setPredictions({});
      return;
    }
    const q = query(collection(db, "predictions"), where("uid", "==", user.uid));
    return onSnapshot(q, (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        map[d.data().matchId] = d.data();
      });
      setPredictions(map);
    });
  }, [user]);

  const myPoints = useMemo(() => {
    let pts = 0;
    matches.forEach((m) => {
      const p = predictions[m.id];
      if (!p || m.status !== "finished") return;
      if (p.home === m.homeScore && p.away === m.awayScore) pts += 5;
      else if (
        Math.sign(p.home - p.away) === Math.sign(m.homeScore - m.awayScore)
      )
        pts += 3;
    });
    return pts;
  }, [matches, predictions]);

  const upcoming = matches.filter((m) => m.status !== "finished");
  const finished = matches.filter((m) => m.status === "finished");

  async function handleSignIn() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e.code !== "auth/popup-closed-by-user") {
        alert("Sign-in failed: " + e.message);
      }
    }
  }

  return (
    <div className="shell">
      <div className="pitch-lines" aria-hidden="true">
        <span className="halfway" />
        <span className="circle" />
      </div>

      <header className="topbar">
        <a className="wordmark" href="/">
          <span className="wordmark-badge" aria-hidden="true" />
          Football<span className="accent67">67</span>
          <small>Match Predictor</small>
        </a>

        {authReady &&
          (user ? (
            <div className="account">
              <span className="account-pts">
                <b>{myPoints}</b> pts
              </span>
              {user.photoURL && (
                <img
                  className="avatar"
                  src={user.photoURL}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              )}
              <button className="btn ghost" onClick={() => signOut(auth)}>
                Sign out
              </button>
            </div>
          ) : (
            <button className="btn solid" onClick={handleSignIn}>
              <GoogleMark /> Sign in with Google
            </button>
          ))}
      </header>

      <section className="hero">
        <p className="hero-eyebrow">Matchday is open</p>
        <h1>
          Call the score.
          <br />
          <em>Before the whistle.</em>
        </h1>
        <p className="hero-sub">
          Lock in a scoreline for every fixture before kickoff. Exact score
          pays <b>5&nbsp;pts</b>, the right result pays <b>3&nbsp;pts</b>.
        </p>
        {!user && authReady && (
          <button className="btn solid lg" onClick={handleSignIn}>
            <GoogleMark /> Sign in to play
          </button>
        )}
      </section>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {tab === "fixtures" && (
          <>
            {loadingMatches && <p className="empty">Loading fixtures…</p>}
            {!loadingMatches && matches.length === 0 && (
              <p className="empty">
                No fixtures yet. Run <code>npm run seed</code> to add some.
              </p>
            )}

            {upcoming.length > 0 && (
              <h2 className="section-label">Upcoming</h2>
            )}
            {upcoming.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                user={user}
                prediction={predictions[m.id]}
                onRequireSignIn={handleSignIn}
              />
            ))}

            {finished.length > 0 && (
              <h2 className="section-label">Full time</h2>
            )}
            {finished.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                user={user}
                prediction={predictions[m.id]}
                onRequireSignIn={handleSignIn}
              />
            ))}
          </>
        )}

        {tab === "picks" && (
          <MyPicks
            user={user}
            matches={matches}
            predictions={predictions}
            onRequireSignIn={handleSignIn}
          />
        )}

        {tab === "bracket" && <Bracket user={user} onRequireSignIn={handleSignIn} />}

        {tab === "groups" && <Groups user={user} matches={matches} onRequireSignIn={handleSignIn} />}

        {tab === "table" && <Leaderboard me={user} />}
      </main>

      <footer className="foot">
        football67.com · results by football-data.org · Not affiliated with FIFA.
      </footer>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="gmark" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="#EA4335" d="M12 5.04c1.62 0 3.06.56 4.2 1.64l3.12-3.12C17.4 1.78 14.94.75 12 .75 7.55.75 3.7 3.3 1.82 7.02l3.66 2.84C6.36 7.1 8.94 5.04 12 5.04z"/>
      <path fill="#4285F4" d="M23.25 12.27c0-.93-.08-1.6-.26-2.3H12v4.35h6.44c-.13 1.08-.83 2.7-2.39 3.79l3.57 2.77c2.14-1.97 3.63-4.88 3.63-8.61z"/>
      <path fill="#FBBC05" d="M5.5 14.14a6.9 6.9 0 0 1-.37-2.14c0-.74.13-1.46.35-2.14L1.82 7.02A11.2 11.2 0 0 0 .75 12c0 1.8.43 3.5 1.07 4.98l3.68-2.84z"/>
      <path fill="#34A853" d="M12 23.25c3.04 0 5.6-1 7.46-2.72l-3.57-2.77c-.95.66-2.23 1.13-3.89 1.13-3.06 0-5.64-2.06-6.5-4.75l-3.68 2.84C3.7 20.7 7.55 23.25 12 23.25z"/>
    </svg>
  );
}
