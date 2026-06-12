// Poisson scoreline model — shared client-side math.
// The sync job stores expected goals (lh, la) on each match; everything
// else (win/draw/win %, most likely score, probability of any scoreline)
// is derived here from those two numbers.
const MAX_GOALS = 8;

export function poissonP(k, lambda) {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact;
}

export function scoreP(lh, la, h, a) {
  return poissonP(h, lh) * poissonP(a, la);
}

export function matchProbs(lh, la) {
  let ph = 0, pd = 0, pa = 0;
  let top = { h: 0, a: 0, p: 0 };
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = scoreP(lh, la, h, a);
      if (h > a) ph += p;
      else if (h === a) pd += p;
      else pa += p;
      if (p > top.p) top = { h, a, p };
    }
  }
  return { ph, pd, pa, top };
}

export function pct(p) {
  const n = p * 100;
  if (n > 0 && n < 1) return "<1";
  return String(Math.round(n));
}
