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

  // BATCH 1 — Group chat villain
  "{name} has sent their {leaguePos} ranking to the group chat three times since {match} ended. Nobody replied. {name} pinned it anyway.",
  "{name} celebrated {match} with a screenshot nobody asked for and a confidence nobody earned. The {pts} points are real. The self-awareness is not.",
  "The group chat has been unusable since {name} got {match} right. {pts} points and a completely unearned superiority complex. Well done {name}.",
  "Since {match} went {score}, {name} has been typing and deleting paragraphs in the group chat. We can all see the three dots, {name}. We are not interested.",
  "{name} called {match} and immediately changed their display name to something smug. {leaguePos} in the league, last place in the room.",

  // BATCH 2 — Luck prosecution
  "The {match} result was {score}. {name} called it. These two facts are not connected by skill. They are connected by misfortune — specifically, everyone else's.",
  "{pts} points from {match} for {name}. The football gods have a lot to answer for and {name} is near the top of the list.",
  "{name} got {match} right and the correct response is grief, not congratulations. This is a warning sign, not an achievement.",
  "We have run the numbers. The probability of {name} getting {match} right through actual knowledge is essentially zero. And yet. Here we are.",
  "{name} is {leaguePos} on {totalPts} points and climbing after {match}. The luck required to sustain this run is genuinely historic.",

  // BATCH 3 — Methodology attacks
  "{name} picked {match} by pointing at the bracket with their eyes closed. The bracket does not blink. {name} does not deserve {pts} points.",
  "Witnesses report {name} chose {match} based on which team name sounded more intimidating out loud. Football analysis at its absolute nadir.",
  "{name}'s research for {match} was a two-minute Wikipedia scan and a gut feeling. The gut feeling was wrong. The Wikipedia scan was about the stadium.",
  "{name} has never once discussed xG, press intensity, or squad depth — and yet {match} paid them {pts} points. This sport is broken and {name} is the proof.",
  "When asked how they predicted {match}, {name} said 'just a feeling.' That feeling is worth {pts} points and we are all going to need a moment.",

  // BATCH 4 — Early celebration crimes
  "{name} has already started planning how to spend the prize money after {match}. There are {totalPts} points between them and disaster. Sleep with one eye open.",
  "{name} is acting like {match} sealed the league title. It did not. It sealed their reputation as someone who peaks in the group stage.",
  "After {match}, {name} wrote a victory post they haven't sent yet. We know it exists. It is already embarrassing. Please delete it, {name}.",
  "{name} has been {leaguePos} for less than 48 hours and already speaks about the league like they won it last season too. Remarkable delusional energy from {name}.",
  "The {match} result is barely dry and {name} is already calling themselves a student of the game. {name} is a student of nothing. Sit down.",

  // BATCH 5 — Backhanded positivity
  "Credit where it's due: {name} got {match} right and is {leaguePos} in the league. That's the credit. Everything else about how they got there remains indefensible.",
  "{name} correctly predicted {match} and we are genuinely happy for them in the same way you're happy for a seagull that stole a chip. Impressed and resentful.",
  "Well done to {name} on {pts} points from {match}. A performance that was entirely unearned and completely correct. The two are not mutually exclusive, apparently.",
  "{name} is having a tournament. Is it earned? No. Is it happening? Yes. Do we have to watch? Unfortunately, yes.",
  "Respect to {name} for backing {match} when almost nobody else did. That said, the reason nobody else did is they watched the actual football. Details.",

  // BATCH 6 — Psychological damage
  "Every additional point {name} gets from matches like {match} is a personal attack on everyone who actually watched the football. {leaguePos} in the league, enemy of the state.",
  "{name} getting {pts} from {match} is the kind of thing that makes you question everything you thought you knew about effort, preparation, and whether any of it matters.",
  "The {match} result was already upsetting. Then the points went to {name}. It has been a very hard evening and we would like to go home.",
  "There is a specific kind of sadness that comes from watching {name} collect {pts} from {match}. It is not about football. It is existential.",
  "{name} predicted {match} in approximately eleven seconds and is now {leaguePos} in the league. The rest of us agonised for days. We are not okay.",

  // BATCH 7 — Scoreboard crimes
  "{totalPts} points. {leaguePos}. {name} has built a lead that is statistically unjustifiable and personally offensive. {match} just made it worse.",
  "The gap between {name}'s football knowledge and their position on this leaderboard is the most embarrassing statistic in the entire tournament.",
  "{name} is {leaguePos} with {totalPts} points and has never once been nervous about a prediction. That is not confidence. That is ignorance. And it is working.",
  "Add {pts} from {match} to {name}'s total and you have {totalPts} points and a first-place position built entirely on audacity and good fortune.",
  "The leaderboard is wrong. Not technically — {name} really is {leaguePos}. But morally? Philosophically? The leaderboard is wrong and we all know it.",

  // BATCH 8 — Rival suffering
  "{name} got {match} right while at least three people in this league with genuine football knowledge got it wrong. Justice does not exist and {name} is the evidence.",
  "People in this league have scouting reports, injury trackers, and formation breakdowns. {name} has {pts} from {match} and a position in {leaguePos}. Think about that.",
  "While you were watching {match} on a second screen with your lineup notes open, {name} was doing something else entirely. They still won the points. Unbelievable.",
  "Every person {name} has overtaken in this league after {match} is someone who genuinely cares about football. This is what caring gets you. Nothing. {name} gets everything.",
  "The most painful part of {match} is not the result. It is not the score. It is knowing that {name} predicted it first and will never let any of us forget.",

  // BATCH 9 — Villain arc
  "{name} is beginning to show signs of believing their own hype after {match}. This is the most dangerous phase of the {name} era and we are all at risk.",
  "At {leaguePos} and climbing, {name} has entered full villain mode. The {match} prediction was the origin story. We are now living through the sequel.",
  "{name} used to be humble. Then they got {match} right. Then {pts} points. Then {leaguePos}. Now look at them. The transformation is complete.",
  "After {match}, {name} has stopped asking questions and started making statements. None of the statements are about football. All of them are about themselves.",
  "{name} got {match} right and the ego expansion was immediate and total. {leaguePos} in the league, first place in the room, every single day this week.",

  // BATCH 10 — Cold, deadpan contempt
  "{name} predicted {match}. It ended {score}. They received {pts} points. None of this should have happened. And yet it did. As it always does. With {name}.",
  "The result: {score}. The match: {match}. The points: {pts}. The recipient: {name}. The injustice: total.",
  "{name}. {leaguePos}. {totalPts} points. {match}. {pts} more. There are no words that adequately describe how little this is deserved.",
  "Nothing about {name}'s prediction of {match} was informed, considered, or earned. Everything about it was correct. These are simply the facts now.",
  "{match}. {score}. {pts} points. {name}. {leaguePos}. This is the official record. History will not be kind to any of it.",
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