// src/components/MatchRoast.jsx
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

// Draws a roast share card on a canvas and shares/downloads it
async function shareRoastCard({ roast, matchLabel, score, picks }) {
  const W = 1080, H = 1080;
  const C = {
    night:    "#0a0a0c",
    pitch:    "#16161c",
    deep:     "#0e0e12",
    chalk:    "#f4f4f0",
    chalk60:  "rgba(244,244,240,0.6)",
    chalk25:  "rgba(244,244,240,0.25)",
    chalk12:  "rgba(244,244,240,0.12)",
    volt:     "#c8ff1e",
  };

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);

  // Subtle pitch lines
  ctx.strokeStyle = C.chalk12;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 260, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();

  // Wordmark
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = C.chalk;
  ctx.font = "700 72px 'Saira Condensed', 'Arial Narrow', sans-serif";
  ctx.fillText("FOOTBALL", W / 2 - 52, 80);
  const fw = ctx.measureText("FOOTBALL").width;
  ctx.fillStyle = C.volt;
  ctx.font = "700 72px 'Saira', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("67", W / 2 - 52 + fw / 2 + 8, 80);
  ctx.textAlign = "center";

  // Match label + score
  ctx.fillStyle = C.chalk60;
  ctx.font = "500 30px 'Barlow', sans-serif";
  ctx.fillText(matchLabel, W / 2, 148);
  ctx.fillStyle = C.volt;
  ctx.font = "700 80px 'Saira', sans-serif";
  ctx.shadowColor = "rgba(200,255,30,0.35)";
  ctx.shadowBlur = 20;
  ctx.fillText(score, W / 2, 238);
  ctx.shadowBlur = 0;

  // Fire emoji + roast box
  const boxX = 60, boxY = 290, boxW = W - 120, boxH = 300;
  ctx.fillStyle = C.pitch;
  ctx.strokeStyle = C.chalk12;
  ctx.lineWidth = 2;
  roundRect(ctx, boxX, boxY, boxW, boxH, 16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = C.volt;
  ctx.font = "500 28px 'Barlow', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("🔥", boxX + 24, boxY + 46);
  ctx.fillStyle = C.chalk60;
  ctx.font = "400 28px 'Barlow', sans-serif";
  wrapText(ctx, roast, boxX + 24, boxY + 86, boxW - 48, 40);

  // Picks chips
  if (picks && picks.length > 0) {
    const chipY = 630;
    ctx.fillStyle = C.chalk60;
    ctx.font = "500 24px 'Barlow', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Who called what", W / 2, chipY);

    const chipW = 180, chipH = 68, gap = 16;
    const total = picks.length;
    const cols = Math.min(total, 4);
    const startX = W / 2 - (cols * (chipW + gap) - gap) / 2;

    picks.slice(0, 8).forEach((p, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (chipW + gap);
      const cy = chipY + 30 + row * (chipH + 10);

      ctx.fillStyle = p.pts === 5 ? "rgba(200,255,30,0.15)"
                    : p.pts === 3 ? "rgba(244,244,240,0.08)"
                    : "rgba(244,244,240,0.04)";
      ctx.strokeStyle = p.pts === 5 ? C.volt
                      : p.pts === 3 ? C.chalk25
                      : "rgba(244,244,240,0.1)";
      ctx.lineWidth = p.pts === 5 ? 1.5 : 1;
      roundRect(ctx, cx, cy, chipW, chipH, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = p.pts === 5 ? C.volt : C.chalk60;
      ctx.font = "600 22px 'Barlow', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.name, cx + chipW / 2, cy + 22);
      ctx.fillStyle = C.chalk;
      ctx.font = "700 24px 'Saira', sans-serif";
      ctx.fillText(p.prediction, cx + chipW / 2, cy + 50);
    });
  }

  // Footer
  ctx.textAlign = "center";
  ctx.fillStyle = C.chalk60;
  ctx.font = "500 26px 'Barlow', sans-serif";
  ctx.fillText("Think you can call it better?", W / 2, H - 90);
  ctx.fillStyle = C.volt;
  ctx.font = "700 36px 'Saira Condensed', sans-serif";
  ctx.fillText("WWW.FOOTBALL67.COM", W / 2, H - 48);

  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  const file = new File([blob], "football67-roast.png", { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Football67 Roast", text: roast + "\n\nwww.football67.com" });
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "football67-roast.png";
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

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineH;
      if (cy > y + lineH * 5) { ctx.fillText(line + "…", x, cy); return; }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

export default function MatchRoast({ leagueId, matchId, matchStatus, matchLabel, score, picks }) {
  const [roast, setRoast] = useState(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (matchStatus !== "finished" || !leagueId || !matchId) return;
    let cancelled = false;
    async function load() {
      try {
        const ref = doc(db, "groups", leagueId, "matchRoasts", matchId);
        const snap = await getDoc(ref);
        if (!cancelled && snap.exists()) setRoast(snap.data().roastText);
      } catch (e) {
        console.error("MatchRoast error:", e.message);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [leagueId, matchId, matchStatus]);

  if (!roast) return null;

  async function handleShare() {
    setSharing(true);
    try {
      await shareRoastCard({ roast, matchLabel, score, picks });
    } catch (e) {
      alert("Could not share: " + e.message);
    } finally {
      setSharing(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        padding: "8px 14px 10px",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(0,0,0,0.15)",
      }}
    >
      <span style={{ fontSize: "14px", marginTop: "2px", flexShrink: 0 }}>🔥</span>
      <p
        style={{
          fontSize: "12px",
          lineHeight: "1.6",
          color: "rgba(255,255,255,0.5)",
          margin: 0,
          flex: 1,
        }}
      >
        {roast}
      </p>
      <button
        onClick={handleShare}
        disabled={sharing}
        title="Share this roast"
        style={{
          flexShrink: 0,
          background: "none",
          border: "1px solid rgba(200,255,30,0.3)",
          borderRadius: "6px",
          color: "#c8ff1e",
          fontSize: "11px",
          fontWeight: 600,
          padding: "3px 8px",
          cursor: sharing ? "wait" : "pointer",
          opacity: sharing ? 0.5 : 1,
          lineHeight: "1.4",
          letterSpacing: "0.03em",
        }}
      >
        {sharing ? "…" : "Share"}
      </button>
    </div>
  );
}
