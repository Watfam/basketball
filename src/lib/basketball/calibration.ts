/**
 * Scoring the camera against what really happened.
 *
 * The coach shoots a set with the camera counting, writes down the real
 * result of every shot in order, and this works out how often the camera
 * was right. It is the same matching the offline exams used
 * (training/tools/38-align-score.py and 40-score-rules.py):
 *
 * - Same number of shots on both lists: matched one to one, in order.
 *   Nothing about the camera's answers affects the pairing, so the score
 *   is honest.
 * - Different numbers: the camera saw something that was not a shot, or
 *   missed a shot completely. The lists are lined up by dynamic
 *   programming, choosing the pairing that agrees best. That flatters the
 *   camera a little, so the result says it was used.
 *
 * Pure functions, so the tests run the real python alignment beside it.
 */

export type Outcome = "make" | "miss";

export type CalibrationShot =
  | { kind: "match"; camera: Outcome; truth: Outcome; cameraIndex: number; truthIndex: number }
  /** The camera counted something that was not on the written list. */
  | { kind: "extra"; camera: Outcome; cameraIndex: number }
  /** A written shot the camera never counted. */
  | { kind: "unseen"; truth: Outcome; truthIndex: number };

export type CalibrationResult = {
  method: "one_to_one" | "aligned";
  /** Written shots. */
  shots: number;
  /** Matched shots where the camera's call was right. */
  agreed: number;
  matched: number;
  extra: number;
  unseen: number;
  cameraMakes: number;
  trueMakes: number;
  perShot: CalibrationShot[];
};

export function align(camera: Outcome[], truth: Outcome[]): CalibrationResult {
  let perShot: CalibrationShot[];
  let method: CalibrationResult["method"];

  if (camera.length === truth.length) {
    method = "one_to_one";
    perShot = camera.map((c, i) => ({ kind: "match", camera: c, truth: truth[i], cameraIndex: i, truthIndex: i }));
  } else {
    method = "aligned";
    // tools/38: skipping a camera call costs 1, an unseen written shot 2,
    // a pairing scores +1 if the calls agree and -1 if not. Ties keep the
    // first option tried, in the tool's order: skip, unseen, match.
    const N = camera.length;
    const M = truth.length;
    const NEG = -1e9;
    const dp = Array.from({ length: N + 1 }, () => new Array<number>(M + 1).fill(NEG));
    const bk: ([number, number, "skip" | "unseen" | "match"] | null)[][] = Array.from({ length: N + 1 }, () =>
      new Array(M + 1).fill(null)
    );
    dp[0][0] = 0;
    for (let i = 0; i <= N; i += 1) {
      for (let j = 0; j <= M; j += 1) {
        const v = dp[i][j];
        if (v === NEG) continue;
        if (i < N && v - 1 > dp[i + 1][j]) {
          dp[i + 1][j] = v - 1;
          bk[i + 1][j] = [i, j, "skip"];
        }
        if (j < M && v - 2 > dp[i][j + 1]) {
          dp[i][j + 1] = v - 2;
          bk[i][j + 1] = [i, j, "unseen"];
        }
        if (i < N && j < M) {
          const c = camera[i] === truth[j] ? 1 : -1;
          if (v + c > dp[i + 1][j + 1]) {
            dp[i + 1][j + 1] = v + c;
            bk[i + 1][j + 1] = [i, j, "match"];
          }
        }
      }
    }
    const path: [number, number, "skip" | "unseen" | "match"][] = [];
    let i = N;
    let j = M;
    while (i !== 0 || j !== 0) {
      const step = bk[i][j] as [number, number, "skip" | "unseen" | "match"];
      path.push(step);
      [i, j] = step;
    }
    path.reverse();
    perShot = path.map(([pi, pj, k]) =>
      k === "match"
        ? { kind: "match", camera: camera[pi], truth: truth[pj], cameraIndex: pi, truthIndex: pj }
        : k === "skip"
          ? { kind: "extra", camera: camera[pi], cameraIndex: pi }
          : { kind: "unseen", truth: truth[pj], truthIndex: pj }
    );
  }

  const matches = perShot.filter((s): s is Extract<CalibrationShot, { kind: "match" }> => s.kind === "match");
  return {
    method,
    shots: truth.length,
    agreed: matches.filter((s) => s.camera === s.truth).length,
    matched: matches.length,
    extra: perShot.filter((s) => s.kind === "extra").length,
    unseen: perShot.filter((s) => s.kind === "unseen").length,
    cameraMakes: camera.filter((c) => c === "make").length,
    trueMakes: truth.filter((t) => t === "make").length,
    perShot,
  };
}
