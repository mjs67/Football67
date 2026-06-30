// src/components/PlayerIdentity.jsx
// Tiny shared presentational bits that were copy-pasted across components.

// Flag/crest cell: a URL renders as a crest <img>, anything else as an emoji
// (defaulting to a ball). Class names are passed in so the same component
// serves both the main scoreboard (crest/flag) and the knockout chooser
// (ko-crest/ko-flag) without baking either set in.
export function Flag({ flag, imgClass = "crest", emojiClass = "flag" }) {
  const isUrl = typeof flag === "string" && flag.startsWith("http");
  return isUrl ? (
    <img className={imgClass} src={flag} alt="" loading="lazy" />
  ) : (
    <span className={emojiClass} aria-hidden="true">
      {flag || "⚽"}
    </span>
  );
}

// Player avatar: photo if present, neutral fallback otherwise. Used by the
// Leaderboard and league standings rows (the identical block they both had).
export function Avatar({ photoURL, imgClass, fallbackClass = "who-fallback" }) {
  return photoURL ? (
    <img className={imgClass || undefined} src={photoURL} alt="" referrerPolicy="no-referrer" />
  ) : (
    <span className={fallbackClass} aria-hidden="true" />
  );
}
