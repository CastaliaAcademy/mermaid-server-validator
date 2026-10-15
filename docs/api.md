# HTTP API v1 — agreed implementation contract

This document is normative for the HTTP implementation, container and tests. It
specifies the next implementation, not an assertion that HTTP handlers already
exist. Standalone, stateless, raw Mermaid syntax validation only: no rendering,
SVG, Markdown extraction, accounts, persistent storage or external browser.
Use the official `mermaid.parse()` with jsdom, not a replacement grammar.

## Requests

Exactly two routes (no trailing-slash aliases):

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/validate` | Boolean-only validation result |
| POST | `/validate/detailed` | Validation result and first diagnostic |

Both accept UTF-8 JSON with `Content-Type: application/json` (case-insensitive
media type; `charset=utf-8` allowed). `Content-Encoding` must be absent or
`identity`. No query parameters are supported; ignore the query string for
routing, never treat it as Mermaid configuration. No authentication or CORS
headers are added by default; expose through a trusted proxy when needed.

The body is an object with exactly one own property:

```json
{"source":"flowchart TD\n  A --> B"}
```

Schema: `{ source: string }`, required, `additionalProperties: false`.
Reject null, arrays, primitives, missing/extra keys and non-string source with
400 `INVALID_INPUT`. A zero-length or whitespace-only source is also 400
`INVALID_INPUT`, not a Mermaid syntax failure. An absent or zero-byte HTTP body
and malformed JSON are 400 `INVALID_JSON`. A valid JSON empty string is instead
400 `INVALID_INPUT`. Markdown fences are not stripped; pass raw source to the
parser. Never trim, normalize line endings, or otherwise mutate source before
validation (checking `trim()` for emptiness is permitted).

Limits, measured before expensive work:

- Entire HTTP body: at most 131072 bytes (128 KiB), including JSON overhead.
  Enforce while reading, even without Content-Length; do not trust that header.
- Decoded source: at most 50000 UTF-16 code units AND 100000 UTF-8 bytes.
- Any exceeded size limit is 413 `PAYLOAD_TOO_LARGE` on either route.
- Validation deadline: 5000 ms (engine startup, imports and parse included).
- At most 2 active validations per process; no unbounded queue. Extra work is
  rejected with 503 `BUSY`. Do not let timed-out work keep occupying capacity.

These are fixed v1 limits, not client-controlled options. No client Mermaid
configuration object or timeout override is accepted. Text directives/frontmatter
must not override security settings or leak configuration into later requests.

## Successful processing: HTTP 200

A syntactically invalid diagram is a successful validation operation, not a 4xx.
Both routes always return JSON objects, not a bare boolean or JSON string.

`POST /validate` returns exactly one property, for valid and invalid syntax:

```json
{"valid":true}
```

```json
{"valid":false}
```

No diagram type, error, position, timing or echoed source is included.

`POST /validate/detailed` returns exactly `valid` and `error`:

```json
{"valid":true,"error":null}
```

On syntax failure:

```json
{"valid":false,"error":{"message":"Mermaid parser diagnostic","position":null}}
```

`message` is a nonempty human-readable string (maximum 2000 UTF-16 code units).
Its exact text is not stable across Mermaid versions. Return the first error;
no claim of collecting all errors. The example message above is a schema example,
not a captured engine response. Never expose stack traces, filesystem paths,
worker/runtime exceptions, or arbitrary serialized exception objects. Parser
messages may contain untrusted source excerpts; consumers must escape them in
HTML. Do not log source text by default.

### Position schema and provenance

`position` is either `null`, or an object with exactly these properties:

```json
{"line":2,"column":3}
```

- `line`: positive integer, 1-based line in the original decoded source.
- `column`: positive integer or `null`, 1-based UTF-16 code-unit column in that
  line. If only a trustworthy line exists, use e.g. `{"line":2,"column":null}`.
- Unknown line means the entire `position` is `null`; do not use zeros, negative
  values, string placeholders, guessed `(1,1)`, or position extracted from an
  unrelated stack trace. Do not infer a column from a pretty-printed caret.
- CRLF counts as one line break. Bare CR and LF each count as a line break.
  A parser-reported EOF immediately after a final newline may point to the
  following empty line; only use it if attributable to the original source.
- Normalize known parser coordinate bases only when verified for that parser.
  Mermaid preprocessing may remove directives/frontmatter, comments or empty
  lines. A coordinate in transformed text is NOT an original-source coordinate:
  return `null` unless a verified mapping exists. If line is reliable but column
  is not, preserve the line and set column to `null`.
- The API does not promise that every supported Mermaid grammar supplies a
  location. Unknown diagram type and coordinate-less errors can have `null`.
  Tests must check real diagnostics and fallback behavior, not invented numbers.

## Transport, input and service errors

Errors outside normal syntax validation have the SAME envelope on both routes;
boolean-only applies to 200 responses, not failed requests:

```json
{"error":{"code":"INVALID_INPUT","message":"source must be a nonempty string."}}
```

`error` has exactly `code` and `message` (nonempty safe string). No `valid` or
`position` is present. Error messages are not a stable machine interface; `code`
and HTTP status are. Unexpected runtime/import/DOM/worker errors must not be
misreported as Mermaid syntax errors or leak their original exception message.

| HTTP | code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_JSON` | Absent/empty body, malformed JSON or invalid UTF-8 |
| 400 | `INVALID_INPUT` | Wrong schema, empty/whitespace source |
| 404 | `NOT_FOUND` | Unknown path (including trailing slash) |
| 405 | `METHOD_NOT_ALLOWED` | Known path with method other than POST; `Allow: POST` |
| 413 | `PAYLOAD_TOO_LARGE` | Body or source limit exceeded |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Missing/wrong Content-Type or unsupported encoding |
| 500 | `INTERNAL_ERROR` | Unexpected engine/runtime/service failure |
| 503 | `BUSY` | Per-process validation capacity exhausted |
| 504 | `VALIDATION_TIMEOUT` | Validation deadline exceeded; terminate isolated work |

