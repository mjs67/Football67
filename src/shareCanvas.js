// src/shareCanvas.js
// Shared canvas plumbing for the two PNG share cards (shareCard.js's picks
// card and MatchRoast.jsx's roast card). Both independently carried the same
// palette, roundRect, FOOTBALL/67 wordmark, footer, text-wrapping and
// share-or-download fallback. Centralised here so the brand styling lives in
// one place and the two cards can't drift apart.

export const PALETTE = {
  night:   "#0a0a0c",
  pitch:   "#16161c",
  deep:    "#0e0e12",
  chalk:   "#f4f4f0",
  chalk60: "rgba(244,244,240,0.6)",
  chalk25: "rgba(244,244,240,0.25)",
  chalk12: "rgba(244,244,240,0.12)",
  volt:    "#c8ff1e",
};

// Rounded-rect path (caller fills/strokes).
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// "FOOTBALL" (chalk) + "67" (volt), centred on `cx` at baseline `y`.
// `size` is the font px; `offset` nudges the block left so the whole wordmark
// reads centred (the two cards used slightly different nudges — keep theirs).
export function drawWordmark(ctx, cx, y, { size = 84, offset = 62 } = {}) {
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "center";
  ctx.fillStyle = PALETTE.chalk;
  ctx.font = `700 ${size}px 'Saira Condensed', 'Arial Narrow', sans-serif`;
  ctx.fillText("FOOTBALL", cx - offset, y);
  const fw = ctx.measureText("FOOTBALL").width;
  ctx.fillStyle = PALETTE.volt;
  ctx.font = `700 ${size}px 'Saira', sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("67", cx - offset + fw / 2 + (size >= 80 ? 10 : 8), y);
  ctx.textAlign = prevAlign;
}

// Shared "Think you can call it better? / WWW.FOOTBALL67.COM" footer.
export function drawFooter(ctx, cx, height, { promptSize = 30, urlSize = 40 } = {}) {
  ctx.textAlign = "center";
  ctx.fillStyle = PALETTE.chalk60;
  ctx.font = `${promptSize >= 30 ? 600 : 500} ${promptSize}px 'Barlow', sans-serif`;
  ctx.fillText("Think you can call it better?", cx, height - (urlSize >= 40 ? 110 : 90));
  ctx.fillStyle = PALETTE.volt;
  ctx.font = `700 ${urlSize}px 'Saira Condensed', sans-serif`;
  ctx.fillText("WWW.FOOTBALL67.COM", cx, height - (urlSize >= 40 ? 58 : 48));
}

// Word-wrap `text` at `maxW`, capping at `maxLines` (last line gets an ellipsis).
export function wrapText(ctx, text, x, y, maxW, lineH, maxLines = 6) {
  const words = String(text).split(" ");
  let line = "";
  let cy = y;
  let lines = 1;
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineH;
      if (++lines > maxLines) { ctx.fillText(line + "…", x, cy); return; }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

// Truncate `text` with an ellipsis to fit `maxW` at the current font.
export function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 2 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

// Web Share API with a PNG-download fallback. Returns the blob in case the
// caller wants it. `shareData` is passed through to navigator.share (minus
// files, which we attach). Swallows the user-cancelled (AbortError) case.
export async function shareOrDownload(canvas, filename, shareData = {}) {
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  const file = new File([blob], filename, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ ...shareData, files: [file] });
      return blob;
    } catch (e) {
      if (e.name === "AbortError") return blob; // user closed the share sheet
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  return blob;
}
