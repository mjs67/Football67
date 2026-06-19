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


  // ---- REVENGE NUCLEAR --- 
  "{name} got {match} right. We'll never forget. Not the prediction. The insufferability that followed. That's what we'll remember."
  "Every time {name} celebrates {pts} from {match}, they're marking themselves for destruction. And we have excellent memories."
  "At {leaguePos} with {totalPts}, {name} thinks they're untouchable. {match} was a fluke. The reckoning is coming. And it's personal."
  "{name} will spend years telling people about the time they got {match} right. We'll spend even longer making sure they regret it."
  "The universe gave {name} {pts} from {match} just to watch them over-celebrate before the inevitable collapse. The universe has a plan."
  "Enjoy your {pts} points, {name}. We're going to enjoy watching you lose them even more. And we'll be there for every second."
  "{name}'s lead from {match} is like a house of cards in a hurricane. We're the hurricane. And we're coming."
  "The higher {name} climbs off {match}, the harder they'll fall. And we've already got our popcorn ready."
  "Getting {match} right was {name}'s peak. It's all downhill from here. And we'll be there to document every moment of the descent."
  "{name} thinks they've won something. They've won our undivided attention. And our undivided attention is the most dangerous thing in this league."


    // --- STATISTICAL ASSASSINATION ---
  "{name} got {match} right. Statistically speaking, even a chimpanzee throwing darts would have gotten it right eventually. And it would have been less annoying."
  "{match} gave {name} {pts}. Statistically, they're outperforming their actual football knowledge by approximately 847%."
  "Let's run the numbers: {totalPts} points for {name}. {pts} from {match}. 100% of those points from luck. 0% from intelligence. The math checks out."
  "{name} is {leaguePos} with {totalPts}. If you remove luck from the equation, they'd be last. And even {name} knows it."
  "The probability of {name} getting {match} right was roughly 50%. The probability of them being insufferable about it was 100%. Some stats are predictable."
  "{name} has {totalPts} points. The margin of error is approximately everything about {name} as a person."
  "In the algorithm of life, {name} is a rounding error. {pts} from {match} doesn't change the calculation."
  "Statistically, {name} was due for a correct prediction. The universe just had to run through every wrong person in the league first. And it finally got to {name}."

  
  // --- SCORCHED EARTH ---
  "If intelligence was points, {name} would have negative {totalPts}. But they got {match} right so here we are. A glitch in the simulation."
  "{name} is the reason people say "anyone can predict football." They're not wrong. And neither is {name}. That's the tragedy."
  "Getting {match} right doesn't make {name} smart. It just means the universe made the exact wrong choice, for the exact wrong person."
  "{name} is {leaguePos} in a league they don't understand, celebrating {pts} from a match they don't comprehend, with an ego they don't deserve."
  "The only thing {name} has correctly predicted is how to be insufferable. The rest—including {match}—is just noise."
  "{name} thinks they've won something. They've won {pts}. Congratulations. That's still more than the number of people who will remember them."
  "Let {name} have {match}. Let them have {pts}. Let them have {leaguePos}. It doesn't matter. None of it matters. Just like {name}."
  "There isn't a single person in this league who looks at {name}'s {totalPts} points and sees talent. We all see luck. And we all see through it."
  "{match} was a disaster. {score} was a disaster. {name} getting {pts} from it? That's the actual catastrophe."
  "The only mystery left in this league is how {name} managed to trick everyone into thinking they're competent. {match} just exposed the lie."

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