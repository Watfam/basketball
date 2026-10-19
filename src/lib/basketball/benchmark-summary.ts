import { analyzeBenchmarks, type BenchmarkRow } from "./benchmark-analysis.ts";

export type BenchmarkLine = {
  key: string;
  title: string;
  detail: string;
  latest: { makes: number; attempts: number; pct: number | null; at: string } | null;
  runs: number;
};

/** One line per benchmark for the Home and Train cards: the latest result under the current protocol, or none. */
export function benchmarkLines(rows: BenchmarkRow[]): BenchmarkLine[] {
  return analyzeBenchmarks(rows).map((r) => {
    const g = r.groups.find((x) => x.current && x.results.length > 0) ?? null;
    const latest = g ? g.results[g.results.length - 1] : null;
    return {
      key: r.protocol.key,
      title: r.protocol.title.replace(" Benchmark", ""),
      detail: r.protocol.attempts ? `${r.protocol.attempts} shots` : `${r.protocol.clockSeconds} seconds`,
      latest: latest ? { makes: latest.makes, attempts: latest.attempts, pct: latest.pct === null ? null : Math.round(latest.pct), at: latest.at } : null,
      runs: g?.results.length ?? 0,
    };
  });
}
