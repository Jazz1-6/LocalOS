# Benchmarks.md — LocalOS v1

> Performance targets, measurement methodology, and results.
>
> Status: Template — no results yet (waiting on `crates/core`)
> Version: 1.0
> Owner: Engineer B (`crates/app/bench/`)
> Feeder: Engineer A (`crates/core/transfer/`)

---

## Table of Contents

1. Purpose
2. Why Benchmarks
3. What We Measure
4. Methodology
5. Hardware Test Matrix
6. Baseline Results
7. Reference Hardware Runs
8. Regression Policy
9. Tooling
10. Reporting Format
11. Results Log

---

## 1. Purpose

This document defines how LocalOS performance is measured, what we
claim, and what evidence backs each claim.

It is a **living document**. Every meaningful performance change
requires a new entry in § 11 with hardware metadata, reproduction
commands, and raw numbers.

**No performance claim is made without a benchmark.** Rules.md §9.1.

---

## 2. Why Benchmarks

Three reasons:

1. **Honesty.** Saying "fast file transfer" without numbers is
   marketing. Numbers are engineering.
2. **Regression detection.** Once we have baselines, any regression
   is visible in CI or the results log.
3. **Optimization guidance.** You cannot optimize what you do not
   measure. Benchmarks tell us where time is actually spent.

---

## 3. What We Measure

### 3.1 Primary metrics

| Metric                     | Unit      | Why it matters                |
|----------------------------|-----------|-------------------------------|
| Effective throughput       | MB/s      | The headline number           |
| CPU utilization            | %         | Cost per byte transferred     |
| Peak memory (RSS)          | MB        | Must be bounded, not per-file |
| Disk read throughput       | MB/s      | Sender-side bottleneck        |
| Disk write throughput      | MB/s      | Receiver-side bottleneck      |
| Network utilization        | % of link | Are we saturating the LAN?    |
| Chunk retry rate           | %         | Reliability of the transport  |
| Time to resume             | ms        | Latency after reconnect       |
| Hashing overhead           | % CPU     | Cost of integrity             |

### 3.2 Secondary metrics

| Metric                     | Unit      | Why it matters                |
|----------------------------|-----------|-------------------------------|
| Handshake latency          | ms        | Session setup speed           |
| Chat message round-trip    | ms        | Responsiveness                |
| mDNS discovery time        | ms        | How fast peers find each other|
| Startup time               | ms        | Time to first window          |
| UI frame time              | ms        | Smoothness                    |

### 3.3 Not measured

We do **not** claim:

- Numbers on hardware we don't have
- Numbers extrapolated from smaller tests
- Numbers under load unless explicitly labeled
- Numbers on internet-connected paths (LAN only)

---

## 4. Methodology

### 4.1 Test dataset

Every throughput benchmark uses the same dataset, generated
deterministically:

