# WS-2 W3 Blueprint — `npx @nadir/router` Config-File Installer

**Generated**: 2026-05-23
**Author**: Architect (Cycle 2)
**Status**: Draft, pending reviewer pass

---

## Patterns observed in Weave

Weave Router's `workweave/router/install/npm/` is a thin Node.js wrapper around bash scripts (`install.sh`, `uninstall.sh`). Spawns `bash` with inherited stdio. Requires `jq` and bash on PATH. Breaks on Windows without Git Bash. Zero programmatic test surface.

We do NOT copy this. Pure-JS ESM implementation with vitest filesystem fixtures.

Cycle 1 reviewer constraints from `ws2-agentic-wedge.md`:
- Must-fix #2 + #8: TOML sentinel regex anchored to `^` (line-start)
- Must-fix #4: opencode uses single `__nadir_config__` key, NOT paired sentinel keys
- Must-fix #7: telemetry default OFF; `--telemetry` opts in; `--yes` does NOT enable telemetry

---

## Architecture decision

Pure-JS ESM, no bash, no system deps. Single npm package at `getnadir.dev/install/npm/`, name `@nadir/router` (fallback `nadir-router` unscoped), bin command `nadir-router`.

---

## Package layout

```
getnadir.dev/install/npm/
├── package.json
├── bin/
│   └── cli.js                   # ESM entry, shebanged
├── src/
│   ├── args.js                  # Flag parsing (yargs-parser)
│   ├── config.js                # Resolve config paths by target + scope
│   ├── managed_block.js         # writeBlock / stripBlock for TOML and JSON
│   ├── telemetry.js             # Optional opt-in POST
│   └── targets/
│       ├── codex.js
│       ├── opencode.js
│       └── claude_code.js
├── tests/
│   ├── managed_block.test.js
│   ├── codex.test.js
│   ├── opencode.test.js
│   └── claude_code.test.js
├── README.md
└── vitest.config.js
```

`package.json` key fields:
```json
{
  "name": "@nadir/router",
  "version": "0.1.0",
  "type": "module",
  "bin": { "nadir-router": "bin/cli.js" },
  "engines": { "node": ">=18" },
  "dependencies": {
    "yargs-parser": "^21.1.1",
    "@iarna/toml": "^2.2.5",
    "detect-indent": "^7.0.1"
  },
  "devDependencies": { "vitest": "^1.6.0" },
  "scripts": { "test": "vitest run" }
}
```

`@iarna/toml` is used ONLY to validate the file is parseable TOML. It is never used to reserialize (would strip user comments). The managed block is manipulated via regex.

---

## Flag parsing (`src/args.js`)

