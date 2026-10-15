# Installation and operation

Run commands from the repository root. The normative interface is
[openapi.yaml](openapi.yaml); [API guide](api.md) explains navigation and validation.
See [release verification](release-verification.md) for the clean-checkout and
read-only container acceptance results.

## Install and run locally

Required tools: Bun **1.4.3** (`.bun-version`), pnpm **11.3.0**
(`packageManager`) and Node **^22.22.2 || ^24.15.0 || >=26.0.0** for dependency
and test tooling. Node 26.7.0 is the Docker build toolchain, not the service runtime.
Install the pinned pnpm CLI with your tool manager; if needed, bootstrap it with
`npm install --global pnpm@11.3.0`. This is not a project dependency install.
Put `bun` and `pnpm` on PATH and check versions:

```sh
bun --version
pnpm --version
node --version
pnpm install --frozen-lockfile
pnpm start
# Development auto-restart:
pnpm dev
```

`pnpm start` runs `bun src/server.js`; dev adds `--watch`. Do not use
`npm install`, `yarn install` or `bun install` for project dependencies.
`pnpm-lock.yaml` is the only lockfile; Bun automatic installation is disabled.
Mermaid 12.1.0 and jsdom 30.1.3 are pinned. No database, volume, display server,
Chromium, Playwright or browser download is needed. Runtime validation does not
need to fetch diagram-provided resources.

## Docker

```sh
docker build --pull -t castalia/mermaid-validator:local .
docker run --rm --name mermaid-validator \
  -p 127.0.0.1:3000:3000 \
  --read-only --cap-drop=ALL --security-opt=no-new-privileges \
  castalia/mermaid-validator:local
```

The host binding is loopback-only; use a trusted reverse proxy for public access.
The container binds `0.0.0.0:3000`. No volume or persistent writable directory is
required. Stop from another terminal with `docker stop mermaid-validator`.
Bun is the direct entrypoint and receives stop signals without a shell wrapper.

The multi-stage build installs production dependencies with pinned pnpm and
`--frozen-lockfile --prod --ignore-scripts` on Node, then copies them into the
pinned Bun slim image. Node, npm, pnpm, dev dependencies, tests, docs, Git history
and local tooling are not copied into the runtime. Both base images are pinned
by version and registry digest. The build includes `pnpm-workspace.yaml` so the
repository's exact-version release-age exceptions apply without disabling the
policy globally. Dependency changes that require install scripts
must be reviewed and tested before changing the build policy. Refresh image
versions/digests deliberately and rerun integration checks for security updates.
The service runs as the image's unprivileged `bun` user.

No health route is part of v1 and the image adds no periodic parser load.
For readiness, send the valid POST below and require HTTP 200 with
`{"valid":true}` as in the [specification's](openapi.yaml) valid-response example.
Account for its validation deadline and avoid frequent probes consuming the
per-process validation capacity.

## Request recipes

These curl recipes are onboarding examples; schemas and response examples live
in [openapi.yaml](openapi.yaml), under `paths` and `components.requestBodies`.

```sh
# Boolean-only validation:
curl --fail-with-body http://127.0.0.1:3000/validate \
  -H 'Content-Type: application/json' \
  --data-binary '{"source":"flowchart TD\n  A --> B"}'

# Detailed validation:
curl --fail-with-body http://127.0.0.1:3000/validate/detailed \
  -H 'Content-Type: application/json' \
  --data-binary '{"source":"flowchart TD\n  A --> B"}'
```

To try a syntax failure, repeat either request with
`--data-binary '{"source":"not-a-mermaid-diagram"}'`. To try an input failure,
use `--data-binary '{"source":""}'`. Compare results with the operation examples
and `components.responses.BadRequest` in the specification rather than relying
on exact diagnostic wording.

Use `curl -i` to inspect status/headers; `--fail-with-body` exits nonzero for
4xx/5xx while preserving the error body.

## Settings and limits

| Setting | Default | Meaning |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Listening interface; cannot be empty |
| `PORT` | `3000` | Integer 1–65535; invalid values fail startup |

```sh
HOST=127.0.0.1 PORT=3100 pnpm start
# Different host port, unchanged container port:
docker run --rm -p 127.0.0.1:3100:3000 castalia/mermaid-validator:local
# To change the container port too, change both mapping and PORT:
docker run --rm -e PORT=3100 -p 127.0.0.1:3100:3100 castalia/mermaid-validator:local
```

Keep `HOST=0.0.0.0` inside Docker for published-port access. `EXPOSE 3000` is
metadata, not a dynamic port mapping. `NODE_ENV=production` is set in the image;
it does not change the API contract. There are no client-controlled engine,
security, timeout or capacity settings.

The fixed per-process limits and default security policy are documented in
[openapi.yaml](openapi.yaml), `info.description`. Configure proxy access control,
request limits and rate limits before public use; keep its upstream timeout
above the specification's validation deadline with transport headroom.

## Diagnostic handling

Syntax acceptance is not a rendering/layout guarantee or a semantic correctness
claim. For result shapes and coordinate provenance, see `SyntaxDiagnostic` and
`SourcePosition` in [openapi.yaml](openapi.yaml). Do not assume every grammar
provides a location or treat an illustrative example as captured parser output.
Messages may contain untrusted source excerpts: escape them before HTML display.
Do not depend on exact parser wording. Do not log sensitive source text; runtime
failures must not be treated as syntax errors or expose stacks/paths.

## Tests

After a frozen install, with Bun and pnpm on PATH:

```sh
pnpm check:openapi         # OpenAPI structure, references, examples and shapes
pnpm test                  # Bun service/toolchain tests in tests/
pnpm test:coverage         # Bun suite, all src/*.js, line/branch thresholds
```

No separate compilation, application typecheck or lint command is configured.
Final acceptance must build the image from a clean checkout, start it read-only
without volumes, and check both routes with valid syntax, invalid syntax and
invalid HTTP input. Also verify bounded concurrency, actual worker cancellation,
position fallback and request independence with the service tests. Container
build success alone does not certify the service.
