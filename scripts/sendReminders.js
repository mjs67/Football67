// Emails opted-in players who haven't predicted matches kicking off in the
// next 24h. One digest per player per run; each match is only ever reminded
// once (tracked in the `reminders` collection). Run hourly via GitHub Actions.
//
// Env vars (use any SMTP provider — Gmail app password, Resend, Brevo, etc.):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
//   APP_URL   e.g. https://yourdomain.com
import { readFileSync, existsSync } from "node:fs";
import admin from "firebase-admin";
import nodemailer from "nodemailer";

if (existsSync("./serviceAccount.json")) {
  const sa = JSON.parse(readFileSync("./serviceAccount.json", "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
} else {
  admin.initializeApp();
}
const db = admin.firestore();

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, APP_URL } = process.env;
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error("Missing SMTP_HOST / SMTP_USER / SMTP_PASS env vars.");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT || 587),
  secure: Number(SMTP_PORT) === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

const now = admin.firestore.Timestamp.now();
const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() + 24 * 3600 * 1000);

// Matches kicking off in the next 24h
const matchSnap = await db
  .collection("matches")
  .where("status", "==", "upcoming")
  .where("kickoff", ">", now)
  .where("kickoff", "<", cutoff)
  .get();
const soon = matchSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
if (soon.length === 0) {
  console.log("No matches in the next 24h. Nothing to send.");
  process.exit(0);
}

// Players who opted in
const userSnap = await db.collection("users").where("remindersOn", "==", true).get();
let sent = 0;

for (const u of userSnap.docs) {
  const { email, displayName } = u.data();
  if (!email) continue;

  // Which of these matches has this player not predicted & not been reminded of?
  const pending = [];
  for (const m of soon) {
    const [pred, reminded] = await Promise.all([
      db.doc(`predictions/${u.id}_${m.id}`).get(),
      db.doc(`reminders/${u.id}_${m.id}`).get(),
    ]);
    if (!pred.exists && !reminded.exists) pending.push(m);
  }
  if (pending.length === 0) continue;

  const lines = pending
    .map((m) => {
      const ko = m.kickoff.toDate().toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: "UTC",
      });
      return `  •  ${m.home} vs ${m.away} — kicks off ${ko} UTC`;
    })
    .join("\n");

  try {
    await transporter.sendMail({
      from: MAIL_FROM || SMTP_USER,
      to: email,
      subject: `⏱ ${pending.length} match${pending.length > 1 ? "es" : ""} closing soon — lock in your predictions`,
      text:
        `Hi ${displayName || "there"},\n\n` +
        `You haven't called the score yet for:\n\n${lines}\n\n` +
        `Predictions lock at kickoff. Make your picks here:\n${APP_URL || ""}\n\n` +
        `— Football67 (www.football67.com)\n(Turn reminders off any time on your My Picks page.)`,
    });
    sent++;
    const batch = db.batch();
    for (const m of pending) {
      batch.set(db.doc(`reminders/${u.id}_${m.id}`), {
        uid: u.id,
        matchId: m.id,
        sentAt: now,
      });
    }
    await batch.commit();
  } catch (e) {
    console.error(`Failed to email ${email}: ${e.message}`);
  }
}

console.log(`Sent ${sent} reminder emails covering ${soon.length} upcoming matches.`);
process.exit(0);
