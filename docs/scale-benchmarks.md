# Scale benchmark

Sentrovia includes a reproducible PostgreSQL benchmark for the monitor claim query. It creates a connection-scoped temporary table, loads deterministic synthetic monitor rows, measures repeated due-monitor selections, prints `EXPLAIN ANALYZE` timing, and disconnects. It never reads or modifies application tables.

Run the default 10,000-monitor workload:

```bash
npm run benchmark:scale
```

Adjust the workload without changing source code:

```bash
BENCHMARK_MONITORS=100000 BENCHMARK_ITERATIONS=100 npm run benchmark:scale
```

PowerShell:

```powershell
$env:BENCHMARK_MONITORS = "100000"
$env:BENCHMARK_ITERATIONS = "100"
npm run benchmark:scale
```

The JSON result records the workload, insert time, minimum, p50, p95 and maximum query latency, plus PostgreSQL planning and execution timing. Compare results only on equivalent PostgreSQL versions and hardware. CI runs a 1,000-monitor smoke workload to keep the benchmark executable and catch query regressions; published capacity claims should use larger workloads on deployment-class hardware.