```bash
# 10 GB of pseudo-random data, generated once
dd if=/dev/urandom of=bench-10gb.bin bs=1M count=10240

# Directory with 1000 files of mixed sizes
cargo run -p localos-bench -- generate-fixture \
    --output ./bench-fixture \
    --file-count 1000 \
    --total-bytes 5368709120
The dataset has:

One large file (10 GB) for sustained throughput

1000 mixed-size files (5 GB total) for directory transfer

One tiny file (1 KB) for latency

One empty file (0 B) for edge-case correctness

Hash the dataset once. Every run verifies the source hash
before starting.

4.2 Warm vs cold cache
Every benchmark runs twice:

Cold: drop OS file cache before the run (Linux: echo 3 > /proc/sys/vm/drop_caches)

Warm: second run immediately after

Report both. Cold is the honest number. Warm shows the ceiling.

4.3 Network conditions
LocalOS is LAN-only, so we test on:

Environment	Link speed	Notes
Wired gigabit	1 GbE	Reference. Baseline.
Wired 2.5 GbE	2.5 GbE	Modern LAN
Wi-Fi 5	300-800 Mb/s	Typical hostel WiFi
Wi-Fi 6	600-1200 Mb/s	Modern laptops
Mobile hotspot	20-100 Mb/s	Worst realistic case
Never test on the public internet. Never test through a VPN.

4.4 Repetition
Run each benchmark 5 times

Report the median (not mean — outliers skew it)

Report the standard deviation — if it's > 10% of the median,
the environment is too noisy and needs investigation

4.5 Measurements per run
For every run, record:

Wall clock duration

Bytes transferred

Effective throughput = bytes / duration

Peak memory RSS (sampled every 500 ms)

Average CPU % across all cores

Chunk retry count

Environment (temp, background load)

5. Hardware Test Matrix
Results are meaningless without hardware context. Every benchmark
run records this table:

Field	Example value
Sender CPU	AMD Ryzen 7 5800X (8C/16T, 3.8 GHz)
Sender RAM	32 GB DDR4-3600
Sender storage	Samsung 980 Pro 1 TB (NVMe, PCIe 4.0)
Sender OS	Windows 11 Pro 23H2
Receiver CPU	Apple M2 Pro (10C)
Receiver RAM	16 GB unified
Receiver storage	Apple SSD (PCIe 4.0)
Receiver OS	macOS 14.4
Network	Gigabit Ethernet, Netgear GS308
Router/switch	Netgear GS308 (unmanaged)
Ambient temperature	22°C
Background load	None (all apps closed)
If this table is incomplete, the results are not valid.

6. Baseline Results
No baseline yet. Waiting on crates/core transfer engine.

Once the transfer engine lands, Engineer A produces the first
baseline on the reference hardware. That baseline becomes the
number every future change is compared against.

7. Reference Hardware Runs
7.1 Reference config A — "Dev workstation to MacBook"
Field	Value
Sender	Windows 11 desktop (Ryzen 7 5800X)
Receiver	macOS M2 Pro MacBook Pro 14"
Network	Gigabit Ethernet via switch
Chunk size	4 MiB
Concurrency	8
Hashing	BLAKE3
Dataset	bench-10gb.bin
Results: Pending — no transfer engine yet.

7.2 Reference config B — "Two Linux laptops, Wi-Fi"
Results: Pending.

7.3 Reference config C — "Mobile hotspot, worst case"
Results: Pending.

8. Regression Policy
A regression is:

Throughput drops by > 10% from the previous median on the
same hardware

Memory RSS grows by > 20% for the same workload

CPU usage grows by > 15% for the same throughput

On regression:

Bisect to find the offending commit

Fix or revert the change

Document the fix in § 11

Add a benchmark test if the regression was not caught
automatically

Correctness regressions always win. A 30% throughput gain that
breaks integrity verification is not acceptable. Rules.md §9.8.

9. Tooling
9.1 Benchmark harness
crates/app/bench/ contains the harness (once transfer lands):

bash
cargo run --release -p localos-bench -- run \
    --fixture ./bench-fixture \
    --output ./results/run-$(date +%Y%m%d-%H%M%S).json \
    --label "reference-A" \
    --notes "cold cache, no background load"
Output: a JSON file with all metrics from § 3.

9.2 Sample collection
During each run, the harness samples:

RSS every 500 ms via sysinfo

CPU every 500 ms via sysinfo

Network bytes via platform counters

Disk I/O via platform counters

9.3 Report generation
bash
cargo run -p localos-bench -- report \
    --input ./results \
    --output ./docs/bench-report.html
Produces a table and chart suitable for embedding in the README or
a portfolio page.

9.4 CI integration
A separate GitHub Actions workflow (.github/workflows/bench.yml)
runs on workflow_dispatch only. Results are committed to
bench-results/ with a timestamped filename.

CI does not run benchmarks on every push — the runners are too
noisy. Benchmarks run on real reference hardware, manually, and are
committed by hand.

10. Reporting Format
Every benchmark entry in § 11 follows this template:

markdown
### <YYYY-MM-DD> — <label>

**Config:** Reference A (Windows ↔ Mac, wired gigabit)
**Commit:** <short SHA>
**Dataset:** bench-10gb.bin (10 GiB)
**Chunk size:** 4 MiB
**Concurrency:** 8
**Cache state:** cold
**Repetitions:** 5

| Metric              | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Median |
|---------------------|-------|-------|-------|-------|-------|--------|
| Throughput (MB/s)   |       |       |       |       |       |        |
| CPU sender (%)      |       |       |       |       |       |        |
| CPU receiver (%)    |       |       |       |       |       |        |
| Peak RSS sender (MB)|       |       |       |       |       |        |
| Peak RSS recv (MB)  |       |       |       |       |       |        |
| Chunk retries       |       |       |       |       |       |        |
| Duration (s)        |       |       |       |       |       |        |

**Notes:** <any anomalies, environmental factors, or observations>

**Reproduction:**
```bash
cargo run --release -p localos-bench -- run \
    --fixture ./bench-fixture \
    --label reference-A \
    --repeat 5
