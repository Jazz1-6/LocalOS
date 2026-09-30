# Rules.md — LocalOS v1

> Non-negotiable engineering rules for LocalOS v1. Violations are bugs, not opinions.
>
> Status: v1 Specification
> Version: 1.0
> Platforms: Windows 11 · Linux · macOS
> Stack: Rust core · Tauri UI · QUIC · mDNS · SQLite · BLAKE3

---

## Table of Contents

1. Purpose
2. How to Use This Document
3. Architecture Rules
4. Coding Rules
5. Security Rules
6. Data Rules
7. Concurrency Rules
8. Protocol Rules
9. Performance Rules
10. Platform Rules
11. Testing Rules
12. Repository Rules
13. Scope Rules
14. Logging Rules
15. Error Handling Rules
16. Documentation Rules
17. Review Rules
18. Definition of Done (v1)
19. Definition of Never (v1)

---

## 1. Purpose

This document defines the rules that govern LocalOS v1. Rules are
mandatory. They exist to protect correctness, security, performance, and
scope.

Rules are not suggestions. Rules are not preferences. A rule violation
is a bug, and must be fixed before merge.

---

## 2. How to Use This Document

1. Read this document before contributing.
2. Every pull request is reviewed against these rules.
3. If a rule must be broken, it must be documented in `docs/` with:
   - which rule,
   - why,
   - what the alternative would cost,
   - when the exception expires.
4. Undocumented exceptions are reverted.
5. New rules are added when a class of bug appears more than once.

---

## 3. Architecture Rules

1. `core/` must be 100% OS-agnostic.
2. `core/` must never import `platform/`.
3. `core/` may import `traits/`.
4. `platform/` implements traits defined in `traits/`.
5. `traits/` contains no OS-specific code and no `#[cfg(target_os)]`.
6. `#[cfg(target_os)]` is allowed only inside `platform/`.
7. UI must contain no transfer, protocol, or crypto logic.
8. All OS-specific behavior lives behind a trait in `traits/`.
9. Every trait has exactly one implementation per supported OS.
10. The protocol is versioned. Breaking changes require a version bump.
11. Every state transition is explicit and logged.
12. Networking must be cancellable at every await point.
13. No unbounded concurrency. Every pool has a hard cap.
14. The `app` crate is the only place that wires core + platform + UI.
15. No global mutable state. Dependencies are injected.
16. No cyclic dependencies between crates.
17. No crate depends on `app` or `ui`.
18. No feature flag may silently change wire-format behavior.
19. Dependency direction: `app` → { `core`, `platform` }, `core` → `traits`,
    `platform` → `traits`. No other direction is allowed.

---

## 4. Coding Rules

1. Rust edition pinned in the workspace `Cargo.toml`.
2. Toolchain pinned in `rust-toolchain.toml`.
3. `cargo fmt` enforced in CI.
4. `cargo clippy -- -D warnings` enforced in CI.
5. No `unwrap()` on fallible I/O in `core/`.
6. No `panic!` on externally received input.
7. No `unsafe` unless documented and justified in a comment.
8. Every public function has a doc comment.
9. Every module has a module-level doc comment.
10. Error types are explicit. No `Box<dyn Error>` in core APIs.
11. All public APIs return `Result<T, E>` where failure is possible.
12. No stringly-typed errors. Use enums.
13. No `todo!()` or `unimplemented!()` in merged code.
14. No commented-out code in merged code.
15. No `println!` for logging. Use the logging layer.
16. No magic numbers. Constants are named and documented.
17. No duplicated logic across layers.
18. No premature abstraction. Abstract after the third use.
19. Prefer explicit over implicit.
20. Prefer boring over clever.

---

## 5. Security Rules

