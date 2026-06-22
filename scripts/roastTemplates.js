/**
 * ROAST TEMPLATES v3 — Savage/Brutal, Match-Level
 *
 * Fires once per match after FT.
 * Targets the player who scored the most points from that specific match.
 * If tied on match points, target the overall league leader.
 *
 * Variables:
 *   {name}      = username of the player being roasted
 *   {pts}       = points they earned from THIS match (e.g. +5)
 *   {match}     = match name (e.g. "Ghana v Panama")
 *   {score}     = final score (e.g. "1-0")
 *   {leaguePos} = their current league position (e.g. "1st")
 *   {totalPts}  = their total league points (e.g. "31")
 *
 * Rotation:
 *   const index = (matchId + name.length) % roastTemplates.length;
 */

export const roastTemplates = [
  "{name} predicted {match} and is somehow in first place, yet still manages to back teams that look lost from kickoff. Luck is a full-time job for {name}.",
  "{name} got {match} right and now won't stop talking about it — too bad their actual football knowledge couldn't fill a substitutes' bench. The algorithm is doing all the heavy lifting for {name}.",
  "{name} picked {match} on a complete whim, and yet here they are leading the league. Every prediction from {name} was basically a coin flip.",
  "{name} called {match} correctly and is now first place in the league, last place in humility. We get it {name}, you refreshed the leaderboard 47 times today.",
  "{name} predicted {match} would win because they 'looked fast in the trailer' and somehow it's working. Fantasy football rewards the wrong people, and {name} is exhibit A.",
  "{name} got {match} right with a scouting report that is literally just vibes and Wikipedia. Congratulations to {name} on leading the league with absolutely zero research.",
  "{name} is at the top only because three rivals got {match} wrong in the worst way possible. {name} is basically a bystander winning a race.",
  "{name} called {match} using nothing but hunches and highlight reels and is now leading the league. Darwin would be disturbed by {name}'s level of survival.",
  "{name}'s entire strategy for predicting {match} was 'whoever has the coolest jersey' and now {name} is in first. The rest of us studied stats for nothing.",
  "{name} got {match} right and is now the most insufferable person in a group chat of 12. A truly elite level of arrogance from {name} for a single correct prediction.",
  "{name} predicted {match} with smug confidence that has absolutely no business being this justified. We hate how much being right about {match} suits {name}.",
  "{name} accidentally predicted {match} due to a typo and still gained points. At this point {name} is just trolling everyone else in the league.",
  "{name} texts 'trust the process' but their process for picking {match} is literally closing their eyes and clicking. Respect to {name}, unfortunately.",
  "{name} is leading the league by a margin that should be illegal given how little research went into predicting {match}. {name} owes the rest of us our weekends back.",
  "{name} predicted {match} without knowing the team's actual form. {name} thought a high press was a type of ironing technique.",
  "{name} is winning the league with the strategic depth of a coin toss after calling {match} correctly. The audacity of {name} never having watched a full match is remarkable.",
  "{name} is topping the fantasy league while mispronouncing {match} every single time they bring it up. Embarrassing for the rest of us, honestly.",
  "{name} called {match} and the points rolled in like they signed a contract with the football gods. The rest of us have simply accepted that {name} made a deal with someone we can't see.",
  "{name} waltzes into first place every matchday acting like {match} was carefully calculated, when we all know {name}'s prediction was pure panic and prayer.",
  "{name} got {match} right and is in first place, absolutely not deserving it — which somehow makes it even more impressive. {name} is infuriating, really.",
  "The audacity {name} carries after predicting {match} is unmatched — {name} genuinely believes it was skill, and that's the funniest part of all.",
  "{name} has been in first so long after nailing {match} that they've started referring to it as 'their natural position.' Relax {name}, it's a free app on your phone.",
  "{name} predicted {match} correctly and celebrated by telling everyone at dinner. Nobody asked {name}, and nobody was surprised they made it weird.",
  "{name}'s logic for predicting {match} makes no sense on paper, yet the points roll in like {name} signed a contract with the football gods themselves.",
  "{name} is first place in the fantasy league and zero place in modesty after getting {match} right. {name} has mentioned their ranking in every group chat this week.",
  "{name} predicted {match} despite that team leaking goals like a garden hose. Classic {name}, somehow profiting from the most chaotic result of the tournament.",
  "{name} doesn't even really follow football but got {match} right and is somehow miles clear at the top. {name} is why the rest of us have trust issues.",
  "{name}'s instincts for predicting {match} are either genius or broken — based on {name}'s general football opinions, we're going with broken. Yet here they are.",
  "{name} has led this league on vibes alone since matchday one, starting with {match}. At some point the universe owes the rest of us an explanation for {name}.",
  "Every week {name} makes a prediction like {match} that should backfire spectacularly, and every week the universe personally intervenes on {name}'s behalf. Must be nice.",
  "{name} is in first and will not stop talking about {match}, which is remarkable for someone who nearly forgot to submit their predictions last week. Classic {name}.",
  "The gap between {name}'s football knowledge and their ability to call {match} correctly is wider than any pitch in this World Cup. {name} is genuinely baffling.",
  "{name} made a panic prediction on {match} at 11:58 PM that somehow paid off. The chaos agent known as {name} wins again.",
  "{name} treats the leaderboard like a personal trophy wall after calling {match} right and refreshes it more than their emails. We see the timestamps, {name}.",
  "{name}'s first place finish after predicting {match} is built on late-night panic, questionable research, and sheer dumb fortune. We admire the chaos of {name}.",
  "The gap between how calm {name} acts and how obsessively they tracked {match} is wider than any scoreline this tournament. We see through you, {name}.",
  "{name} is first in the fantasy league yet somehow still wrong about {match} in every live conversation. The duality of {name} is truly astounding.",
  "{name} celebrated their league lead after {match} before the group stage was even finished. Bold move for someone one bad gameweek from total collapse, {name}.",
  "{name} predicted {match} and we're all a little resentful, mostly because {name}'s pre-tournament strategy was asking their dog who would win.",
  "The energy {name} brings after calling {match} is somewhere between 'mildly gloating' and 'insufferable' — and {name} is leaning into it daily.",
  "{name}'s logic for predicting {match} is nonexistent on paper, yet {name} is comfortably in first. The simulation is clearly broken.",
  "League leader {name}: posting their rank after {match} unprompted, acting surprised when people aren't thrilled, doing it again tomorrow. Classic {name}.",
  "{name} predicted {match} based purely on goal celebration style and the strategy has paid off. We're all going to need therapy after watching {name} win this league.",
  "{name} has started giving unsolicited advice on {match} to people they're currently beating in the league. {name} is operating at a special kind of villain level.",
  "First place belongs to {name}, a person who thought 'expected goals' was a motivational phrase before predicting {match}. Statistically impossible, yet here is {name}.",
  "{name} is leading the league and will take full credit for calling {match} despite half their points coming from matches decided by own goals. Shameless, {name}.",
  "Congratulations to {name} on first place — earned through chaos and confusion, starting with {match} and somehow never stopping. The accidental genius of {name} is real.",
  "{name} hasn't watched a single full match including {match} but has a first-place trophy incoming. Football fans everywhere are weeping because of {name}.",
  "{name} is in first place after {match} and is already planning their victory speech. Settle down {name} — there are still matchdays left to completely ruin you.",
  "Leading the fantasy league is {name}'s entire personality now after calling {match}, and we're all a little worried about what happens to {name} when it ends. Seek balance.",
];

// generateRoast() — picks a template and fills in the variables.
// Same matchId + name always returns same template (deterministic).
export function generateRoast({ matchId, name, pts, match, score, leaguePos, totalPts }) {
  const seed = matchId
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);

  const index = (seed + name.length) % roastTemplates.length;

  return roastTemplates[index]
    .replace(/{name}/g,      name)
    .replace(/{pts}/g,       pts)
    .replace(/{match}/g,     match)
    .replace(/{score}/g,     score)
    .replace(/{leaguePos}/g, leaguePos)
    .replace(/{totalPts}/g,  totalPts);
}