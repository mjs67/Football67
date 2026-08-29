// scripts/roastBank.js
// ── The roast bank (§5.2) ────────────────────────────────────────────
// STARTER bank: templates per roastTrigger × severity. roastGeneration.js's
// v2 router picks an unused template for a settled prediction's trigger,
// fills the slots, and writes a roasts doc.
//
// ⚠️ HUMAN REVIEW IS THE SAFETY GATE (§5.2 step 2, §11).
// Nothing here should serve until a person has read it. When you expand this
// bank (production wants ~30–50 per trigger×severity, this is ~5 to prove the
// system), every new line goes through the same review. The content line is
// NON-NEGOTIABLE:
//   • Roast the PICK, the football habit, the model, the overconfidence.
//   • NEVER the person's identity, appearance, gender, race, nationality,
//     religion, disability, or any protected characteristic.
//   • No slurs, no sexual content, no threats. Savage = sharper wit about the
//     PICK, not cruelty about the human.
//   • {name} is a self-chosen handle, not a real name — keep it that way.
//
// Slots the router provides (not every trigger uses every slot):
//   {name}      the user's handle
//   {match}     e.g. "Arsenal v Chelsea"
//   {score}     the actual full-time score, e.g. "2-1"
//   {predScore} the user's predicted score, e.g. "3-0"
//   {streakN}   consecutive-correct count (STREAK_N only)
//
// severity: "cheeky" (default) and "savage" (age/consent-gated, §11).