1. All network payloads encrypted. No exceptions.
2. Handshake authenticates both peers before any payload.
3. Receiver explicitly approves every transfer.
4. All received values are untrusted input.
5. Filenames are sanitized. Path traversal rejected.
6. Temporary files only inside the destination scope.
7. All messages are length-checked and schema-validated.
8. Malformed peers fail closed. Never crash.
9. Private keys never committed to the repository.
10. Private keys never written to logs.
11. Logs never contain file contents.
12. Logs never contain credentials or tokens.
13. Signed ads only. Unsigned ads are rejected.
14. Session keys are ephemeral. No reuse across sessions.
15. No plaintext fallback. If encryption fails, the connection fails.
16. No `unsafe` in crypto code.
17. No third-party crypto crates except audited ones.
18. No custom crypto. Use well-known primitives.
19. No downgrade paths for protocol versions.
20. No trust on first use without explicit user consent.

---

## 6. Data Rules

1. All SQLite writes are transactional.
2. No partial state persisted.
3. Resume state survives application restart.
4. `.part` files always paired with a resume record.
5. Orphan `.part` files cleaned on startup.
6. Atomic rename from `.part` to final only after verification.
7. Never silently overwrite an existing destination file.
8. Manifest verified before transfer is marked complete.
9. Chunk ids are content-addressed, not offset-addressed.
10. Every stored record has a schema version.
11. Migrations are forward-only.
12. No migration may drop user data without explicit consent.
13. No write outside a transaction.
14. No read-modify-write without a transaction.
15. No cached state that can diverge from the store.

---

## 7. Concurrency Rules

1. No unbounded task spawning.
2. Concurrency limits are configurable and enforced.
3. Default transfer concurrency: 8.
4. Default chunk size: 4 MiB.
5. Every async task has a cancellation path.
6. Every shared structure is `Send + Sync` or scoped.
7. Locks are never held across `.await`.
8. No busy loops. No polling without backoff.
9. Backpressure is applied at the scheduler.
10. Memory usage must be bounded independent of file size.
11. No channel without a bound.
12. No `spawn` without a corresponding `abort` path.
13. No `block_on` in async context.
14. No unbounded recursion. Use iteration or explicit stacks.
15. No task leak. Every task is joined or aborted.

---

## 8. Protocol Rules

1. Every message has a version header.
2. Every message has a type tag.
3. Every message has a length prefix.
4. Every message is schema-validated on receipt.
5. Unknown message types are rejected, not ignored.
6. Unknown protocol versions are rejected.
7. Duplicate requests are deduplicated by id.
8. Out-of-order arrival is handled, not assumed away.
9. Control and data use separate QUIC streams.
10. Any protocol change requires updating `Protocol.md`.
11. Any breaking change requires a version bump.
12. No optional field silently defaults.
13. No message larger than the configured maximum.
14. No message accepted before handshake completes.
15. No message accepted before receiver approval.

---

## 9. Performance Rules

1. No performance change without a benchmark.
2. Benchmarks are reproducible and documented.
3. Benchmarks record: hardware, OS, network, chunk size, concurrency.
4. No full-file buffering. Streaming only.
5. Hashing overhead is measured, not assumed.
6. Retry rate is measured and reported.
7. Time-to-resume is measured and reported.
8. Correctness has priority over throughput.
9. Optimizations are justified by data, not intuition.
10. Regressions are caught in CI or in a documented benchmark run.
11. No optimization is merged on intuition.
12. No benchmark without a baseline.
13. No baseline without a committed result file.
14. No result file without hardware metadata.
15. No performance claim without a reproduction command.

---

## 10. Platform Rules

1. No hardcoded paths. Use `AppPaths`.
2. No hardcoded separators. Use `Path` / `PathBuf`.
3. Never assume case-sensitive filesystem.
4. Never assume Unix permissions.
5. Never assume line-ending conventions.
6. Firewall prompts handled gracefully, including denial.
7. Clipboard implementations isolated per OS.
8. Discovery implementations isolated per OS.
9. CI runs on all three OSes from day one.
10. Manual testing on all three OSes before each release.
11. No `#[cfg]` outside `platform/`.
12. No `unsafe` platform code without a documented reason.
13. No dependency on a system library that is not bundled or optional.
14. No platform-specific behavior in the UI layer.
15. No silent feature degradation. If a platform cannot do something,
    the UI must say so.

