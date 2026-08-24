import { describe, expect, it } from "vitest";
import { parseBenchmarkOptions, percentile, resolveBenchmarkDatabaseUrl } from "./benchmark-scale.mjs";

describe("scale benchmark configuration", () => {
  it("bounds workload sizes to safe, repeatable ranges", () => {
    expect(parseBenchmarkOptions({ BENCHMARK_MONITORS: "1", BENCHMARK_ITERATIONS: "9999" }))
      .toEqual({ monitorCount: 100, iterations: 500 });
    expect(parseBenchmarkOptions({ BENCHMARK_MONITORS: "25000", BENCHMARK_ITERATIONS: "75" }))
      .toEqual({ monitorCount: 25_000, iterations: 75 });
  });

  it("calculates nearest-rank percentiles", () => {
    expect(percentile([9, 1, 5, 3, 7], 0.5)).toBe(5);
    expect(percentile([9, 1, 5, 3, 7], 0.95)).toBe(9);
    expect(percentile([], 0.95)).toBe(0);
  });

  it("resolves the same PostgreSQL environment shape used by installers", () => {
    expect(resolveBenchmarkDatabaseUrl({ DATABASE_URL: " postgres://direct " })).toBe("postgres://direct");
    expect(resolveBenchmarkDatabaseUrl({
      POSTGRES_USER: "sentrovia",
      POSTGRES_PASSWORD: "p@ss word",
      POSTGRES_DB: "monitoring",
    })).toBe("postgresql://sentrovia:p%40ss%20word@localhost:5432/monitoring");
    expect(resolveBenchmarkDatabaseUrl({})).toBeNull();
  });
});
