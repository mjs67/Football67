// Renders a shareable 1080×1350 image of the player's picks on a canvas,
// then shares it via the Web Share API (falls back to a PNG download).
// Canvas plumbing (palette, wordmark, footer, rounded rects, share/download)
// is shared with the roast card via ./shareCanvas.js.
import { pct, scoreP, scorePrediction } from "./poisson.js";
import {
  PALETTE as C,
  roundRect,
  drawWordmark,
  drawFooter,
  truncate,
  shareOrDownload,
} from "./shareCanvas.js";

const W = 1080;
const H = 1350;

export async function sharePickCard({ user, matches, predictions, nickname }) {
  // Up to 7 picks: upcoming first (the "receipts"), then most recent results
  const withPicks = matches.filter((m) => predictions[m.id]);
  const upcoming = withPicks
    .filter((m) => m.status !== "finished")
    .sort((a, b) => (a.kickoff?.toMillis?.() || 0) - (b.kickoff?.toMillis?.() || 0));
  const done = withPicks
    .filter((m) => m.status === "finished")
    .sort((a, b) => (b.kickoff?.toMillis?.() || 0) - (a.kickoff?.toMillis?.() || 0));
  const rows = [...upcoming, ...done].slice(0, 7);
  if (rows.length === 0) throw new Error("Make some picks first!");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Background + chalk centre-circle motif
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.chalk12;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(W / 2, 240, 320, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();

  // Wordmark
  drawWordmark(ctx, W / 2, 150, { size: 84, offset: 62 });

  ctx.textAlign = "center";
  ctx.fillStyle = C.chalk60;
  ctx.font = "500 30px 'Barlow', sans-serif";
  ctx.fillText(`${nickname || user.displayName || "My"} picks — calling it before the whistle`, W / 2, 210);

  // Pick rows
  const top = 290;
  const rowH = 128;
  const pad = 70;
  ctx.textBaseline = "middle";

  rows.forEach((m, i) => {
    const y = top + i * rowH;
    const p = predictions[m.id];

    // Row panel
    ctx.fillStyle = C.pitch;
    ctx.strokeStyle = C.chalk12;
    ctx.lineWidth = 2;
    roundRect(ctx, pad, y, W - pad * 2, rowH - 18, 14);
    ctx.fill();
    ctx.stroke();

    const cy = y + (rowH - 18) / 2;

    // Teams
    ctx.fillStyle = C.chalk;
    ctx.font = "600 34px 'Saira Condensed', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(truncate(ctx, m.home, 290), W / 2 - 130, cy);
    ctx.textAlign = "left";
    ctx.fillText(truncate(ctx, m.away, 290), W / 2 + 130, cy);

    // Scoreboard well + volt digits
    ctx.fillStyle = C.deep;
    roundRect(ctx, W / 2 - 110, cy - 38, 220, 76, 10);
    ctx.fill();
    ctx.fillStyle = C.volt;
    ctx.font = "700 52px 'Saira', sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(200,255,30,0.4)";
    ctx.shadowBlur = 18;
    ctx.fillText(`${p.home} – ${p.away}`, W / 2, cy + 2);
    ctx.shadowBlur = 0;

    // Verdict / kickoff tag
    ctx.font = "600 22px 'Barlow', sans-serif";
    ctx.textAlign = "right";
    if (m.status === "finished") {
      // Same scorer as the rest of the app (knockout-aware booleans).
      const s = scorePrediction(p, m);
      const exact = !!s?.exact;
      const result = !!s?.result;
      ctx.fillStyle = exact ? C.volt : result ? C.chalk60 : C.chalk25;
      ctx.fillText(
        exact ? "EXACT +5" : result ? "RESULT +3" : `FT ${m.homeScore}–${m.awayScore}`,
        W - pad - 18,
        cy
      );
    } else {
      ctx.fillStyle = C.chalk25;
      const ko = m.kickoff?.toDate?.();
      const when = ko
        ? ko.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : "";
      const bold = m.odds ? `${pct(scoreP(m.odds.lh, m.odds.la, p.home, p.away))}% CALL · ` : "";
      ctx.fillText(bold + when, W - pad - 18, cy);
    }
  });

  // Footer
  drawFooter(ctx, W / 2, H, { promptSize: 30, urlSize: 40 });

  await shareOrDownload(canvas, "football67-picks.png", {
    title: "My Football67 picks",
    text: "Calling it before the whistle — beat me at www.football67.com",
  });
}
