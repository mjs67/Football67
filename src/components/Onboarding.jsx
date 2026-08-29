import { useState } from 'react';
import { doc, setDoc, getDocs, query, collection, where, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth';

const HANDLE_RE = /^[a-zA-Z0-9_]{3,15}$/;

// MVP: EPL only is selectable/active; others shown disabled per the cut line (§15.6).
const LEAGUES = [
  { id: 'epl',        name: 'Premier League', active: true },
  { id: 'laliga',     name: 'La Liga',        active: false },
  { id: 'seriea',     name: 'Serie A',        active: false },
  { id: 'bundesliga', name: 'Bundesliga',     active: false },
  { id: 'ligue1',     name: 'Ligue 1',        active: false },
];

export default function Onboarding({ onDone }) {
  const { user } = useAuth();
  const [handle, setHandle] = useState('');
  const [followed, setFollowed] = useState(['epl']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleLeague = (id) =>
    setFollowed((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  async function finish() {
    setError('');
    const h = handle.trim();
    if (!HANDLE_RE.test(h)) {
      setError('3–15 characters, letters/numbers/underscore only.');
      return;
    }
    if (followed.length === 0) {
      setError('Follow at least one league.');
      return;
    }
    setBusy(true);
    try {
      // Lightweight uniqueness check. NOTE: not race-proof — a Cloud Function
      // reserving handles in a /handles collection is the hardened version.
      const dupe = await getDocs(
        query(collection(db, 'users'), where('displayName', '==', h), limit(1))
      );
      if (!dupe.empty && dupe.docs[0].id !== user.uid) {
        setError('That handle is taken.');
        setBusy(false);
        return;
      }

      // Google real name/photo stay private; only this handle becomes public (§14.1).
      await setDoc(doc(db, 'users', user.uid), {
        displayName: h,
        avatarSeed: h.toLowerCase(),
        followedLeagues: followed,
        pro: false,
        savageDefault: false,
        points: 0,
        roastedCount: 0,
        streak: 0,
        settings: {
          publicRoasts: true,
          notifications: { lock: true, reveal: true, social: true },
        },
        createdAt: new Date(),
      }, { merge: true });

      onDone?.(); // parent routes to the current gameweek
    } catch (e) {
      console.error(e);
      setError('Something went wrong — try again.');
      setBusy(false);
    }
  }

  return (
    <div className="onboarding" style={{ maxWidth: 420, margin: '0 auto', padding: 24 }}>
      <h1>Pick a handle</h1>
      <p style={{ opacity: 0.7 }}>
        This is the only name shown on your roasts, share cards and leaderboards.
        Your Google name and email stay private.
      </p>

      <label htmlFor="handle" style={{ display: 'block', fontWeight: 600, marginTop: 16 }}>
        Handle
      </label>
      <input
        id="handle"
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        placeholder="e.g. offside_oracle"
        autoComplete="off"
        maxLength={15}
        style={{ width: '100%', padding: 12, fontSize: 16, marginTop: 4 }}
      />

      <h2 style={{ marginTop: 24 }}>Follow leagues</h2>
      <div role="group" aria-label="Leagues to follow">
        {LEAGUES.map((l) => (
          <button
            key={l.id}
            type="button"
            disabled={!l.active}
            aria-pressed={followed.includes(l.id)}
            onClick={() => l.active && toggleLeague(l.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: 12,
              marginTop: 8, cursor: l.active ? 'pointer' : 'not-allowed',
              opacity: l.active ? 1 : 0.4,
              outline: followed.includes(l.id) ? '2px solid currentColor' : '1px solid #8884',
            }}
          >
            {l.name}{!l.active && ' — soon'}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" style={{ color: '#ff6b6b', marginTop: 12 }}>{error}</p>
      )}

      <button
        type="button"
        onClick={finish}
        disabled={busy}
        style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, marginTop: 24 }}
      >
        {busy ? 'Setting up…' : 'Start predicting'}
      </button>
    </div>
  );
}