text

---

## 11. Results Log

### 2026-XX-XX — Baseline pending

**Config:** Reference A
**Commit:** _pending `crates/core` transfer engine_
**Status:** Cannot run — no transfer engine yet

**Notes:** This section is a placeholder. Engineer A produces the
first baseline once the transfer engine is functional. Until then,
this document defines methodology only.

---

### Template for future entries

_(Copy the template from § 10 for each new run.)_

---

## 12. Performance Targets

These are goals, not claims. § 11 is the source of truth for what
we have actually achieved.

| Scenario                          | Target      | Rationale                       |
|-----------------------------------|-------------|---------------------------------|
| 1 GbE wired, single large file    | ≥ 110 MB/s  | Saturate the link               |
| 1 GbE wired, 1000-file directory  | ≥ 90 MB/s   | Small-file overhead bounded     |
| 2.5 GbE, single large file        | ≥ 280 MB/s  | Modern LAN ceiling              |
| Wi-Fi 6, single large file        | ≥ 80 MB/s   | Realistic                      |
| Mobile hotspot                    | ≥ 10 MB/s   | Worst-case but usable           |
| Peak RSS (any workload)           | ≤ 200 MB    | Bounded independent of file size|
| CPU per stream                    | ≤ 25%       | Room for 4 concurrent transfers |
| Time to resume after 5s disconnect| ≤ 500 ms    | User-perceptible threshold      |

**If a target is missed, we document why.** Missed targets with
explanation are more valuable than vague claims.

---

## 13. Anti-Patterns

Things we do **not** do:

- ❌ "Fastest on the LAN" without numbers
- ❌ "Up to X MB/s" (marketing speak for "under 1 ms and no load")
- ❌ "Supports files up to N GB" without memory measurements
- ❌ Benchmark on a dev machine with Chrome open and claim it's clean
- ❌ Compare against other tools without matching hardware and setup
- ❌ Report mean instead of median (outliers lie)
- ❌ Report single-run results as if they were stable
- ❌ Skip documentation of the environment

---

## 14. When to Benchmark

Run benchmarks:

- **Before** and **after** any performance-sensitive change
- **Before** merging a PR that touches transfer, integrity, or store
- **Before** a release tag
- **After** adding a new platform
- **After** a dependency upgrade

Do **not** run benchmarks:

- On a laptop with the fan spinning
- With a video call in the background
- On battery power (thermal throttling)
- Through a VPN
- On shared or public Wi-Fi

**Benchmarking rigor is a discipline, not a checkbox.**

---

## 15. Reproduction

Anyone should be able to reproduce every number in this document by:

1. Cloning the repo at the recorded commit
2. Checking out the reference hardware table in § 5 or § 7
3. Generating the fixture per § 4.1
4. Running the commands in § 11
5. Comparing their results to the recorded numbers

If results differ by more than 15%, the environment differs in a
way not captured in § 5. That's a documentation bug.

---

End of benchmarks document.