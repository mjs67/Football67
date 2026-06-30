// scripts/stages.js
// Shared knockout-stage constants + tiny helpers, previously duplicated
// across syncMatches.js and bracket.js (each had its own stage-order arrays
// and `teamName`). football-data.org's stage codes, in bracket order.
export const KO_STAGE_ORDER = ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "FINAL"];

// Human-readable stage label.
export const STAGE_NAMES = {
  LAST_32: "Round of 32",
  LAST_16: "Round of 16",
  QUARTER_FINALS: "Quarter-finals",
  SEMI_FINALS: "Semi-finals",
  THIRD_PLACE: "Third place",
  FINAL: "Final",
};

// Which stage is the first round for each bracket size.
export const FIRST_STAGE = {
  32: "LAST_32",
  16: "LAST_16",
  8: "QUARTER_FINALS",
  4: "SEMI_FINALS",
};

// football-data.org team display name (prefer the short name).
export const teamName = (t) => t.shortName || t.name;

// Stage label for a synced match: group label, named knockout stage, or "".
export function stageLabel(m) {
  if (m.group) return m.group.replace("GROUP_", "Group ");
  if (STAGE_NAMES[m.stage]) return STAGE_NAMES[m.stage];
  return "";
}
