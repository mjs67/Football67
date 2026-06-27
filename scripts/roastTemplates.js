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
  // --- Opening block ---
  "Somehow in first place after predicting {match}, {name} still manages to back teams that look lost from kickoff. Luck is a full-time job.",
  "Got {match} right and now won't stop talking about it — too bad the actual football knowledge of {name} couldn't fill a substitutes' bench. The algorithm is doing all the heavy lifting.",
  "Picked {match} on a complete whim and yet here they are leading the league. Every prediction from {name} was basically a coin flip.",
  "Called {match} correctly and is now first place in the league, last place in humility. We get it, {name} — you refreshed the leaderboard 47 times today.",
  "Predicted {match} would win because they 'looked fast in the trailer' and somehow it's working. Fantasy football rewards the wrong people, and {name} is exhibit A.",
  "Got {match} right with a scouting report that is literally just vibes and Wikipedia. Congratulations to {name} on leading the league with absolutely zero research.",
  "At the top only because three rivals got {match} wrong in the worst way possible. {name} is basically a bystander winning a race.",
  "Called {match} using nothing but hunches and highlight reels and is now leading the league. Darwin would be disturbed by the survival of {name}.",
  "The entire strategy of {name} for predicting {match} was 'whoever has the coolest jersey' and now they're in first. The rest of us studied stats for nothing.",
  "Got {match} right and is now the most insufferable person in a group chat of 12. A truly elite level of arrogance from {name} for a single correct prediction.",
  "Predicted {match} with smug confidence that has absolutely no business being this justified. We hate how much being right about {match} suits {name}.",
  "Accidentally predicted {match} due to a typo and still gained points. At this point {name} is just trolling everyone else in the league.",
  "Texts 'trust the process' but the process of {name} for picking {match} is literally closing their eyes and clicking. Respect, unfortunately.",
  "Leading the league by a margin that should be illegal given how little research went into predicting {match} — {name} owes the rest of us our weekends back.",
  "Predicted {match} without knowing the team's actual form. {name} thought a high press was a type of ironing technique.",
  "Winning the league with the strategic depth of a coin toss after calling {match} correctly — the audacity of {name} never having watched a full match is remarkable.",
  "Topping the fantasy league while mispronouncing {match} every single time it comes up. Embarrassing for all of us, honestly — we're looking at you, {name}.",
  "Called {match} and the points rolled in like a contract was signed with the football gods. The rest of us have simply accepted the deal made by {name}.",
  "Waltzes into first place every matchday acting like {match} was carefully calculated, when everyone knows the prediction of {name} was pure panic and prayer.",
  "Got {match} right and is in first place, absolutely not deserving it — which somehow makes it even more impressive. Infuriating is the word for {name}.",
  "The audacity carried by {name} after predicting {match} is unmatched — they genuinely believe it was skill, and that's the funniest part of all.",
  "In first so long after nailing {match} that {name} has started referring to it as 'their natural position.' Relax — it's a free app on your phone.",
  "Predicted {match} correctly and celebrated by telling everyone at dinner. Nobody asked, and nobody was surprised {name} made it weird.",
  "The logic of {name} for predicting {match} makes no sense on paper, yet the points roll in like a contract was signed with the football gods themselves.",
  "First place in the fantasy league and zero place in modesty after getting {match} right. {name} has mentioned their ranking in every group chat this week.",
  "Predicted {match} despite that team leaking goals like a garden hose. Classic {name}, somehow profiting from the most chaotic result of the tournament.",
  "Doesn't even really follow football but got {match} right and is somehow miles clear at the top. {name} is why the rest of us have trust issues.",
  "The instincts of {name} for predicting {match} are either genius or broken — based on their general football opinions, we're going with broken. Yet here they are.",
  "Led this league on vibes alone since matchday one, starting with {match}. At some point the universe owes the rest of us an explanation for {name}.",
  "Every week {name} makes a prediction like {match} that should backfire spectacularly, and every week the universe personally intervenes on their behalf. Must be nice.",
  "In first and will not stop talking about {match}, which is remarkable for someone who nearly forgot to submit predictions last week. Classic {name}.",
  "The gap between the football knowledge of {name} and their ability to call {match} correctly is wider than any pitch in this World Cup. Genuinely baffling.",
  "Made a panic prediction on {match} at 11:58 PM that somehow paid off. The chaos agent known as {name} wins again.",
  "Treats the leaderboard like a personal trophy wall after calling {match} right and refreshes it more than their emails. We see the timestamps, {name}.",
  "The first place finish of {name} after predicting {match} is built on late-night panic, questionable research, and sheer dumb fortune. We admire the chaos.",
  "The gap between how calm {name} acts and how obsessively they tracked {match} is wider than any scoreline this tournament. We see through you.",
  "First in the fantasy league yet somehow still wrong about {match} in every live conversation. The duality of {name} is truly astounding.",
  "Celebrated their league lead after {match} before the group stage was even finished. Bold move for {name}, someone one bad gameweek from total collapse.",
  "Predicted {match} and we're all a little resentful, mostly because the pre-tournament strategy of {name} was asking their dog who would win.",
  "The energy {name} brings after calling {match} is somewhere between 'mildly gloating' and 'insufferable' — and they are leaning into it daily.",
  "The logic of {name} for predicting {match} is nonexistent on paper, yet they are comfortably in first. The simulation is clearly broken.",
  "League leader {name}: posting their rank after {match} unprompted, acting surprised when people aren't thrilled, doing it again tomorrow.",
  "Predicted {match} based purely on goal celebration style and the strategy has paid off. We're all going to need therapy after watching {name} win this league.",
  "Has started giving unsolicited advice on {match} to people they're currently beating in the league. {name} is operating at a special kind of villain level.",
  "First place belongs to {name}, a person who thought 'expected goals' was a motivational phrase before predicting {match}. Statistically impossible, yet here they are.",
  "Leading the league and taking full credit for calling {match} despite half their points coming from matches decided by own goals. Shameless is the word for {name}.",
  "Congratulations to {name} on first place — earned through chaos and confusion, starting with {match} and somehow never stopping. The accidental genius is real.",
  "Hasn't watched a single full match including {match} but has a first-place trophy incoming. Football fans everywhere are weeping because of {name}.",
  "In first place after {match} and already planning the victory speech. Settle down, {name} — there are still matchdays left to completely ruin you.",
  "Leading the fantasy league is the entire personality of {name} now after calling {match}, and we're all a little worried about what happens when it ends. Seek balance.",

  // BATCH 1 — Group chat villain
  "Has sent their {leaguePos} ranking to the group chat three times since {match} ended. Nobody replied. {name} pinned it anyway.",
  "Celebrated {match} with a screenshot nobody asked for and a confidence nobody earned. The {pts} points are real. The self-awareness of {name} is not.",
  "The group chat has been unusable since {name} got {match} right. {pts} points and a completely unearned superiority complex. Well done.",
  "Since {match} went {score}, {name} has been typing and deleting paragraphs in the group chat. We can all see the three dots. We are not interested.",
  "Called {match} and immediately changed their display name to something smug. {name} is {leaguePos} in the league, last place in the room.",

  // BATCH 2 — Luck prosecution
  "The {match} result was {score}. {name} called it. These two facts are not connected by skill. They are connected by misfortune — specifically, everyone else's.",
  "{pts} points from {match} handed directly to {name}. The football gods have a lot to answer for and this is near the top of the list.",
  "Got {match} right and the correct response is grief, not congratulations. This is a warning sign from {name}, not an achievement.",
  "We have run the numbers. The probability of {name} getting {match} right through actual knowledge is essentially zero. And yet. Here we are.",
  "At {leaguePos} on {totalPts} points and climbing after {match}, the luck required to sustain this run from {name} is genuinely historic.",

  // BATCH 3 — Methodology attacks
  "Picked {match} by pointing at the bracket with their eyes closed. The bracket does not blink. {name} does not deserve {pts} points.",
  "Witnesses report {name} chose {match} based on which team name sounded more intimidating out loud. Football analysis at its absolute nadir.",
  "The research of {name} for {match} was a two-minute Wikipedia scan and a gut feeling. The gut feeling was wrong. The Wikipedia scan was about the stadium.",
  "Has never once discussed xG, press intensity, or squad depth — and yet {match} paid {name} {pts} points. This sport is broken and this is the proof.",
  "When asked how they predicted {match}, {name} said 'just a feeling.' That feeling is worth {pts} points and we are all going to need a moment.",

  // BATCH 4 — Early celebration crimes
  "Already started planning how to spend the prize money after {match}. There are {totalPts} points between {name} and disaster. Sleep with one eye open.",
  "Acting like {match} sealed the league title. It did not. It sealed the reputation of {name} as someone who peaks in the group stage.",
  "After {match}, {name} wrote a victory post they haven't sent yet. We know it exists. It is already embarrassing. Please delete it.",
  "Been {leaguePos} for less than 48 hours and already speaks about the league like they won it last season too. Remarkable delusional energy from {name}.",
  "The {match} result is barely dry and {name} is already calling themselves a student of the game. A student of nothing. Sit down.",

  // BATCH 5 — Backhanded positivity
  "Credit where it's due: {name} got {match} right and is {leaguePos} in the league. That's the credit. Everything else about how they got there remains indefensible.",
  "Correctly predicted {match} and we are genuinely happy for {name} in the same way you're happy for a seagull that stole a chip. Impressed and resentful.",
  "Well done to {name} on {pts} points from {match}. A performance that was entirely unearned and completely correct. The two are not mutually exclusive, apparently.",
  "{name} is having a tournament. Is it earned? No. Is it happening? Yes. Do we have to watch? Unfortunately, yes.",
  "Respect to {name} for backing {match} when almost nobody else did. That said, the reason nobody else did is they watched the actual football. Details.",

  // BATCH 6 — Psychological damage
  "Every additional point {name} gets from matches like {match} is a personal attack on everyone who actually watched the football. {leaguePos} in the league, enemy of the state.",
  "Getting {pts} from {match} is the kind of thing that makes you question everything you thought you knew about effort and preparation — and {name} is the cause.",
  "The {match} result was already upsetting. Then the points went to {name}. It has been a very hard evening and we would like to go home.",
  "There is a specific kind of sadness that comes from watching {name} collect {pts} from {match}. It is not about football. It is existential.",
  "Predicted {match} in approximately eleven seconds and is now {leaguePos} in the league. The rest of us agonised for days. We are not okay, {name}.",

  // BATCH 7 — Scoreboard crimes
  "{totalPts} points. {leaguePos}. {name} has built a lead that is statistically unjustifiable and personally offensive. {match} just made it worse.",
  "The gap between the football knowledge of {name} and their position on this leaderboard is the most embarrassing statistic in the entire tournament.",
  "Is {leaguePos} with {totalPts} points and has never once been nervous about a prediction. That is not confidence. That is ignorance. And it is working for {name}.",
  "Add {pts} from {match} to the total of {name} and you have {totalPts} points and a first-place position built entirely on audacity and good fortune.",
  "The leaderboard is wrong. Not technically — {name} really is {leaguePos}. But morally? Philosophically? The leaderboard is wrong and we all know it.",

  // BATCH 8 — Rival suffering
  "{name} got {match} right while at least three people in this league with genuine football knowledge got it wrong. Justice does not exist and this is the evidence.",
  "People in this league have scouting reports, injury trackers, and formation breakdowns. {name} has {pts} from {match} and a position at {leaguePos}. Think about that.",
  "While you were watching {match} on a second screen with your lineup notes open, {name} was doing something else entirely. They still won the points. Unbelievable.",
  "Every person overtaken by {name} in this league after {match} is someone who genuinely cares about football. This is what caring gets you. Nothing.",
  "The most painful part of {match} is not the result. It is not the score. It is knowing that {name} predicted it first and will never let any of us forget.",

  // BATCH 9 — Villain arc
  "{name} is beginning to show signs of believing their own hype after {match}. This is the most dangerous phase of this era and we are all at risk.",
  "At {leaguePos} and climbing, {name} has entered full villain mode. The {match} prediction was the origin story. We are now living through the sequel.",
  "Used to be humble. Then {name} got {match} right. Then {pts} points. Then {leaguePos}. Now look at them. The transformation is complete.",
  "After {match}, {name} has stopped asking questions and started making statements. None of the statements are about football. All of them are about themselves.",
  "Got {match} right and the ego expansion was immediate and total. {name} is {leaguePos} in the league, first place in the room, every single day this week.",

  // BATCH 10 — Cold, deadpan contempt
  "{name} predicted {match}. It ended {score}. They received {pts} points. None of this should have happened. And yet it did. As it always does.",
  "The result: {score}. The match: {match}. The points: {pts}. The recipient: {name}. The injustice: total.",
  "{name}. {leaguePos}. {totalPts} points. {match}. {pts} more. There are no words that adequately describe how little this is deserved.",
  "Nothing about the prediction of {name} on {match} was informed, considered, or earned. Everything about it was correct. These are simply the facts now.",
  "{match}. {score}. {pts} points. {name}. {leaguePos}. This is the official record. History will not be kind to any of it.",

  // BATCH 11 — Luck prosecution (extended)
  "A coin has been flipped {totalPts} times and landed on {name} every single time. {match} was just the latest insult.",
  "Statistically, someone in this league was going to get lucky. Nobody expected it to be {name}. Nobody expected it to keep happening. And yet.",
  "There is no model, no algorithm, and no analyst on earth who would have predicted {name} calling {match}. The universe simply does not respect effort.",
  "Got {pts} points from {match} without a single informed thought entering their head. The cruel indifference of football has a name, and it is {name}.",
  "The {match} scoreline of {score} was unpredictable to everyone in this league except {name}, who did not know it was unpredictable because they did not check.",
  "Luck of this magnitude has a half-life. {name} has been spending it since matchday one, and {match} just took another chunk. The crash is coming.",
  "We asked a magic 8-ball to predict {match}. It got it wrong. {name} got it right. The 8-ball had done more research.",
  "The {pts} points awarded to {name} after {match} represent a fundamental failure of the universe to reward preparation over chaos. We are filing a complaint.",
  "Has now correctly called three matches in a row including {match} with a methodology that can best be described as aggressive indifference. Enjoy it while it lasts, {name}.",
  "At some point the luck of {name} has to regress. {match} was not that point. {totalPts} points later and it has still not been that point. We wait.",
  "Called {match} correctly despite not knowing either team's starting eleven. {name} is either the luckiest person alive or operating on a frequency the rest of us cannot hear.",
  "The probability of {name} reaching {leaguePos} on pure chance is lower than the probability of {match} ending {score}. Both happened. We are no longer surprised by anything.",
  "Did not watch {match}. Did not research {match}. Did not think about {match}. {name} simply wrote down a score and walked away. It was correct.",
  "Fortune favours the bold, they say. It also apparently favours {name}, who is neither bold nor informed, but who got {pts} from {match} regardless.",
  "In a just world, the {pts} points from {match} would go to someone who earned them. {name} does not live in a just world. They live in a better one.",
  "{name} has now accumulated {totalPts} points, a portion of which can be traced to genuine intuition and the rest directly to cosmic favouritism after {match}.",
  "The football gods gave {name} {pts} points for {match} and somewhere a scout with seventeen years of experience quietly closed their laptop.",
  "Called {match} and received {pts} points in exchange for zero insight, zero analysis, and zero concern. {name} is thriving in an economy that rewards exactly this.",
  "Every {pts}-point haul from matches like {match} is a reminder that the universe has no memory and {name} has no shame. A perfect combination.",
  "There is a version of this tournament where preparation matters. {name} is not playing in that version. {match} confirmed it.",
  "The {match} prediction from {name} was submitted between bites of a sandwich. It scored {pts} points. The sandwich was not even good.",
  "Backed the right side of {match} for reasons that will never fully be understood, and {name} is {leaguePos} in this league because of it. Football is not real.",
  "The run of {name} through this tournament, including {match}, is the statistical equivalent of pulling the same card from a shuffled deck ten times in a row. We have checked the deck.",
  "Received {pts} points from {match} and nodded like they saw it coming. {name} did not see it coming. Nobody saw it coming. That is the entire point.",
  "The luck powering {name} through this league has been consistent, unearned, and deeply personal. {match} was just the latest chapter in an increasingly upsetting story.",
  "Got {match} right and the points arrived like an apology from the universe for all the times preparation should have mattered and didn't. {name} accepted the apology.",
  "The {pts} points from {match} did not find {name} through skill. They found them through the same process that causes lightning to strike the same place twice: pure, dumb chance.",
  "Predicted {match} with the confidence of someone who has never been wrong, built entirely on the foundation of someone who has never been right. Yet here is {name}.",
  "There is no explanation for {name} being {leaguePos} after {match} that does not involve either luck, chaos, or a direct arrangement with forces beyond our understanding.",
  "The universe has decided {name} deserves {totalPts} points and a {leaguePos} finish. We have reviewed the universe's reasoning. We do not agree. We cannot appeal.",
  "Twelve people started this league. Eleven of them watched {match}. One of them got the most points from it. {name} was not the one who watched.",
  "The correct prediction of {name} on {match} was not the result of knowledge. It was the result of a process so random it has looped back around to looking intentional.",
  "Luck this sustained has a name, and after {match} the name is {name}. It has been logged. It will be referenced at every future prediction that goes wrong.",
  "Got {pts} points from {match} in the same way a stopped clock gets the time right. {name} happened to be pointing at the correct answer when the whistle blew.",
  "The football gods owe many people in this league an apology. Instead they gave {name} {pts} points from {match} and called it even. It is not even.",
  "If you removed every point {name} collected from matches they did not understand, including {match}, the league table would look very different. We have done the maths.",
  "Has now strung together enough lucky calls, including {match}, that {name} is starting to use the word 'form.' We would like to formally object to this word choice.",
  "The {pts} points from {match} are real. The insight behind them is not. {name} is {leaguePos} in the league and the gap between those two facts is the whole story.",
  "Predicted {match} in the same way a dart lands in a bullseye when thrown blindfolded — eventually, statistically, someone throws a bullseye. Today it was {name}.",
  "The case against luck in fantasy football has been building all tournament. {match} just added another exhibit, and the exhibit is labelled {name}.",
  "Got {match} right and is now {leaguePos} with {totalPts} points. Somewhere in a parallel universe where effort is rewarded, {name} is in last place. We want to go there.",
  "The most scientific explanation for the success of {name} after {match} is that probability, given enough chances, will eventually embarrass everyone. It is this league's turn.",
  "Fortune, chaos, and the specific score of {match} have conspired to put {name} at {leaguePos}. None of these things were invited. All of them showed up anyway.",
  "Called {match} and banked {pts} points on instincts that have no basis in football knowledge and every basis in the kind of luck that ruins leagues. We are ruined. Thanks, {name}.",
  "The {match} prediction from {name} was correct in the same way a broken compass occasionally points north. It happens. It does not mean the compass works.",
  "Accumulated {totalPts} points through a combination of fortune, chaos, and the occasional accidental insight. {name} after {match} is a case study in unearned success.",
  "Is {leaguePos} in this league because {match} ended {score} and {name} wrote down {score} without knowing why. This is the complete and total explanation.",
  "The luck of {name} is not a strategy. It is not a skill. It is a weather event. And like all weather events, it will eventually pass. {match} just delayed it again.",
  "Predicted {match} correctly, collected {pts} points, and contributed nothing to our collective understanding of football. Another day, another unearned triumph for {name}.",
  "Every correct call from {name}, including {match}, is a data point in the growing argument that this league should require proof of footballing knowledge before entry.",
];

// generateRoast() — picks a template and fills in the variables.
// Deterministic: same inputs always return the same template.
// Uses a djb2-style hash over "matchId|name|totalPts" so that sequential
// matchIds (which differ by only one character) produce well-spread indices
// rather than clustering in a narrow band. Compared to the original
// char-sum approach this typically yields 3–4× more unique roasts for the
// same player across a full tournament.
export function generateRoast({ matchId, name, pts, match, score, leaguePos, totalPts }) {
  const key = `${matchId}|${name}|${totalPts}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = (h * 33) ^ key.charCodeAt(i);
  const index = (h >>> 0) % roastTemplates.length;

  return roastTemplates[index]
    .replace(/{name}/g,      name)
    .replace(/{pts}/g,       pts)
    .replace(/{match}/g,     match)
    .replace(/{score}/g,     score)
    .replace(/{leaguePos}/g, leaguePos)
    .replace(/{totalPts}/g,  totalPts);
}
