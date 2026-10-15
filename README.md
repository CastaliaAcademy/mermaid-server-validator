# Castalia Mermaid Validator

Stateless HTTP service for raw Mermaid syntax validation with official Mermaid
and jsdom. Runs on Bun; no rendering, persistent storage or external browser.

## Quick start

Install Bun 1.4.3, pnpm 11.3.0 and a Node version allowed by `package.json`.
From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm start
```

In another terminal:

```sh
curl --fail-with-body http://127.0.0.1:3000/validate \
  -H 'Content-Type: application/json' \
  --data-binary '{"source":"flowchart TD\n  A --> B"}'
# {"valid":true}
```

- [Operations](docs/operations.md): installation, Docker, examples, settings, tests.
- [API contract (OpenAPI 3.1.1)](docs/openapi.yaml): the single source of truth for
  routes, schemas, limits, errors and position semantics.
- [API guide](docs/api.md): specification navigation and `pnpm check:openapi`.
- [Tests and coverage](docs/testing.md): reproducible commands, scope and known gaps.
- [Baseline](docs/baseline.md): original snapshot and toolchain decisions.


License: [BSD-3-Clause](LICENSE), copyright Castalia. Dependency licenses remain
those of their respective copyright holders.