---

## 11. Testing Rules

1. Unit tests for every core module.
2. Integration test: two-process local transfer.
3. Fault-injection test: kill connection mid-transfer.
4. Fault-injection test: corrupt a chunk.
5. Fault-injection test: restart app mid-transfer.
6. Fault-injection test: path traversal attempt.
7. Fault-injection test: malformed message.
8. Fault-injection test: disk full.
9. Fault-injection test: peer disconnect and reconnect.
10. Every bug fix includes a regression test.
11. Tests must run offline.
12. Tests must not depend on a specific LAN.
13. Tests must not depend on timing-sensitive assumptions.
14. Tests must clean up temporary state.
15. No test may depend on another test's order.
16. No flaky tests. If a test is flaky, fix it or delete it.
17. No test that requires the public internet.
18. No test that writes outside the test directory.
19. No skipped tests in merged code without a documented reason.
20. Coverage targets are measured, not enforced blindly.

---

## 12. Repository Rules

1. One workspace. Crates under `crates/`.
2. Docs under `docs/`.
3. No secrets in the repository.
4. No generated artifacts committed.
5. `.gitignore` covers `target/`, `node_modules/`, `dist/`.
6. Commit messages are descriptive.
7. Every PR passes CI on all three OSes.
8. Every PR updates docs if behavior changes.
9. Every PR updates `Protocol.md` if the wire format changes.
10. Every PR updates `Benchmarks.md` if performance changes.
11. Every PR updates `ThreatModel.md` if the security surface changes.
12. No direct commits to `main`. Use PRs.
13. No merge without review.
14. No force-push to `main`.
15. No binary files in the repository without a documented reason.
16. No vendored dependencies unless pinned and justified.
17. No dependency added without a documented reason.
18. No dependency added without a license check.
19. No dependency added without a maintenance check.
20. No dependency added without a size check.

---

## 13. Scope Rules

1. v1 features: F-01 through F-13 as listed in `PRD.md` §6. Nothing else.
2. Out-of-scope features do not appear in the UI.
3. Out-of-scope features do not appear in the protocol.
4. "Wouldn't it be cool if…" is not a reason to expand scope.
5. Scope changes require a written decision in `docs/`.
6. No cloud, relay, or internet traversal in v1.
7. No accounts in v1.
8. No mobile client in v1.
9. No local LLM in v1.
10. No distributed compute in v1.
11. No mesh routing in v1.
12. No app store in v1.
13. No plugin system in v1.
14. No scripting layer in v1.
15. Ship v1 before considering v2.

---

## 14. Logging Rules

1. Logs are structured. No free-form strings at info level.
2. Log levels: error, warn, info, debug, trace.
3. No log at info level in a hot path.
4. No log that contains file contents.
5. No log that contains clipboard payloads.
6. No log that contains chat message bodies at info level.
7. No log that contains private keys.
8. No log that contains credentials or tokens.
9. Logs are local only.
10. No telemetry leaves the device.
11. Logs are rotated and bounded in size.
12. Redaction is applied before write.
13. Every error log includes context, not contents.
14. Every security event is logged at warn or error.
15. Every state transition is logged at info or debug.

---

## 15. Error Handling Rules

1. No `unwrap()` on fallible I/O in `core/`.
2. No `expect()` on fallible I/O in `core/`.
3. No `panic!` on externally received input.
4. All public APIs return `Result<T, E>` where failure is possible.
5. Errors are typed, not stringly-typed.
6. Errors carry context, not contents.
7. Errors are logged at the boundary, not at the source.
8. Errors are never silently swallowed.
9. Errors are never converted to `Ok(())` without a reason.
10. Errors are never used for control flow.
11. Errors are never used for expected conditions.
12. Errors are never exposed to the UI as raw strings.
13. Errors are never used to leak internal state.
14. Errors are never ignored without a comment.
15. Errors are always actionable by the caller.

