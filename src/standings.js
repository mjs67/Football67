// src/standings.js
// The leaderboard tiebreak chain, in one place. Was duplicated verbatim in
// Leaderboard.jsx, Groups.jsx (GroupTable) and roastGeneration.js (which even
// commented that it MUST match Leaderboard). Order:
//   points DESC -> tiebreaker distance ASC -> exact-scores DESC -> name A->Z.
// Keys are parameterised so the same comparator drives the Overall / Group /
// Knockout scopes (which read different point/exact fields on the user doc).
import { displayNameOf } from "./nameUtils.js";

export function compareStandings(a, b, { pointsKey = "points", exactKey = "exact" } = {}) {
  return (
    (b[pointsKey] ?? 0) - (a[pointsKey] ?? 0) ||
    (a.tbDistance ?? Infinity) - (b.tbDistance ?? Infinity) ||
    (b[exactKey] ?? 0) - (a[exactKey] ?? 0) ||
    displayNameOf(a).localeCompare(displayNameOf(b), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
}
