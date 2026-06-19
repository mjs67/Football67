# Football67 — Match Predictor (www.football67.com)

A FIFA-style match predictor: sign in with Google, lock in a scoreline for every fixture before kickoff, and climb the leaderboard — with **live results pulled automatically from a real football API**, a knockout bracket, private leagues, shareable pick cards, auto-pick protection, and a tiebreaker.

**Stack:** React + Vite · Firebase Auth (Google) · Firestore · Firebase Hosting or Vercel · football-data.org · GitHub Actions automation · your own domain.

**Scoring:** exact score = 5 pts · correct result = 3 pts · leaderboard ties broken by tiebreaker guess.

---

## Features

- **Google Sign-In** (Firebase Auth) with persistent sessions
- **Live fixtures & auto-scoring** from football-data.org — Premier League, World Cup, Champions League, Euros, La Liga, Bundesliga, Serie A — with real team crests; results sync and the leaderboard recomputes every 30 minutes, no human needed
- **Predictions** with scoreboard-style steppers, live kickoff countdowns, and a hard server-side deadline at kickoff
- **My Picks** page: points/exact/results stats, full prediction history with earned points per match
- **Leagues**: create a private league, share a 6-character invite code, friends join instantly; per-league standings with captain badge, copy-code and leave buttons (50 players max)
- **Profile**: nickname editor lives at the top of the page next to Sign in / Sign out (click your avatar) — sets the name shown on leaderboards and leagues
- **Tiebreaker question** (e.g. "Total goals in the tournament?"): players submit a number, leaderboard ties are broken by closest guess once you publish the answer
- **Knockout bracket predictor**: pick winners through the whole tree (4/8/16 teams) before the round-of-16 kicks off; escalating points per round (e.g. 2/4/6/10) land automatically as real winners are recorded, folded into the main leaderboard
- **Win & exact-score odds on every card**: a built-in Poisson expected-goals model (attack/defence strength vs competition average, shrunk toward neutral early on) shows win/draw/win percentages, the most likely scoreline, and the live probability of *your* scoreline as you adjust it — plus a "% CALL" boldness tag on share cards. No betting API, no cost; it recomputes every sync and sharpens as results come in
- **Pre-match stats on every card**: last-5 form pips (W/D/L) for both teams plus season head-to-head, computed automatically from the same API sync — no extra API calls
- **Shareable pick cards**: one tap renders a branded 1080×1350 image of your picks (with verdicts on settled ones) and opens the native share sheet — or downloads the PNG on desktop
- **Form graph & accuracy profile**: cumulative points sparkline (amber dots = exact scores) plus your hit-rate across all settled picks
- **Auto-pick safety net**: ON by default for every new player (toggle stays in My Picks if someone wants to turn it off); if you forget a match, a default 1–1 is lodged for you just before kickoff (tagged "auto-pick" in your history)
- **Tamper-proof leaderboard**: Firestore rules block clients from ever writing points
- **Match roasts**: savage, brutal 2-sentence roasts targeting the top scorer from each finished match, generated automatically and displayed below locked-in picks in the Leagues section — with 50+ rotating templates so roasts never repeat, using player nicknames

## 1. Create the Firebase project (~5 min)

1. https://console.firebase.google.com → **Add project**.
2. **Authentication** → Sign-in method → enable **Google**.
3. **Firestore Database** → Create database → Production mode.
4. **Project settings → General → Your apps** → Web app → copy the `firebaseConfig` into `src/firebase.js`.

## 2. Run locally

```bash
npm install
npm run dev          # http://localhost:5173
```

## 3. Deploy rules + indexes

```bash
npm install -g firebase-tools
firebase login
# put your project id in .firebaserc, then:
firebase deploy --only firestore
```

Download a service-account key (**Project settings → Service accounts → Generate new private key**) and save it as `serviceAccount.json` in the project root (gitignored). You'll use it for all admin scripts and as a GitHub secret.

## 4. Live fixtures & automatic scoring

1. Get a **free API key**: https://www.football-data.org/client/register
2. Pick a competition code: `PL` Premier League · `WC` World Cup · `CL` Champions League · `EC` Euros · `PD` La Liga · `BL1` Bundesliga · `SA` Serie A
3. First import (for the 2026 World Cup use `COMPETITION=WC` — the 45-day window and neutral-venue model are applied automatically):

```bash
FOOTBALL_DATA_TOKEN=your_key COMPETITION=PL npm run sync
```

This imports the next 14 days of fixtures (with crests), records any final scores, and recomputes everyone's points.

**To make it fully automatic**, push the repo to GitHub — `.github/workflows/automation.yml` is included and runs the sync **every 30 minutes** for free. Add these repo secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | full JSON of serviceAccount.json |
| `FOOTBALL_DATA_TOKEN` | your football-data.org key |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | any SMTP provider (see below) |
| `APP_URL` | your site URL (used in reminder emails) |

And a repo **variable** `COMPETITION` (e.g. `PL`). You can also trigger a run manually from the Actions tab.

Prefer made-up fixtures instead of a real competition? `npm run seed` still works, and `npm run settle` lets you enter scores by hand.

## 5. Email reminders (legacy / manual only)

