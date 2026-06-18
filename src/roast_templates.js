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

  // --- PURE CONTEMPT ---
  "{name} got {match} right and is now the most annoying person alive. +{pts} points and zero self-awareness to show for it.",
  "Nobody in this league has done less to deserve {pts} points than {name}. {match} handed it to them and they still think it was skill.",
  "{name} called {match} and is acting like they coached the winning side. You filled in a form. Calm down.",
  "The {match} result is in, {score}, and {name} collects +{pts}. A fraud has been rewarded. The system is broken.",
  "{name} predicted {match} correctly. So do people who don't watch football. This means nothing. You mean nothing.",

  // --- ATTACKING THE LEAGUE LEAD ---
  "{leaguePos} in the league, {totalPts} points, and now +{pts} from {match}. {name} is proof that luck has no conscience.",
  "{name} sits {leaguePos} in this league on pure theft and delusion. {match} just handed them {pts} more points they don't deserve.",
  "Every time {name} pads their lead — like they just did with {pts} from {match} — a small part of this league dies inside.",
  "{totalPts} points. {leaguePos}. +{pts} from {match}. {name} is winning a league they have no business being anywhere near the top of.",
  "{name} is {leaguePos} with {totalPts} points and just robbed {pts} more from {match}. This is not a league anymore. It's a tragedy.",

  // --- QUESTIONING INTELLIGENCE ---
  "{name} called {match} right for the same reason a broken clock is right twice a day. Stupid luck. Not intelligence.",
  "Do not mistake {name} getting {pts} from {match} for understanding football. They don't. They never will.",
  "{name} saw {score} coming on {match}? No they didn't. They guessed and hit and now we all have to pretend it meant something.",
  "The most insulting part of {match} isn't the result. It's that {name} predicted it and genuinely believes they're good at this.",
  "{name} has {totalPts} points and has correctly predicted {match}. Neither of these facts indicate intelligence.",

  // --- PERSONAL ATTACKS ON THE WIN ---
  "{name} got {match} right and has been absolutely radioactive to be around ever since. +{pts} points, zero chill.",
  "There is not a single person in this league who wanted {name} to get {match} right. The universe ignored us. Again.",
  "{name} nailed {match} and the only thing worse than losing to them is having to watch them celebrate {pts} points like they won a trophy.",
  "We've all been subjected to {name} after {match}. +{pts} points and suddenly they're a football genius. It's embarrassing for them.",
  "{match} ends, {score}, {name} gets {pts} points, and the rest of us quietly consider our life choices that led to being in a league with them.",

  // --- ATTACKING THE MARGIN ---
  "{name} is {leaguePos} in the league and {match} just made it worse for everyone else. The gap isn't a gap anymore. It's an insult.",
  "+{pts} from {match} for {name}. The lead they're building isn't earned. It's a crime scene and they're the only suspect.",
  "{name} takes {pts} from {match} and stretches a lead built entirely on other people's suffering. Classic.",
  "Every point {name} steals from matches like {match} is a personal attack on this league. {totalPts} points of disrespect.",
  "{match} just gave {name} {pts} more reasons to be impossible. {leaguePos} and getting worse.",

  // --- DIMINISHING THE PREDICTION ---
  "{name} got {match} right. My dog would've gotten {match} right. The dog isn't insufferable about it.",
  "A child. A random stranger. {name}. All equally capable of predicting {match}. Only one of them is making it a whole thing.",
  "{name} called {score} on {match}. So did the betting markets. So did every pundit. The bar was on the floor and they still needed luck to clear it.",
  "Getting {match} right isn't an achievement. {name} making it one is the achievement — of delusion.",
  "{pts} points from {match} for {name}. The prediction required no skill, no knowledge, and no brain. A perfect fit.",

  // --- TARGETING THE EGO ---
  "{name} has used {match} as an opportunity to remind the league they exist. We were coping fine without the reminder.",
  "The confidence {name} has developed from {pts} points on {match} is medically concerning. Someone should intervene.",
  "{name} getting {match} right has done irreversible damage to their personality. +{pts} points and a completely collapsed ego.",
  "Nobody's self-esteem needed {match} to go right less than {name}'s did. Yet here we are. {pts} points and a monster unleashed.",
  "The worst outcome of {match} isn't the score. It's what {pts} points has done to {name}'s already inflated sense of self.",

  // --- MOCK DISBELIEF ---
  "{match} ends {score} and {name} — of all people — gets it right. This league has truly lost the plot.",
  "Out of everyone in this league, {name} is the last person who should be collecting {pts} from {match}. And yet.",
  "The {match} result handed {pts} points to {name} and I refuse to accept it. I'm refusing. It means nothing.",
  "{score} on {match}. {pts} points to {name}. Whatever god runs this league hates the rest of us specifically.",
  "{name} predicted {match} correctly. I've stared at this for a while now. It still doesn't make sense.",

  // --- FORESHADOWING WITH VENOM ---
  "{name} is riding {match} and {totalPts} points like it'll last. It won't. And we'll all be there when it doesn't.",
  "Keep banking {pts} from matches like {match}, {name}. The collapse is being built in real time and we have front row seats.",
  "{leaguePos} in the league on the back of {match} and pure chance. {name} is one bad round from irrelevance and they don't even know it.",
  "The higher {name} climbs off {match}, the harder this league is going to enjoy watching them fall. And we will enjoy it.",
  "{name} adds {pts} from {match} to their total. Every point is another nail in the coffin they're building for themselves.",

  // --- AUDIENCE SOLIDARITY ---
  "This league collectively lost something today when {name} got {match} right. We'll need time to process the {pts} points of injustice.",
  "Everyone watching {match} hoping {name} would get it wrong: we failed. +{pts} to the one person who deserved it least.",
  "The silence in this league after {name} scored {pts} from {match} was grief. Pure, unprocessed grief.",
  "On behalf of every player who got {match} wrong: the fact that {name} got it right is a personal attack and we're taking it personally.",
  "{match} is over, {score}, and {name} walks away with {pts} points that belong to literally anyone else in this league.",

];


// generateRoast() — picks a template and fills in the variables.
// Same matchId + name always returns same template (deterministic).
export function generateRoast({ matchId, name, pts, match, score, leaguePos, totalPts }) {
// Convert matchId string to a number for indexing
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