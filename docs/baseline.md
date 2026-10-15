# Historical foundation baseline

This records the pre-HTTP foundation stage, not current setup instructions.
The separate Node library/CLI and its declaration tooling were subsequently
removed. Current commands and coverage are in [testing.md](testing.md); runtime
setup is in [operations.md](operations.md).

## Repository

Canonical working repository for all following cards:
`/home/everchaser/Projects/castalia/mermaid-validator`.
This is deliberately outside the disposable Kanban scratch workspace because the
requested project already exists there and subsequent tasks need its commits.
No Git repository/history existed in the project or Castalia parent directory
when inspected. Initialized `main`; no existing history was rewritten.

Pre-HTTP snapshot: **b039960** (`chore: snapshot original validator before HTTP
service work`). It contains the original Node ESM library, CLI, fixtures, tests,
lockfile and packaging script, plus expanded `.gitignore`. Runtime source files,
legacy tests and dependency versions remain unchanged by the foundation task.

Generated `reports/` and `node_modules/` remain locally available but are not
committed. Logs, tarballs, credentials/config, local runtime binaries and caches
are ignored. Filename checks and pattern scans of candidate project files found
no private keys, GitHub/AWS token patterns, assigned credential patterns, or
credential-bearing HTTP URLs. This limited scan is not a guarantee of absence.
No .env, .pem, .key, .p12 or .pfx source files were found. Original generated
registry/test reports were excluded rather than publishing them.

## Decisions

- BSD **3-Clause** (SPDX `BSD-3-Clause`), not BSD-2/4-Clause. LICENSE identifies
  Castalia as copyright holder and in the non-endorsement clause, preserves
  source/binary notice requirements and warranty/liability disclaimer, and adds
  no advertising clause. Third-party licenses are not relicensed.
- Bun **1.4.3** runtime; pnpm **11.3.0** is the only dependency manager. Both are
  explicitly pinned. Node engine range is retained for pnpm, TypeScript and the
  original regression suite, not as a second service runtime.
- At this foundation stage, the HTTP contract and runtime handoff were recorded
  in `docs/api.md`; no HTTP implementation was claimed by this card. The current
  source of truth is [openapi.yaml](openapi.yaml); see [API guide](api.md).
- `.bun-version` records the runtime version; Bun does not install itself from
  this file. `bunfig.toml` disables automatic dependency installation.
- A project-local ignored Bun is available on this host at `.tools/bun/bun`.
  For this checkout, use `export PATH="$PWD/.tools/bun:$PATH"` if Bun is not
  otherwise installed. Other hosts must install the pinned version themselves.
- Entrypoint `src/server.js`; HOST `0.0.0.0`, PORT `3000`. Scripts `start`, `dev`,
  `test`, `check` and `test:legacy` are settled in package.json. Runtime and
  container tasks should not independently choose competing paths or scripts.

## Verification on 2026-10-15

- Node v26.7.0, pnpm 11.3.0, Bun 1.4.3.
- Official Bun Linux x64 release archive verified against its published
  `SHASUMS256.txt` (`bun-linux-x64.zip: OK`). Runtime is ignored, not vendored.
- `pnpm install --frozen-lockfile`: success; lockfile unchanged.
- `pnpm test`: 2 passed, 0 failed. Actual Mermaid parsing and rejection under
  Bun/jsdom, not mock responses. These smoke tests do NOT certify HTTP worker
  isolation, resource limits, concurrency, or the future API implementation.
- `pnpm check`: TypeScript declarations check passed.
- `pnpm test:legacy`: 44 passed, 0 failed on Node. This is preserved behavior,
  not proof that Node worker semantics are supported by Bun.

The original Node library README and packaging workflow are available in Git
at the pre-HTTP snapshot b039960, not in the current service tree.


## Upstream references

- BSD-3-Clause text: https://opensource.org/license/bsd-3-clause
- Pinned Bun release: https://github.com/oven-sh/bun/releases/tag/bun-v1.4.3
- Bun configuration: https://bun.sh/docs/runtime/bunfig
- Bun tests: https://bun.sh/docs/test/configuration

Consult dependency API/types and verify actual engine behavior before normalizing
positions. A null position is preferable to fabricated original-source offsets.
