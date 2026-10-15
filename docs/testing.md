# Tests and coverage

From the repository root, with Bun 1.4.3, pnpm 11.3.0 and supported Node on PATH:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm test:legacy
pnpm check
pnpm test:coverage
```

For the optional repository-local Bun installation, first run
`export PATH="$PWD/.tools/bun:$PATH"`. No network is needed after dependency
installation. Tests bind ephemeral loopback ports and require process spawning.

`pnpm test:coverage` runs both suites against an instrumented copy, merges the
real Bun subprocess and Node worker-thread results, and exits nonzero on a test
failure or coverage below 85% lines / 80% branches. All `src/*.js` files are
included, even unexecuted ones. Dependencies, tests, fixtures, declarations and
build/test scripts are not production source and are excluded.

Outputs (ignored by Git; regenerated on each run):

- `coverage/index.html`: annotated source and branch report.
- `coverage/lcov.info`: machine-readable line/function/branch coverage.
- `coverage/coverage-summary.json`: totals and per-file percentages.
- `coverage/coverage-final.json`: counters and branch locations.
- `coverage/raw/`: per-process/thread snapshots.
- `coverage/instrumented/`: disposable test copy; original source is unchanged.

Bun's native `bun test --coverage` alone does not measure the parse subprocesses
or report branch coverage. The coverage command uses Istanbul source
instrumentation, a test-only exit collector, and Bun test cleanup hooks. Separate
snapshots prevent workers and test globals overwriting each other. Processes
forcibly killed by timeout cannot flush snapshots; their counters are not
invented or excluded from the denominator. Coverage instrumentation never runs
in the production server or Docker image.

## Verified behavior

The Bun suite has 30 tests, including real HTTP requests to both routes with
actual Mermaid/jsdom (flowchart, sequence, class, state, ER, pie), and a preserved
real-parser compatibility corpus with additional diagram families.

Checks include exact response envelopes/headers, valid/invalid syntax, Jison,
Langium and YAML diagnostics, conservative original-source line provenance,
unknown positions/columns, Unicode and LF/CRLF/CR, malformed JSON/UTF-8, absent
bodies and invalid schema/media, exact and over-limit source/body sizes, escaped
JSON overhead and streaming errors. Repeated and paired parallel requests check
state isolation and recovery after syntax/input errors and config directives.

Process-boundary unit tests cover admission overflow, real CPU-bound timeout
termination, missing executable/worker, malformed/private worker protocol,
capacity recovery, and shutdown with active work. Test-only workers simulate
operational failures; successful integration parsing is never mocked. The
preserved Node library/CLI suite adds 44 regression tests.

## Measured baseline

On the pinned toolchain: 30 Bun tests and 44 Node tests passed, including a repeat
without instrumentation. All production `src/*.js`: 97.13% lines (237/244),
93.84% branches (183/195). Exact branch counts in the legacy worker path can vary
with worker-termination timing; the command always measures and enforces the
actual result, rather than treating these baseline numbers as a guarantee.

Remaining gaps are deliberately not filled with fabricated engine failures or
broad mocks just to raise percentages:

- `server.js:91`: Bun's last-resort server error callback; handler-level runtime
  and stream failures already have public-envelope tests. The repeated shutdown
  signal guard and rejected-cancel callback are not forced.
- `http-worker.js:28`: parser throws an unexpected non-syntax runtime error.
  Parent-level internal-error handling is covered; no API injection exists to
  make the real parser throw an arbitrary runtime exception. The muted console
  callback is not invoked by the tested Mermaid corpus.
- Legacy `index.js:40,58,68`: failed worker cleanup, late result beating the
  deadline callback, and synchronous Worker constructor failure.
- Legacy `cli.js:35,55-56`: help output and the last-resort unexpected CLI failure.
- Some null/missing-name/message fallback branches in legacy `errors.js`.

No production API defects were found by this expansion; the API contract and
production source remain unchanged. Container/release verification is separate.
