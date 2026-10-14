// Per-axis Kalman filters for the ball tracker. Time is in REFERENCE frames (30 fps units), so a 15 fps stream is just a stream with gaps.
// Order 2 = [position, velocity]; order 3 = [position, velocity, acceleration]. The acceleration is a fitted image-space parameter:
// it is NOT assumed to be physical gravity.

/** Transition F(dt) as a flat row-major n*n array. */
function F(order, dt) {
  return order === 2 ? [1, dt, 0, 1] : [1, dt, 0.5 * dt * dt, 0, 1, dt, 0, 0, 1];
}
/** Process noise for white noise on the highest-order derivative, density q. */
function Q(order, dt, q) {
  const d2 = dt * dt, d3 = d2 * dt, d4 = d3 * dt, d5 = d4 * dt;
  return order === 2 ? [q * d3 / 3, q * d2 / 2, q * d2 / 2, q * dt] : [q * d5 / 20, q * d4 / 8, q * d3 / 6, q * d4 / 8, q * d3 / 3, q * d2 / 2, q * d3 / 6, q * d2 / 2, q * dt];
}
const mul = (A, B, n) => { const C = new Array(n * n).fill(0); for (let i = 0; i < n; i += 1) for (let k = 0; k < n; k += 1) { const a = A[i * n + k]; if (a !== 0) for (let j = 0; j < n; j += 1) C[i * n + j] += a * B[k * n + j]; } return C; };
const tr = (A, n) => { const T = new Array(n * n); for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) T[j * n + i] = A[i * n + j]; return T; };

/**
 * One axis. `q` is the noise density for the highest order, `R` the measurement variance (px^2). Observed positions are never altered:
 * the filter holds an ESTIMATE; callers keep observations themselves.
 */
export function createAxis(order, q, R, init = { sigmaV: 15, sigmaA: 2 }) {
  const n = order;
  let x = new Array(n).fill(0), P = new Array(n * n).fill(0), t = null;
  const predictState = (dt) => {
    const f = F(n, dt), xp = new Array(n).fill(0);
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) xp[i] += f[i * n + j] * x[j];
    const Pp = mul(mul(f, P, n), tr(f, n), n), qm = Q(n, dt, q);
    for (let i = 0; i < n * n; i += 1) Pp[i] += qm[i];
    return { x: xp, P: Pp };
  };
  return {
    order: n,
    started: () => t !== null,
    init(z, f) { x = new Array(n).fill(0); x[0] = z; P = new Array(n * n).fill(0); P[0] = R; P[n + 1] = init.sigmaV ** 2; if (n === 3) P[8] = init.sigmaA ** 2; t = f; },
    /** Non-mutating prediction at reference frame f: position mean and variance (and velocity). */
    predict(f) { const p = predictState(f - t); return { pos: p.x[0], vel: p.x[1], acc: n === 3 ? p.x[2] : 0, varPos: p.P[0] }; },
    /** Innovation statistics for a measurement z at frame f, before it is applied: { nu, S }. */
    innovation(z, f) { const p = predictState(f - t); return { nu: z - p.x[0], S: p.P[0] + R }; },
    update(z, f) {
      const p = predictState(f - t), S = p.P[0] + R, K = new Array(n);
      for (let i = 0; i < n; i += 1) K[i] = p.P[i * n] / S;
      const nu = z - p.x[0];
      x = p.x.map((v, i) => v + K[i] * nu);
      // Joseph-free but symmetric: P = (I - K H) P
      const Pn = p.P.slice();
      for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) Pn[i * n + j] = p.P[i * n + j] - K[i] * p.P[j];
      P = Pn; t = f;
      return { nu, S };
    },
    state: () => ({ pos: x[0], vel: x[1], acc: n === 3 ? x[2] : 0, varPos: P[0], f: t }),
  };
}
