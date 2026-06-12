// Renders a shareable 1080×1350 image of the player's picks on a canvas,
// then shares it via the Web Share API (falls back to a PNG download).
const W = 1080;
const H = 1350;

const C = {
  night: "#0a0a0c",
  pitch: "#16161c",
  deep: "#0e0e12",
  chalk: "#f4f4f0",
  chalk60: "rgba(244,244,240,0.6)",
  chalk25: "rgba(244,244,240,0.25)",
  chalk12: "rgba(244,244,240,0.12)",
  volt: "#c8ff1e",
};

export async function sharePickCard({ user, matches, predictions }) {
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
  ctx.textAlign = "center";
  ctx.fillStyle = C.chalk;
  ctx.font = "700 84px 'Saira Condensed', 'Arial Narrow', sans-serif";
  const brand = "FOOTBALL67";
  ctx.fillText("FOOTBALL", W / 2 - 62, 150);
  ctx.fillStyle = C.volt;
  ctx.font = "700 84px 'Saira', sans-serif";
  const fw = ctx.measureText("FOOTBALL").width;
  ctx.textAlign = "left";
  ctx.fillText("67", W / 2 - 62 + fw / 2 + 10, 150);
  ctx.textAlign = "center";

  ctx.fillStyle = C.chalk60;
  ctx.font = "500 30px 'Barlow', sans-serif";
  ctx.fillText(`${user.displayName || "My"} picks — calling it before the whistle`, W / 2, 210);

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
    ctx.fillText(trunc(ctx, m.home, 290), W / 2 - 130, cy);
    ctx.textAlign = "left";
    ctx.fillText(trunc(ctx, m.away, 290), W / 2 + 130, cy);

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
      const exact = p.home === m.homeScore && p.away === m.awayScore;
      const result =
        Math.sign(p.home - p.away) === Math.sign(m.homeScore - m.awayScore);
      ctx.fillStyle = exact ? C.volt : result ? C.chalk60 : C.chalk25;
      ctx.fillText(
        exact ? "EXACT +5" : result ? "RESULT +3" : `FT ${m.homeScore}–${m.awayScore}`,
        W - pad - 18,
        cy
      );
    } else {
      ctx.fillStyle = C.chalk25;
      const ko = m.kickoff?.toDate?.();
      ctx.fillText(
        ko ? ko.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
        W - pad - 18,
        cy
      );
    }
  });

  // Footer
  ctx.textAlign = "center";
  ctx.fillStyle = C.chalk60;
  ctx.font = "600 30px 'Barlow', sans-serif";
  ctx.fillText("Think you can call it better?", W / 2, H - 110);
  ctx.fillStyle = C.volt;
  ctx.font = "700 40px 'Saira Condensed', sans-serif";
  ctx.fillText("WWW.FOOTBALL67.COM", W / 2, H - 58);

  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  const file = new File([blob], "football67-picks.png", { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "My Football67 picks",
        text: "Calling it before the whistle — beat me at www.football67.com",
      });
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // user closed the share sheet
    }
  }
  // Fallback: download the PNG
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "football67-picks.png";
  a.click();
  URL.revokeObjectURL(a.href);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function trunc(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 2 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}
