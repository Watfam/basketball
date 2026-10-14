// Small, seeded statistics for the evaluation harness. No dependencies.

/** Seeded PRNG (mulberry32): the same seed gives the same stream on every machine. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle of a copy. */
export function shuffled(items, seed) {
  const r = rng(seed);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A seeded sample of n items without replacement. */
export function sample(items, n, seed) {
  return shuffled(items, seed).slice(0, Math.min(n, items.length));
}

/** Wilson score interval for k successes in n trials (z = 1.96 gives 95%). Returns null when n is 0. */
export function wilson(k, n, z = 1.96) {
  if (n <= 0) return null;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h), k, n };
}

/** Linear-interpolated quantile, q in [0, 1]. */
export function quantile(values, q) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Bootstrap percentile interval for any statistic of a list. */
export function bootstrapCI(values, stat, { resamples = 2000, seed = 1, alpha = 0.05 } = {}) {
  if (values.length < 2) return null;
  const r = rng(seed);
  const out = [];
  for (let b = 0; b < resamples; b += 1) {
    const s = new Array(values.length);
    for (let i = 0; i < values.length; i += 1) s[i] = values[Math.floor(r() * values.length)];
    out.push(stat(s));
  }
  return { lo: quantile(out, alpha / 2), hi: quantile(out, 1 - alpha / 2) };
}

/**
 * Cluster bootstrap: resample whole groups (flights) with replacement, not individual points, because points inside one flight
 * overlap and are strongly correlated. Honest intervals for tracking cells, where one flight yields many overlapping windows.
 */
export function clusterBootstrapCI(values, groups, stat, { resamples = 500, seed = 1, alpha = 0.05 } = {}) {
  const byGroup = new Map();
  values.forEach((v, i) => (byGroup.get(groups[i]) ?? byGroup.set(groups[i], []).get(groups[i])).push(v));
  const keys = [...byGroup.keys()];
  if (keys.length < 5) return null;
  const r = rng(seed);
  const out = [];
  for (let b = 0; b < resamples; b += 1) {
    const s = [];
    for (let i = 0; i < keys.length; i += 1) { const g = byGroup.get(keys[Math.floor(r() * keys.length)]); for (let j = 0; j < g.length; j += 1) s.push(g[j]); }
    out.push(stat(s));
  }
  return { lo: quantile(out, alpha / 2), hi: quantile(out, 1 - alpha / 2), groups: keys.length, resamples };
}

/**
 * Distribution summary of non-negative errors. The tail matters as much as the middle,
 * so the worst few are always returned with the labels passed in.
 */
export function describe(values, { labels = null, groups = null, seed = 1, resamples = 2000, worst = 5 } = {}) {
  const n = values.length;
  if (!n) return { n: 0 };
  const median = quantile(values, 0.5);
  const order = values.map((v, i) => i).sort((a, b) => values[b] - values[a]);
  return {
    n,
    mean: values.reduce((a, b) => a + b, 0) / n,
    rmse: Math.sqrt(values.reduce((a, b) => a + b * b, 0) / n),
    median,
    // with groups the points are not independent: the interval resamples whole groups and says how many there were
    median_ci95: groups ? clusterBootstrapCI(values, groups, (s) => quantile(s, 0.5), { seed }) : bootstrapCI(values, (s) => quantile(s, 0.5), { seed, resamples }),
    ci_method: groups ? "cluster bootstrap by flight (points inside one flight are correlated)" : "plain bootstrap (assumes independent samples)",
    n_groups: groups ? new Set(groups).size : null,
    p90: quantile(values, 0.9),
    p95: quantile(values, 0.95),
    max: Math.max(...values),
    worst: order.slice(0, worst).map((i) => ({ value: values[i], ...(labels ? { at: labels[i] } : {}) })),
  };
}

/** Exact two-sided McNemar p-value from the discordant counts: b = candidate right and baseline wrong, c = the reverse. */
export function mcnemarExact(b, c) {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  let logC = 0; // running log of C(n, i)
  let p = 0;
  for (let i = 0; i <= k; i += 1) {
    if (i > 0) logC += Math.log(n - i + 1) - Math.log(i);
    p += Math.exp(logC - n * Math.LN2);
  }
  return Math.min(1, 2 * p);
}
