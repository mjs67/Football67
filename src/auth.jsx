import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // Firebase Auth user (private: name/email)
  const [profile, setProfile] = useState(null); // Firestore users/{uid} (public handle + stats)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile = null;
    const unsub = onAuthStateChanged(auth, (u) => {
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }
      setUser(u);
      if (!u) { setProfile(null); setLoading(false); return; }
      // Live-subscribe to the profile so onboarding completion flips state instantly.
      unsubProfile = onSnapshot(doc(db, 'users', u.uid), (snap) => {
        setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      });
    });
    return () => { unsub(); if (unsubProfile) unsubProfile(); };
  }, []);

  const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
  const signOut = () => fbSignOut(auth);

  // Onboarding is required until a public handle (displayName) exists.
  const needsOnboarding = !!user && (!profile || !profile.displayName);

  const value = { user, profile, loading, needsOnboarding, signInWithGoogle, signOut };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
