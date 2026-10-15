# Castalia Mermaid Validator

Standalone stateless Mermaid validation service foundation: Bun 1.4.3 runtime,
pnpm 11.3.0 dependencies, official Mermaid 12.1.0 and jsdom 30.1.3.

## Development

Install Bun 1.4.3 separately and put `bun` on PATH. Use Node compatible with
`package.json` to run pnpm tooling (the service itself runs on Bun).

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm check
```

Current status: the original Node library is preserved; the two Bun toolchain
smoke tests pass. HTTP handlers and Docker are the next tasks, not implemented by
this foundation commit. Reserved commands once `src/server.js` is added:

```sh
pnpm start
# HOST=0.0.0.0 PORT=3000 by default
pnpm dev
```

- [HTTP API and runtime contract](docs/api.md): `/validate`, `/validate/detailed`.
- [Baseline and handoff](docs/baseline.md): snapshot, checks, ownership.
- [Historical Node library documentation](docs/legacy-library.md): not the new
  HTTP API. `pnpm test:legacy` runs its unchanged regression suite.

Dependencies are installed with pnpm only; commit `pnpm-lock.yaml`, not npm,
yarn or Bun lockfiles. No persistent storage or external browser is required.

License: **BSD-3-Clause**, copyright Castalia. See [LICENSE](LICENSE). Dependency
licenses remain those of their respective copyright holders.
