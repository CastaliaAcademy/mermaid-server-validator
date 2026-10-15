# Release verification

Historical pre-cleanup verification. The library/CLI and its declaration/test
tooling below have since been removed; these commands and counts describe only
the recorded commit. Current service tests and coverage are in [testing.md](testing.md).

Verified on 2026-10-15 from a fresh local clone at `df5fcfd3eb2aa5802c8e82461e659297b0598b31`.
The following release commit changes documentation only; runtime, tests, lockfile
and Docker build inputs are unchanged.

## Clean checkout

With Bun 1.4.3, pnpm 11.3.0 and Node 26.7.0 on PATH:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm test:legacy
pnpm test:coverage
```

All commands passed: 30 Bun tests (616 assertions), 44 legacy Node tests, and
TypeScript checking. The coverage run repeated both suites with instrumentation:
97.13% lines (237/244), 93.84% branches (183/195) across every `src/*.js`.
See [testing.md](testing.md) for report files, thresholds and remaining gaps.

## Container

Built with `docker build --pull` from the same clean checkout. Image manifest:
`sha256:e05a8e912948a8933d881cc2660cbbda97e998fae09671451be28c7122e59a9a`.
This is a local verification image, not a published registry artifact.

Started with the documented read-only filesystem, dropped capabilities,
`no-new-privileges`, UID 1000 and no mounts. Real host HTTP requests checked each
route independently:

| Case | Status | Result |
| --- | --- | --- |
| Valid flowchart | 200 | `valid:true`; detailed `error:null` |
| Invalid `flowchart TD\n  A --> )` | 200 | `valid:false`; detailed diagnostic line 2, column null |
| Malformed JSON | 400 | `INVALID_JSON` |
| Empty source | 400 | `INVALID_INPUT` |
| `text/plain` | 415 | `UNSUPPORTED_MEDIA_TYPE` |
| Valid sequence after failures | 200 | Successful independent parse |

A second container used `--network=none` and no mounts. A real HTTP request over
its loopback interface to `/validate/detailed` successfully parsed a flowchart.
Both containers had empty `docker diff` output and stopped on SIGTERM with exit
code 0. No database, writable volume, tmpfs or persistent storage was supplied.
The test containers were removed afterwards.

## Publication checks

The Git history retains the original `b039960` snapshot and subsequent foundation,
container, HTTP implementation and QA commits. `LICENSE` is BSD-3-Clause with
Castalia as copyright holder and non-endorsement name. Dependency licenses remain
unchanged. History and tracked paths are scanned for private keys, common token
formats, credential URLs, assigned secrets and sensitive filenames before push;
pattern scanning is not a formal guarantee of absence of secrets.

Publication target: `git@github.com:CastaliaAcademy/mermaid-server-validator.git`.
Use an ordinary push of `main`, never force. Confirm the remote branch hash with
`git ls-remote --heads origin refs/heads/main` after pushing. No image publication,
production deployment or public exposure is part of this verification.