---

## 16. Documentation Rules

1. Every public API has a doc comment.
2. Every module has a module-level doc comment.
3. Every non-obvious decision has a comment.
4. Every rule exception has a documented reason.
5. Every protocol change updates `Protocol.md`.
6. Every security surface change updates `ThreatModel.md`.
7. Every performance change updates `Benchmarks.md`.
8. Every behavior change updates `Workflow.md`.
9. Every structural change updates `Architecture.md`.
10. Every scope change updates `Architecture.md` and this file.
11. `README.md` explains how to build and run.
12. `README.md` links to the demo video.
13. `README.md` states the supported platforms.
14. `README.md` states the v1 scope.
15. `README.md` states the non-goals.

---

## 17. Review Rules

1. Every PR is reviewed by at least one other person.
2. Every PR is reviewed against this file.
3. Every PR is reviewed against `Architecture.md`.
4. Every PR is reviewed against `Workflow.md`.
5. Every PR is reviewed for security implications.
6. Every PR is reviewed for performance implications.
7. Every PR is reviewed for scope creep.
8. Every PR that touches the wire format requires a protocol review.
9. Every PR that touches crypto requires a security review.
10. Every PR that touches concurrency requires a concurrency review.
11. Reviewers may block a PR on rule violations.
12. Reviewers must cite the rule violated.
13. Reviewers must suggest a fix, not just a rejection.
14. Authors must respond to every review comment.
15. Unresolved comments block merge.

---

## 18. Definition of Done (v1)

v1 is done when all of the following are true:

1. Two devices on the same LAN discover each other.
2. A directory with nested files transfers successfully.
3. Large files stream without full-memory load.
4. Multiple chunks transfer concurrently.
5. A forced disconnect does not corrupt verified chunks.
6. Restart resumes from the last verified chunk.
7. A corrupted chunk is detected and retransmitted.
8. Final integrity check passes before COMPLETE.
9. Path traversal attempts are rejected.
10. Existing destination files are never silently overwritten.
11. All network payloads are encrypted.
12. Clipboard syncs between two devices.
13. Group chat works with no internet.
14. Resource ads are signed and searchable locally.
15. Hostel Brain returns ranked local results.
16. Benchmarks are reproducible and documented.
17. Runs on Windows, Linux, and macOS from one codebase.
18. Demo video recorded and linked in README.
19. `docs/` contains Architecture, Workflow, Rules, Protocol, ThreatModel,
    and Benchmarks.
20. A stranger can clone the repository and build from the README.
21. All tests pass on all three OSes.
22. All rules in this file are satisfied or documented as exceptions.
23. No known security issues open.
24. No known data-loss issues open.
25. No known crash on malformed input open.

If any item is false, v1 is not done.

---

## 19. Definition of Never (v1)

The following are never acceptable in v1, regardless of justification:

1. Sending file payloads to a third party.
2. Routing traffic through a cloud relay.
3. Requiring an account to use the app.
4. Logging private keys or file contents.
5. Silently overwriting an existing file.
6. Reporting COMPLETE before verification.
7. Accepting payload before handshake.
8. Accepting payload before receiver approval.
9. Writing outside the destination scope.
10. Trusting a filename without sanitization.
11. Trusting a peer without authentication.
12. Using `unsafe` without documentation.
13. Shipping without benchmarks.
14. Shipping without tests for the happy path.
15. Shipping without tests for the failure path.
16. Adding a feature outside v1 scope.
17. Breaking the protocol without a version bump.
18. Breaking the store schema without a migration.
19. Breaking the platform abstraction boundary.
20. Merging a PR that violates this file.