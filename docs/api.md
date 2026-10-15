# HTTP API v1

This document describes the HTTP service, container and tests.
Standalone, stateless, raw Mermaid syntax validation only: no rendering,
SVG, Markdown extraction, accounts, persistent storage or external browser.
Use the official `mermaid.parse()` with jsdom, not a replacement grammar.

## Contract and navigation

The single source of truth is [openapi.yaml](openapi.yaml) (OpenAPI 3.1.1).
Edit that specification rather than duplicating schemas, limits or error tables
in Markdown. Open it as a file or import it into an OpenAPI 3.1-compatible viewer;
no documentation viewer or specification-serving route is bundled with the service.
Documentation is not copied into the runtime image.

In the specification:

- `paths` describes both operations (`validate`, `validateDetailed`) and success examples.
- `components.requestBodies.Validation` and `components.schemas.ValidationRequest`
  describe the shared input and request examples.
- `components.schemas` contains `BooleanValidationResult`, `DetailedValidationResult`,
  `SyntaxDiagnostic` and `SourcePosition`, including coordinate provenance.
- `components.schemas.ServiceError` and `components.responses` describe error
  envelopes/codes, including dispatcher-only responses without extra operations.
- `info.description` documents limits, security, routing precedence and common headers.

## Check the specification

From the repository root, with the [project toolchain](operations.md#install-and-run-locally):

```sh
pnpm install --frozen-lockfile
pnpm check:openapi
pnpm test
```

`check:openapi` checks unique YAML keys, the OpenAPI structure, local reference
resolution, examples against schemas and project-specific operation/envelope/
error-code checks using pinned Swagger Parser, AJV and YAML dependencies.
[Tests and coverage](testing.md) describe runtime regression checks.

UTF-16/UTF-8 bounds and JavaScript `trim()` emptiness rules remain descriptions
and `x-*` annotations; generic JSON Schema validation does not enforce these
units or all runtime behavior. Diagnostic messages and positive-column examples
are illustrative, not captured output; the current mapper is conservative.

## Runtime

- Runtime: Bun **1.4.3**, pinned in `.bun-version`. pnpm **11.3.0** manages
  dependencies (`packageManager` in package.json); `pnpm-lock.yaml` is the ONLY
  lockfile. Do not use npm/yarn/bun install, including in Docker.
- `pnpm install --frozen-lockfile` installs dependencies. Node is tooling for
  pnpm, OpenAPI validation and coverage only, NOT the HTTP service runtime. The existing
  dependencies require the Node engines recorded in package.json for tooling.
- Entrypoint: `src/server.js`.
- `pnpm start` → `bun src/server.js`; `pnpm dev` → `bun --watch src/server.js`.
- `pnpm test` runs Bun tests in `tests/`; `pnpm test:coverage` measures all
  production JavaScript, including real validation subprocesses.
- `HOST`: default `0.0.0.0`; `PORT`: default `3000`. Startup must reject an
  invalid PORT (only integer 1–65535) or empty HOST; do not silently fall back.
  Bind errors must fail startup. Environment is server-controlled.
- Runtime dependencies remain pinned `mermaid@12.1.0`, `jsdom@30.1.3` pending a
  separately verified change. No storage, external browser, renderer or network
  fetch of diagram-provided resources is needed. jsdom scripts/subresource
  loading must remain disabled. A validation timeout must stop the actual work,
  not merely stop awaiting a promise.
