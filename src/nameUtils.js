// src/nameUtils.js
// One place to resolve the name shown for a player. Was hand-inlined in
// App.jsx, Leaderboard.jsx, Groups.jsx (twice) and roastGeneration.js, each
// with a different fallback ("Anonymous" / "Anon" / "Unknown" / "My"). The
// fallback stays caller-configurable so existing copy is preserved exactly.
export function displayNameOf(r, fallback = "Anonymous") {
  if (!r) return fallback;
  return r.nickname || r.displayName || fallback;
}

// First-name-only variant used by the league reveal chips.
export function firstNameOf(r, fallback = "Anon") {
  return displayNameOf(r, fallback).split(" ")[0];
}