export const ROAST_BANK = {
  // Correct EXACT score — savant energy.
  EXACT: {
    cheeky: [
      "{name} called {match} {score} on the nose. Touch grass? No. Watch more football.",
      "{name} predicted {score} exactly. Suspiciously specific. The FA would like a word.",
      "Exact score on {match}. {name} either studies xG for fun or has a time machine.",
      "{name} nailed {score}. That's not luck, that's a personality trait now.",
      "{match} finished {score}, exactly as {name} foretold. Nerd.",
    ],
    savage: [
      "{name} predicted {match} {score} to the goal. Get a hobby that isn't this. Ideally one with sunlight.",
      "Exact {score} on {match}. {name} has clearly replaced a social life with expected-goals models. Bold.",
      "{name} called {score} dead on. Genuinely impressive. Genuinely also a cry for help.",
      "{match}, {score}, exact. {name}'s spreadsheet has a spreadsheet. We're a little worried.",
    ],
  },

  // Correct, but you backed the outcome the model rated LEAST likely — smug genius.
  MODEL_DEFIER: {
    cheeky: [
      "The model said no. {name} said watch this. {match} finished {score}. Smug looks good on you.",
      "{name} ignored the odds on {match} and was right. The Poisson model is in its room thinking about what it did.",
      "Everyone trusted the model. {name} trusted a vibe. The vibe went {score}.",
      "{name} defied the numbers on {match} and cashed it. Insufferable. Correct, but insufferable.",
    ],
    savage: [
      "The model gave {name}'s pick the lowest chance on the board. {name} took it anyway and won {score}. Show-off. Nobody likes a show-off.",
      "{name} looked at the data for {match}, said 'nah', and was right. Enjoy it — the model has a longer memory than you do.",
      "{match} went {score} exactly against the odds. {name} will bring this up at every opportunity for the next decade.",
    ],
  },

  // Correct underdog result — you saw it coming.
  UPSET: {
    cheeky: [
      "Barely anyone backed it. {name} did. {match} went {score} and the group chat is quiet.",
      "{name} saw the upset in {match} while everyone else picked the obvious. {score}. Respect.",
      "The underdog got up in {match}, and {name} was the only one not surprised. {score}.",
      "{name} called the chaos. {match} {score}. Sometimes the coward's pick is the wrong one — not today, {name}.",
    ],
    savage: [
      "The whole feed piled onto the favourite in {match}. {name} didn't, and {name} was right. {score}. The rest of you, take notes.",
      "{name} backed the upset nobody else had the nerve to. {match} {score}. Brave. The others just followed the herd off a cliff.",
      "{match} went {score} — the result 90% of pickers were too timid to touch. {name} wasn't. Loud about it? Absolutely.",
    ],
  },

  // Correct but obvious — a coin could do your job.
  COWARD: {
    cheeky: [
      "{name} picked the raging favourite in {match} and it won {score}. Groundbreaking. Alert the media.",
      "Bold prediction from {name}: the best team won. {match} {score}. A coin flips harder.",
      "{name} backed the obvious in {match}. It came in {score}. Points are points, I guess, hero.",
      "Everyone and their nan picked this one. {name} included. {match} {score}. Safe. So safe.",
    ],
    savage: [
      "{name} predicted the overwhelming favourite would win {match}, and — stop the presses — it did, {score}. A weather app takes more risks.",
      "Astonishing courage from {name}: backing the team everyone backed. {match} {score}. Riveting stuff.",
      "{name} played it so safe on {match} a pigeon could've picked it. {score}. Thrilling as ever.",
    ],
  },

  // N correct in a row — escalating cry for help.
  STREAK_N: {
    cheeky: [
      "{name} is on {streakN} correct in a row. Okay. What else is going on in your life? Anything?",
      "{streakN} straight for {name}. At this point it's less a hot streak and more a lifestyle.",
      "{name} has hit {streakN} in a row. The football knows. It's scared.",
      "{streakN} correct picks running. {name}, blink twice if the fixtures are holding you hostage.",
    ],
    savage: [
      "{streakN} in a row for {name}. That's not form, that's a diagnosis. Please go outside.",
      "{name} is {streakN} deep on this streak. We're not saying get help. We're saying the streak might BE the help, and that's worse.",
      "{streakN} straight. {name} has clearly made a deal with something. The points are real; the concern is realer.",
    ],
  },

  // Banker correct — peak severity, prime share.
  BANKER_HIT: {
    cheeky: [
      "{name} slapped the Banker on {match} and it came in {score}. Double points, double smugness. Screenshotted forever.",
      "Banker on {match}? Cashed. {score}. {name} is unbearable right now and has fully earned it.",
      "{name} called their shot, banked it, and {match} obeyed: {score}. Frame it.",
      "The Banker landed for {name}. {match} {score}, times two. This is the one they'll tell the grandkids about.",
    ],
    savage: [
      "{name} banked {match}, it hit {score}, and now none of us will hear the end of it until the heat death of the universe. Deserved. Exhausting.",
      "Banker on {match}, correct, {score}, doubled. {name} peaked. It's all downhill from here and we're glad.",
      "{name} put the Banker on the line and {match} delivered {score}. Peak football-knower behaviour. Insufferable in the best way.",
    ],
  },

  // Banker WRONG — savage-only mockery (cheeky kept gentle for consent reasons).
  CONFIDENT_WRONG: {
    cheeky: [
      "{name} banked {match} for {predScore}. It finished {score}. The confidence was the funniest part.",
      "Double or nothing on {match}, said {name}. It was nothing. {score}. Bold strategy.",
      "{name}'s Banker on {match} did not, in fact, bank. {score} vs the {predScore} they promised. Oof.",
    ],
    savage: [
      "{name} stared at {match}, said 'this is the one', banked it for {predScore}, and it went {score}. Certainty is a hell of a drug.",
      "The Banker. The one you're SURE about. {name} was sure about {match} at {predScore}. It went {score}. Humbling doesn't cover it.",
      "{name} put the big one on {match} and watched it finish {score}. The predicted {predScore} is now evidence in the group chat trial.",
      "Nothing says confidence like {name} banking {match} at {predScore} and getting {score}. The whole feed felt that one.",
    ],
  },

  // Defied the model and LOST — should've listened.
  CONTRARIAN_WRONG: {
    cheeky: [
      "{name} knew better than the model on {match}. {name} did not know better. {score}.",
      "The odds said one thing. {name} said another. The scoreboard said {score}. Awkward.",
      "{name} went against the numbers on {match} for {predScore}. The numbers went {score}. They're not mad, just disappointed.",
    ],
    savage: [
      "{name} looked the model dead in the eye on {match}, backed {predScore}, and got {score}. The model is not gloating. The model doesn't have to.",
      "Everyone had the read on {match}. {name} decided to be different. Different finished {score}. Should've listened.",
      "{name} defied the odds on {match} and the odds simply won, {score}. Contrarian for the sake of it is just wrong with extra steps.",
    ],
  },
};

// Small helper the router can use; kept here so the bank stays the single
// source of both content and access.
export function templatesFor(trigger, severity = "cheeky") {
  const t = ROAST_BANK[trigger];
  if (!t) return [];
  return t[severity] || t.cheeky || [];
}