| Flag | Type | Default | Notes |
|---|---|---|---|
| `--codex` | bool | false | Target |
| `--opencode` | bool | false | Target |
| `--claude-code` | bool | false | Target |
| `--scope` | string | `"global"` | `global` or `project` |
| `--api-key` | string | null | Skip interactive prompt |
| `--base-url` | string | `"https://api.getnadir.com"` | Router endpoint |
| `--uninstall` | bool | false | Strip managed block, exit |
| `--telemetry` | bool | false | Opt-in. Default OFF (must-fix #7) |
| `--yes` | bool | false | Non-interactive. Does NOT enable telemetry |

Validation rules (exit 1 on failure):
- Exactly one of `--codex / --opencode / --claude-code`
- `--scope` is `"global"` or `"project"`
- `--yes` requires `--api-key`

---

## Config file path resolution

| Target | Scope global | Scope project |
|---|---|---|
| `codex` | `~/.codex/config.toml` | `<cwd>/.codex/config.toml` |
| `opencode` | `~/.config/opencode/opencode.json` | `<cwd>/opencode.json` |
| `claude_code` | `~/.claude/settings.json` | N/A (error: not supported) |

`~` resolved via `os.homedir()`. Windows fallback for opencode: `%APPDATA%\opencode\opencode.json`.

---

## Managed-block contract (`src/managed_block.js`)

### TOML format (Codex)

Sentinel lines:
```
# >>> nadir managed - do not edit this block manually <<<
... nadir-owned TOML lines ...
# <<< nadir managed >>>
```

Regex anchored to line-start (must-fix #8):
```
/^# >>> nadir managed - do not edit this block manually <<<\n[\s\S]*?^# <<< nadir managed >>>\n?/m
```

The `^` with `m` flag prevents false matches inside TOML multi-line string values.

`stripTomlBlock(content)`: apply regex, return content with match removed.
`writeTomlBlock(content, block)`: strip first, append sentinel-wrapped block.

### JSON format (opencode, claude_code)

Single key `__nadir_config__` inside the relevant parent object (must-fix #4). Paired sentinels break under alphabetical sort because `_end` sorts before `_start`.

`stripJsonBlock(parsed, parentPath)`: delete the `__nadir_config__` key from the parent.
`writeJsonBlock(parsed, parentPath, block)`: strip first, set `parent.__nadir_config__ = block`.

### Hash compare before write

Both formats: `sha256(newContent)` vs `sha256(existingContent)`. Skip `fs.writeFile` if equal. Avoids triggering Codex / Claude Code config-file watchers unnecessarily.

Exported:
```js
stripTomlBlock(content), writeTomlBlock(content, block)
stripJsonBlock(obj, parentPath), writeJsonBlock(obj, parentPath, block)
contentChanged(oldContent, newContent)
```

---

## Codex target (`src/targets/codex.js`)

File: `~/.codex/config.toml` (global) or `<cwd>/.codex/config.toml` (project).

Managed block content:
```toml
[model_providers.nadir]
base_url = "https://api.getnadir.com"
wire_api = "responses"

[model_providers.nadir.headers]
"x-nadir-key" = "<ROUTER_KEY>"

model_provider = "nadir"
model = "auto"
```

`model_provider` and `model` are top-level TOML keys but inside the managed block, so uninstall removes them cleanly.

Install flow:
1. Read file (create empty if missing; create parent dirs)
2. Validate parseable TOML; exit clearly if corrupt
3. Prompt for API key if not supplied
4. Construct managed block with interpolated key
5. `writeTomlBlock(content, block)`
6. Hash compare; write if changed
7. Print confirmation with path

---

## opencode target (`src/targets/opencode.js`)

File: `~/.config/opencode/opencode.json` (global) or `<cwd>/opencode.json` (project).

Schema:
```json
{
  "providers": {
    "__nadir_config__": {
      "id": "nadir",
      "name": "Nadir Router",
      "baseURL": "https://api.getnadir.com",
      "api": "openai",
      "models": ["auto"],
      "apiKey": "<ROUTER_KEY>"
    }
  }
}
```

`__nadir_config__` lives inside `config.providers`. Strip is `delete config.providers.__nadir_config__`. All user-defined provider entries untouched.

Indent preservation via `detect-indent`. Default to 2-space for new files.

---

## Claude Code target (`src/targets/claude_code.js`)

File: `~/.claude/settings.json`. Project scope not supported (error clearly if `--scope project` + `--claude-code`).

Claude Code does not need a provider block; it reads `ANTHROPIC_BASE_URL` from `env` to override the SDK target.

```json
{
  "__nadir_config__": {
    "env": {
      "ANTHROPIC_BASE_URL": "https://api.getnadir.com",
      "ANTHROPIC_API_KEY": "<ROUTER_KEY>"
    }
  }
}
```

The `__nadir_config__` key is at top level. Install merges `__nadir_config__.env` into `config.env`; strip removes `__nadir_config__` AND removes those specific keys from `config.env` (tracked precisely so user env keys aren't touched).

---

## Telemetry (`src/telemetry.js`)

**Default: OFF** (must-fix #7). `--telemetry` flag explicitly opts in. `--yes` does NOT enable it.

Payload:
```json
{
  "event": "install",
  "target": "codex" | "opencode" | "claude_code",
  "node_version": "v20.11.0",
  "platform": "darwin",
  "ts": 1716470400000
}
```

No API key, no user identifier, no machine fingerprint.

Transport: `fetch("https://api.getnadir.com/v1/telemetry/install", { method: "POST", body: JSON.stringify(payload) })`. Fire-and-forget. Install succeeds regardless of telemetry POST outcome.

No persistent storage. `--telemetry` enables for one invocation only.

Backend dependency: `POST /v1/telemetry/install` (unauthenticated, returns 200) must be added to `backend/app/api/telemetry.py` as a separate task before Day 4 smoke test.

---

## Idempotency contract

1. Same install command twice → byte-identical files after second run (hash compare).
2. User edits to non-managed portion survive install.
3. `--uninstall` removes ONLY the managed block.
4. Parent directories created with `recursive: true`.
5. Permission errors caught, surfaced with offending path and OS error message. No silent failures.

---

## Tests

All in vitest, fixtures in `os.tmpdir()` subdirs. Never touch real `~/.codex/`, `~/.config/opencode/`, `~/.claude/`.

### `tests/managed_block.test.js` (10 cases)
- TOML strip with no block returns unchanged
- TOML strip removes only block
- TOML write empty produces correct sentinels
- TOML write+write idempotent
- TOML user comment outside block survives
- TOML sentinel inside multi-line string NOT matched (validates `^` anchor)
- JSON strip with no `__nadir_config__` returns unchanged
- JSON strip removes only that key
- JSON write+write idempotent
- `contentChanged` matrix

### `tests/codex.test.js` (7 cases)
- Fresh install: creates file with correct structure
- Re-install: bytes outside block unchanged
- Uninstall: matches pre-install bytes
- Pre-existing user keys preserved
- Corrupt TOML: exits with error, no modification
- chmod 000: clear permission error
- `model_provider` + `model` removed on uninstall

### `tests/opencode.test.js` (6 cases)
- Fresh install creates `providers.__nadir_config__`
- Re-install: other providers untouched
- Uninstall: other providers intact
- 4-space indent preserved
- Corrupt JSON: clear error
- `--scope project` writes to cwd

### `tests/claude_code.test.js` (5 cases)
- Fresh install merges env keys
- Re-install idempotent
- Uninstall removes injected env keys but preserves user env keys
- `--scope project --claude-code`: clear error, no write
- Corrupt settings.json: clear error

---

## Risk register (W3-specific)

1. **opencode JSON schema evolution.** Schema not versioned. If `providers` is renamed, we silently write to wrong location. Mitigation: verify `providers` key exists on parsed config; if absent and file non-empty, warn and require `--yes`.

2. **Claude Code watches `settings.json` and reloads.** Unnecessary touches interrupt active sessions. Hash-compare-before-write eliminates this on re-install. First install touch is unavoidable.

3. **TOML sentinel inside user multi-line string.** Would mismatch without `^` anchor. Verified by dedicated test (`# >>> nadir managed` appearing inside a `"""..."""` value must NOT match).

4. **`@nadir` npm org availability.** Publishing to `@nadir/router` requires the `nadir` org. If unavailable, fallback unscoped name `nadir-router`. Day 4: verify org ownership before dry-run.

5. **`--scope project` for Codex auto-commit?** Blueprint says write only, no auto-commit. Auto-commit is a W4+ feature. Document the user should commit themselves.

---

## Files to create

| File | Purpose |
|---|---|
| `install/npm/package.json` | Manifest |
| `install/npm/bin/cli.js` | Shebang entry point |
| `install/npm/src/args.js` | Flag parsing + validation |
| `install/npm/src/config.js` | Path resolution |
| `install/npm/src/managed_block.js` | Block read/write/strip + hash compare |
| `install/npm/src/telemetry.js` | Opt-in POST |
| `install/npm/src/targets/codex.js` | TOML target |
| `install/npm/src/targets/opencode.js` | JSON target with indent preservation |
| `install/npm/src/targets/claude_code.js` | JSON target with env-key merging |
| `install/npm/tests/managed_block.test.js` | Unit tests |
| `install/npm/tests/codex.test.js` | Codex integration |
| `install/npm/tests/opencode.test.js` | opencode integration |
| `install/npm/tests/claude_code.test.js` | Claude Code integration |
| `install/npm/vitest.config.js` | Vitest config |
| `install/npm/README.md` | Usage + flags + per-target docs |

Backend dependency (separate task):
| `backend/app/api/telemetry.py` | `POST /v1/telemetry/install` |

---

## Build sequence (1 week)

**Day 1**: package.json, vitest.config.js, args.js, config.js, managed_block.js + 10 tests. `npm test` green.
**Day 2**: codex.js + 7 tests. Wire through cli.js. Manual smoke against real `~/.codex/config.toml`.
**Day 3**: opencode.js + 6 tests, claude_code.js + 5 tests. Full suite green.
**Day 4**: telemetry.js, backend `/v1/telemetry/install`, README, `npm publish --dry-run`, `@nadir` org verification.
**Day 5**: Manual smoke testing on real Codex/opencode/Claude Code installations. Project scope tests. `--yes --api-key` non-interactive path. `--telemetry` explicit verification.

---

## Critical details

- Error messages include: what failed, which file, OS error. No silent failures.
- Interactive API key prompt: `readline` (built-in), echo off via muted output.
- Windows: `os.homedir()` works. opencode path uses `%APPDATA%\opencode\` via `process.platform` check.
- Node 18+ for native `fetch`. Hard in `engines.node`.
- `@iarna/toml` is parse-only validation. Never reserialize. Documented contract.

---

## Open questions for reviewer

1. `--scope project` for Codex auto-commit? Blueprint: write only.
2. Backend `POST /v1/telemetry/install` is a dependency for Day 4. Track as separate task?
3. `@nadir` npm org: registered, or use fallback `nadir-router`?

---

## Reviewer must-fixes (applied 2026-05-23, cycle 2)

### Blocking (must address before Day 2)

1. **TOML regex breaks on CRLF files**. Replace literal `\n` with `\r?\n` throughout:
   ```
   /^# >>> nadir managed - do not edit this block manually <<<\r?\n[\s\S]*?^# <<< nadir managed >>>\r?\n?/m
   ```
   Before writing a managed block to a TOML file, detect existing line-ending convention and use it in the injected block. Add CRLF fixture to the multi-line string test.

2. **Claude Code uninstall stomps user edits silently**. On uninstall, for each tracked env key in `__nadir_config__.env`, compare `config.env[key]` against `__nadir_config__.env[key]`. If they differ, print a warning ("ANTHROPIC_BASE_URL was modified after install; it was not removed") and SKIP the deletion of that key. Add test case `tests/claude_code.test.js::env_key_modified_after_install_survives_uninstall_with_warning`.

3. **API key prompt hangs on non-tty stdin**. Before opening readline, check `process.stdin.isTTY`. If false AND `--api-key` was not supplied AND `--yes` not set, exit with `Error: stdin is not a tty; supply --api-key for non-interactive use`. Add test for piped-input rejection.

4. **`os.homedir()` empty/`/` on headless environments**. First line of `src/config.js`: validate `os.homedir()` returns a non-empty absolute path of length > 1. On failure, exit with: `Could not resolve home directory. Set the HOME environment variable.` Add test.

### Should-fix (in execute pass)

5. **Hash compare false-triggers on trailing newline**. Standardize on exactly one trailing newline before hashing. `managed_block.js` documents this as a contract: writeBlock always normalizes to one trailing `\n` (or `\r\n` on CRLF files); strip-then-write must preserve the convention.

6. **JSON CRLF preservation on Windows**. Add `detect-eol` dependency alongside `detect-indent`. If source uses CRLF, post-process `JSON.stringify` output with `.replace(/\n/g, '\r\n')` before writing.

7. **`--yes` without `--telemetry` prints reminder**. When `--yes` is used and `--telemetry` is not passed, print: `Telemetry is off. Pass --telemetry to opt in.` README must also document this explicitly.

### Nice-to-have / process

8. **`--scope project` commit reminder**. After a project-scope write, print: `Remember to commit .codex/config.toml (or opencode.json) to your repository.` No auto-commit.

9. **Move `@nadir` org check from Day 4 to Day 1**. Discovering the org is parked on Day 4 wastes a week. Verify on Day 1; if unavailable, fall back to unscoped `nadir-router` name immediately.

10. **Backend `/v1/telemetry/install` endpoint is its own Day 3 task**, not a Day 4 dependency that could slip. Track in backend engineer's queue.
