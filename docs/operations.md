# Installation and operation

Run commands from the repository root. The normative interface is [api.md](api.md).
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
`{"valid":true}`. Account for the 5-second validation deadline and avoid frequent
probes consuming the two validation slots.

## Requests and responses

Send raw Mermaid, not Markdown fences, in exactly `{"source":"..."}`. These are
contract examples, not a claim of captured runtime output for this commit.

Boolean-only validation (HTTP 200):

```sh
curl --fail-with-body http://127.0.0.1:3000/validate \
  -H 'Content-Type: application/json' \
  --data-binary '{"source":"flowchart TD\n  A --> B"}'
```

```json
{"valid":true}
```

Detailed validation (HTTP 200):

```sh
curl --fail-with-body http://127.0.0.1:3000/validate/detailed \
  -H 'Content-Type: application/json' \
  --data-binary '{"source":"flowchart TD\n  A --> B"}'
```

```json
{"valid":true,"error":null}
```

To exercise syntax errors, repeat either request with
`--data-binary '{"source":"not-a-mermaid-diagram"}'`. The boolean route returns
HTTP 200 `{"valid":false}`. The detailed response has this shape (the message is
a placeholder; exact wording is not stable):

```json
{"valid":false,"error":{"message":"Mermaid parser diagnostic","position":null}}
```

Bad input is different from bad syntax. For example, repeat either request with
`--data-binary '{"source":""}'`: HTTP 400, with an envelope of this shape
(message text is illustrative):

```json
{"error":{"code":"INVALID_INPUT","message":"source must be a nonempty string."}}
```

Use `curl -i` to inspect status/headers; `--fail-with-body` exits nonzero for
4xx/5xx while preserving the error body. Both routes have the same transport
error envelope. See [api.md](api.md) for the full status/code table.

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

Fixed v1 limits per process: body **131072 bytes**; decoded source **50000 UTF-16
code units** AND **100000 UTF-8 bytes**; validation deadline **5000 ms**, including
worker startup/imports/parse; at most **2** active validations, no unbounded queue.
Exceeded size → 413 `PAYLOAD_TOO_LARGE`; exhausted capacity → 503 `BUSY`;
deadline → 504 `VALIDATION_TIMEOUT`. There is no authentication or default CORS.
Configure proxy access control, request limits and rate limits before public use;
keep its upstream timeout above the validation deadline with transport headroom.

## Diagnostic limitations

Only syntax is validated: no rendering/layout guarantee or semantic correctness
claim. The detailed route returns the first diagnostic, not all errors. Positions
refer to the original decoded source, using 1-based lines and UTF-16 columns.
Unknown position is `null`; a known line with unknown column has `column:null`.
Not every Mermaid grammar reports a trustworthy location. Preprocessing may
remove comments, directives or frontmatter; never assume a caret or transformed
line offset is an original-source coordinate. See [position provenance](api.md#position-schema-and-provenance).

Messages may contain untrusted source excerpts: escape them before HTML display.
Do not depend on exact parser wording. Do not log sensitive source text; runtime
failures must not be treated as syntax errors or expose stacks/paths.

## Tests

After a frozen install, with Bun and pnpm on PATH:

```sh
pnpm test                  # Bun service/toolchain tests in tests/
pnpm test:coverage         # both suites, all src/*.js, line/branch thresholds
pnpm check                 # TypeScript declaration check
pnpm test:legacy           # preserved Node library regression suite
```

The legacy suite is not evidence for Bun worker isolation or HTTP correctness;
`smoke:legacy` is historical packaging tooling, not a service acceptance command.
Final acceptance must build the image from a clean checkout, start it read-only
without volumes, and check both routes with valid syntax, invalid syntax and
invalid HTTP input. Also verify bounded concurrency, actual worker cancellation,
position fallback and request independence with the service tests. Container
build success alone does not certify the service.