Routing precedence: unknown path 404, then method 405, then media/encoding 415,
then body-byte limit/UTF-8/JSON/schema/source limits, then admission and validation.
For valid JSON, check object shape/type before source emptiness and source size.
A rejected body need not be parsed after its byte limit has been exceeded.
All application responses use `Content-Type: application/json; charset=utf-8`
and `Cache-Control: no-store`. HEAD may omit its body as required by HTTP while
retaining the corresponding status and headers. No health endpoint is required
by v1; container checks can submit a small valid POST instead.

## Runtime and handoff

- Runtime: Bun **1.4.3**, pinned in `.bun-version`. pnpm **11.3.0** manages
  dependencies (`packageManager` in package.json); `pnpm-lock.yaml` is the ONLY
  lockfile. Do not use npm/yarn/bun install, including in Docker.
- `pnpm install --frozen-lockfile` installs dependencies. Node is tooling for
  pnpm/typechecking/legacy tests only, NOT the HTTP service runtime. The existing
  dependencies require the Node engines recorded in package.json for tooling.
- Entrypoint reserved for the implementation: `src/server.js`.
- `pnpm start` → `bun src/server.js`; `pnpm dev` → `bun --watch src/server.js`.
  These commands become runnable when the implementation task adds that file.
- `pnpm test` → Bun tests in `tests/`; `pnpm check` → TypeScript declarations
  check. `pnpm test:legacy` runs the preserved Node library suite in `test/`.
- `HOST`: default `0.0.0.0`; `PORT`: default `3000`. Startup must reject an
  invalid PORT (only integer 1–65535) or empty HOST; do not silently fall back.
  Bind errors must fail startup. Environment is server-controlled.
- Runtime dependencies remain pinned `mermaid@12.1.0`, `jsdom@30.1.3` pending a
  separately verified change. No storage, external browser, renderer or network
  fetch of diagram-provided resources is needed. jsdom scripts/subresource
  loading must remain disabled. A validation timeout must stop the actual work,
  not merely stop awaiting a promise.
- Implementation owns `src/server.js`, HTTP/worker modules and `tests/` additions.
  Container/documentation task owns Dockerfile, .dockerignore, README and new
  operations docs. Avoid concurrent edits of package.json and this contract:
  scripts, port and paths above are already settled; coordinate any deviation.

The original Node library and its tests are preserved, not silently certified
as Bun HTTP workers. In particular Node V8 `resourceLimits` and `async_hooks`
assertions must not be assumed to work unchanged under Bun. Bun worker isolation,
request independence and concurrency must be exercised by the implementation.