The "Email reminders" toggle has been removed from **My Picks** — there's no longer a way for players to opt in from the UI. Worth knowing: `automation.yml` only runs `syncMatches.js` on its schedule, so `scripts/sendReminders.js` isn't actually being triggered automatically right now even for the field's old name — if you want reminder emails again in the future, you'd need to both re-add a UI toggle and add a step/schedule for `npm run remind` to the workflow. Any SMTP service works if you do:

- **Gmail**: host `smtp.gmail.com`, port `587`, user = your address, pass = an App Password (https://myaccount.google.com/apppasswords)
- **Brevo / Resend / Mailgun** free tiers all provide SMTP credentials

## 6. Match roasts

Roasts are generated automatically every time the sync job finishes — one roast per finished match, targeting the top scorer. No extra configuration needed; they appear in the Leagues section below locked-in picks once matches are finished.

**To customize roasts**, edit the templates array in `scripts/roastTemplates.js`. Each template can use these variables: `{name}` (player nickname), `{pts}` (points earned), `{match}` (match name), `{score}` (final score), `{leaguePos}` (league position), `{totalPts}` (total league points). Add as many roasts as you like — they rotate by match ID so they never repeat:

```js
export const roastTemplates = [
  // ... existing roasts ...
  "New roast targeting {name} for {pts} points on {match}...",
];
```

Then push to GitHub and re-run the workflow to regenerate roasts for old matches.

## 7. Knockout bracket

Create the bracket once the knockout teams are known (4, 8 or 16 teams, listed in bracket order — pair 1 plays 2, 3 plays 4, …):

```bash
node scripts/bracket.js create --deadline 2026-06-28T16:00:00Z \
  "France,Argentina,Brazil,England,Spain,Germany,Portugal,Netherlands"
```

Players fill their tree on the **Bracket** tab until the deadline. As real winners are confirmed, record them and points flow into the leaderboard automatically:

```bash
node scripts/bracket.js result r0-2 "Spain"     # match ids shown by `status`
node scripts/bracket.js status
```

Per-round points: 32 teams (World Cup round of 32) → 1/2/4/6/10 · 16 → 2/4/6/10 · 8 → 3/6/10 · 4 → 4/10.

## 7. Tiebreaker

```bash
node scripts/tiebreaker.js set "Total goals scored across all fixtures?"
# ...at the end of the competition:
node scripts/tiebreaker.js answer 87
```

While the question is open, players answer it on **My Picks**. Publishing the answer locks submissions and re-ranks the leaderboard (ties broken by closest guess).

## 8A. Host on Firebase Hosting

```bash
npm run build
firebase deploy --only hosting     # live at https://YOUR_PROJECT.web.app
```

## 8B. …or host on Vercel

Import the GitHub repo at vercel.com (Vite auto-detected; `vercel.json` included). Then add your Vercel URL in **Firebase → Authentication → Settings → Authorized domains** or Google sign-in will be blocked there.

## 9. Custom domain — www.football67.com

Buy **football67.com** at Namecheap, GoDaddy or Porkbun, then:

**Firebase Hosting:** Console → Hosting → **Add custom domain** → add the DNS records it gives you at your registrar (Namecheap: Advanced DNS · GoDaddy: Manage DNS · Porkbun: DNS Records).

**Vercel:** Project → Settings → **Domains** → point an `A` record to `76.76.21.21` (apex) or `CNAME` to `cname.vercel-dns.com` (www).

SSL is automatic on both. Finally, add `football67.com` and `www.football67.com` to **Firebase → Authentication → Authorized domains**, and set the `APP_URL` GitHub secret to `https://www.football67.com` so reminder emails link there.

## Data model

```
matches/{id}            home, away, homeFlag/awayFlag (emoji or crest URL),
                        competition, kickoff, status, live, homeScore, awayScore,
                        homeForm, awayForm, h2h, externalId, source
predictions/{uid_matchId}  uid, matchId, home, away, displayName, photoURL
users/{uid}             displayName, photoURL, email, remindersOn, autoPickOn,
                        points, exact, results, bracketPoints, tbDistance ← script-only
brackets/{uid}          picks {matchId: team}   (locked at bracket deadline)
groups/{id}             name, code (6-char invite), ownerUid, members[]
  matchRoasts/{matchId}   roastText, targetName, targetUid, matchName, finalScore ← script-only
settings/bracket        teams[], rounds, points[], deadline, results{}
settings/tiebreaker     question, answer
tiebreakers/{uid}       uid, value
reminders/{uid_matchId} sentAt          ← script-only dedupe ledger
```

Rules enforce: matches/settings read-only; predictions owner-only, sane scores, pre-kickoff only; profile fields are the only user-writable fields on `users`; league members can add/remove **only themselves** while owners manage their league; tiebreaker guesses lock when the answer is published.

## npm scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` | local dev / production build |
| `npm run sync` | pull fixtures + results from the API, auto-settle, recompute points |
| `npm run remind` | send reminder emails now |
| `npm run bracket` | create the knockout bracket, record real winners |
| `npm run tiebreaker` | set/answer/clear the tiebreaker |
| `npm run seed` | add manual sample fixtures |
| `npm run settle` | manually enter scores (fallback when not using the API) |
