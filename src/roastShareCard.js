// src/roastShareCard.js
// Renders a shareable 1080×1350 PNG of a single v2 feed roast (§7) and shares
// it via the Web Share API (PNG-download fallback). Reuses all brand plumbing
// from ./shareCanvas.js so it can't drift from the picks card.
//
// The roast's targetName is already handle-safe (nickname or Anon-xxxx, never
// a real name — set by roastGeneration.js), so nothing here can leak identity.
import {
  PALETTE as C,
  roundRect,
  drawWordmark,
  drawFooter,
  wrapText,
  truncate,
  shareOrDownload,
} from "./shareCanvas.js";

const W = 1080;
const H = 1350;

const TRIGGER_LABEL = {
  BANKER_HIT: "BANKER HIT", CONFIDENT_WRONG: "CONFIDENT & WRONG",
  EXACT: "EXACT SCORE", MODEL_DEFIER: "MODEL DEFIER", UPSET: "CALLED THE UPSET",
  CONTRARIAN_WRONG: "SHOULD'VE LISTENED", STREAK_N: "ON A STREAK",
  COWARD: "PLAYED IT SAFE",
};

// UTM-tagged share URL so roasts shared to socials are attributable (§7).
export function roastShareUrl(roast) {
  const base = "https://www.football67.com";
  const params = new URLSearchParams({
    utm_source: "share",
    utm_medium: "roast",
    utm_campaign: roast.trigger || "roast",
  });
  return `${base}/?${params.toString()}`;
}

export async function shareRoastCard({ roast }) {
  if (!roast || !roast.text) throw new Error("No roast to share.");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Background + chalk centre-circle motif (matches the picks card).
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.chalk12;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 420, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();

  // Wordmark.
  drawWordmark(ctx, W / 2, 150, { size: 84, offset: 62 });

  // "JUST GOT ROASTED" eyebrow.
  ctx.textAlign = "center";
  ctx.fillStyle = C.volt;
  ctx.font = "700 30px 'Barlow', sans-serif";
  ctx.fillText("🔥 JUST GOT ROASTED", W / 2, 232);

  // Handle (the target).
  ctx.fillStyle = C.chalk;
  ctx.font = "700 72px 'Saira Condensed', 'Arial Narrow', sans-serif";
  ctx.fillText(truncate(ctx, roast.targetName || "Anon", W - 160), W / 2, 320);

  // Trigger badge pill.
  const badge = TRIGGER_LABEL[roast.trigger] || (roast.trigger || "ROASTED");
  ctx.font = "700 26px 'Barlow', sans-serif";
  const bw = ctx.measureText(badge).width + 56;
  ctx.fillStyle = "rgba(200,255,30,0.14)";
  roundRect(ctx, W / 2 - bw / 2, 356, bw, 52, 26);
  ctx.fill();
  ctx.fillStyle = C.volt;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(badge, W / 2, 383);
  ctx.textBaseline = "alphabetic";

  // The roast text — the hero. Big, word-wrapped, centre of the card.
  ctx.fillStyle = C.chalk;
  ctx.textAlign = "center";
  ctx.font = "600 56px 'Saira', sans-serif";
  // wrapText is left-anchored; centre by drawing from the middle with center align.
  wrapTextCentered(ctx, roast.text, W / 2, 520, W - 200, 74, 8);

  // Match + final score strip near the bottom.
  ctx.textAlign = "center";
  ctx.fillStyle = C.chalk60;
  ctx.font = "600 34px 'Saira Condensed', sans-serif";
  const line = [roast.matchName, roast.finalScore].filter(Boolean).join("  ·  ");
  if (line) ctx.fillText(truncate(ctx, line, W - 160), W / 2, H - 210);

  // Footer (brand URL). The UTM link is for the actual share payload below.
  drawFooter(ctx, W / 2, H, { promptSize: 30, urlSize: 40 });

  return shareOrDownload(canvas, "football67-roast.png", {
    title: "Football67",
    text: `${roast.targetName} just got roasted. Call it better — ${roastShareUrl(roast)}`,
  });
}

// wrapText from shareCanvas is left-anchored; this centres each wrapped line.
function wrapTextCentered(ctx, text, cx, y, maxW, lineH, maxLines = 8) {
  const words = String(text).split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  else if (lines.length === maxLines) lines[maxLines - 1] += "…";
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineH));
}
