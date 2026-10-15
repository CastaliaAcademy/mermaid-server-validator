# Tests and coverage

From the repository root, with Bun 1.4.3, pnpm 11.3.0 and supported Node on PATH:

```sh
pnpm install --frozen-lockfile
pnpm check:openapi
pnpm test
pnpm test:coverage
```

For the optional repository-local Bun installation, first run
`export PATH="$PWD/.tools/bun:$PATH"`. No network is needed after dependency
installation. Tests bind ephemeral loopback ports and require process spawning.
The service is JavaScript with no compilation step. No dedicated lint or
application typecheck is configured. The old `check` command checked only the
removed library declarations, not HTTP implementation types, and was removed
alongside those declarations and their TypeScript tooling.

`pnpm check:openapi` validates [the canonical API specification](openapi.yaml),
local references, examples and project-specific contract shapes; see the
[API guide](api.md#check-the-specification) for scope and semantic limitations.
It complements rather than replaces the runtime tests below.

`pnpm test:coverage` runs the Bun suite against an instrumented copy, merges the
real Bun subprocess results, and exits nonzero on a test failure or coverage
below 85% lines / 80% branches. All `src/*.js` files are included, even unexecuted
ones. Dependencies, tests, fixtures and tooling scripts are excluded.

Outputs (ignored by Git; regenerated on each run):

- `coverage/index.html`: annotated source and branch report.
- `coverage/lcov.info`: machine-readable line/function/branch coverage.
- `coverage/coverage-summary.json`: totals and per-file percentages.
- `coverage/coverage-final.json`: counters and branch locations.
- `coverage/raw/`: per-process snapshots.
- `coverage/instrumented/`: disposable test copy; original source is unchanged.

Bun's native `bun test --coverage` alone does not measure the parse subprocesses
or report branch coverage. The command uses Istanbul source instrumentation,
a test-only exit collector, and Bun test cleanup hooks. Separate snapshots
prevent subprocesses and test globals overwriting each other. Processes forcibly
killed by timeout cannot flush snapshots; their counters are not invented or
excluded from the denominator. Instrumentation never runs in production.

## Verified behavior

The service suite has 34 tests, including real HTTP requests to both routes with
actual Mermaid/jsdom (flowchart, sequence, class, state, ER, pie) and a preserved
21-case parser corpus with additional diagram families. Fixture integrity tests
verify all three copied Castalia sources remain unmodified in that corpus.
Fixtures now live together under `tests/fixtures/`.

Checks include exact response envelopes/headers, valid/invalid syntax, Jison,
Langium and YAML diagnostics, conservative original-source line provenance,
unknown positions/columns, Unicode and LF/CRLF/CR, malformed JSON/UTF-8, absent
bodies and invalid schema/media, exact and over-limit source/body sizes, escaped
JSON overhead and streaming errors. Repeated and parallel requests check state
isolation and recovery after syntax/input errors and configuration directives.

Process-boundary tests cover admission overflow, real CPU-bound timeout
termination, missing executable/worker, malformed/private worker protocol,
capacity recovery, and shutdown with active work. A real engine subprocess checks
locked configuration under both directives and frontmatter, disabled inline
scripts/event handlers, and zero HTTP requests to a loopback subresource server
for script/iframe/image/stylesheet elements. Test-only workers simulate
operational failures; successful integration parsing is never mocked.

## Measured cleanup baseline (2026-10-15)

After removing the separate Node library/CLI implementation and its runner:
34 Bun tests passed, 647 assertions, both normally and with instrumentation.
All six remaining production `src/*.js` files: 98.03% lines (150/153),
97.45% branches (115/118). The command always enforces the actual measured
result rather than treating baseline numbers as a guarantee.

Remaining gaps are not filled with fabricated engine failures or broad mocks:

- `engine.js:24-25`: cleanup after import/initialization failure.
- `server.js:91`: Bun's last-resort server error callback; handler-level runtime
  and stream failures already have public-envelope tests. The repeated shutdown
  signal guard and rejected-cancel callback are not forced.
- `http-worker.js:28`: unexpected non-syntax parser runtime error. Parent-level
  internal-error handling is covered; no API injection makes the real parser
  throw an arbitrary runtime exception. Muted console callbacks are not invoked
  by this corpus.

Historical pre-cleanup measurements remain in `release-verification.md` and
`baseline.md`; they are not claims about the current source tree.
