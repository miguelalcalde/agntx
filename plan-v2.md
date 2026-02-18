# agntx v2 Plan

## Context

`agntx` is evolving from an "install agent files from source repos" CLI into an agent environment manager for:

- agents
- skills
- commands
- file groups (for example `backlog -> .backlog`)

This is not a classic dotfiles tool replacement. Dotfiles tools optimize for one converged machine state, while `agntx` must support many projects with different, valid agent setups.

## Product Direction

- Keep the current UX strengths from `agntx` (prompts + deterministic flags).
- Reach feature parity with `agentfiles/setup.sh` behavior.
- Add stronger observability and correctness checks with `validate` and `status`.
- Support macOS/Linux first.
- Define and enforce a convention-first repository structure.
- Ship machine-readable `status --json` from day one.

## Non-Goals (v2 initial revamp)

- Windows support.
- Full secret management (for example password-manager-integrated API key workflows).
- Mandatory SHA pinning by default.
- Becoming a full dotfiles manager.

## Mental Model: Layered State

`agntx` manages layered environments, not a single source of truth:

1. Global baseline layer (shared defaults).
2. Project layer (repo-specific additions/overrides).
3. Effective environment view (what tools consume now).

Core responsibility: help users understand whether the effective environment is correct for a specific repo right now.

## Scope (v2)

Primary commands:

- `agntx install <repo|path>`
- `agntx validate [--path] [--strict] [--json]`
- `agntx status [--global|--local|--path] [--json]`

Status behavior:

- default (`agntx status`) reports the current repo
- `--global` additionally reports global install state and configured source repos from `~/.config/agntx/config.json`

Existing commands can remain, with aliases/migration:

- `add` -> alias to `install` during transition.
- `list/remove/check/update` can remain, but should be re-aligned to new metadata model over time.

## Source Contract (Convention First)

`agntx` should work by convention, matching the current shell workflow model.

### Reserved top-level directories

- `agents`
- `skills`
- `commands`
- `rules`
- `settings`
- `src`
- `lib`
- `dist`
- `build`
- `coverage`
- `node_modules`
- `test`
- `tests`
- `__tests__`
- `docs`
- `examples`
- `config`
- `tmp`
- `temp`

Interpretation in v2:

- `agents`, `skills`, `commands` are installable typed component directories.
- reserved directories above are ignored for discovery (not installable in v2).
- `scripts` and `configs` are intentionally not reserved; if present as top-level directories they are treated as file groups (`scripts` -> `.scripts`, `configs` -> `.configs`).

### File groups

Any other non-hidden top-level directory is treated as a file group and installed as a hidden project directory:

- `<group>` -> `.<group>`
- example: `backlog` -> `.backlog`

### Root files

Top-level files are ignored for source discovery. Only directories are considered.

### Hidden directories

Hidden top-level directories (for example `.git`) are ignored for auto-discovery.

## Install Architecture

### High-level flow

1. Resolve source (`repo` or local `path`).
2. Discover structure by conventions.
3. Resolve requested components (flags or interactive prompts).
4. Resolve install context:
   - scope: `global | local | path`
   - mode: `symlink | copy`
   - tools: `claude | cursor | all` (expandable)
5. Stage selected components in canonical root.
6. Materialize tool targets according to support matrix.
7. Backup replaced targets when overwrite is enabled.
8. Write runtime install metadata.
9. Print summary and optional JSON.

### Canonical root

- Global installs: `~/.agents/`
- Project installs: `<repo>/.agents/`

Canonical root stores staged source artifacts and install metadata.

### Overwrite and backups

- Interactive prompt for overwrite policy when applicable.
- If overwrite is enabled, move replaced files into:
  - `<canonicalRoot>/backups/<run-id>/...`

## Command Specs

## `agntx install`

Goal: install selected components from a convention-defined source into canonical + tool targets.

Flags (target set):

- `--agents [csv]`
- `--skills [csv]`
- `--commands [csv]`
- `--files [csv]`

Flags (scope/mode/tools):

- `--global`
- `--local`
- `--path <dir>`
- `--mode symlink|copy`
- `--tools claude|cursor|all`

Flags (behavior/output):

- `--force` (or explicit overwrite option)
- `--dry-run`
- `--verbose`
- `--json`

Expected behavior:

- Prompt when inputs are omitted and terminal is interactive.
- Deterministic non-interactive behavior.
- Enforce convention and compatibility rules with clear skip/warn/error semantics.

## `agntx validate`

Goal: verify source pack structure and/or installed environment integrity.

Checks:

- convention structure checks (reserved dirs + component shape)
- ensure reserved/ignored directories (`rules`, `settings`) are not treated as installable components in v2
- component shape validation:
  - agent markdown validity
  - skill directory must contain `SKILL.md`
  - command markdown checks
  - file-group mapping validity (convention)
- runtime integrity (if installed context exists):
  - missing canonical artifacts
  - broken symlinks
  - missing target files
  - source/runtime drift
  - unsupported component/tool combinations

Outputs:

- human-readable report by default
- `--json` report with issues and summary counts

Exit codes (proposal):

- `0` valid/no errors
- `1` invalid/errors present
- optional `2` warnings-only (if needed for CI nuance)

## `agntx status`

Goal: show current environment state and health for global/project/path scopes.

Report sections:

- detected roots and scope
- installed component counts by type
- per-tool installation status
- effective-layer summary (global + project where relevant)
- health issues (broken links, missing files, unsupported installs, drift)

`--json` must be stable and CI-friendly from day one.

## JSON Output Contract (status)

Proposed minimum shape:

```json
{
  "schemaVersion": 1,
  "scope": "project",
  "baseDir": "/path/to/repo",
  "canonicalRoot": "/path/to/repo/.agents",
  "summary": {
    "agents": 0,
    "skills": 0,
    "commands": 0,
    "files": 0,
    "healthy": true,
    "errors": 0,
    "warnings": 0
  },
  "tools": {},
  "issues": []
}
```

## Cursor Commands Compatibility Note

Treat command installation as tool-aware. If command semantics differ by tool:

- install where supported,
- skip or adapt where unsupported,
- always explain outcome in `status` and install summaries.

This avoids pretending parity where behavior differs.

## Security and Consistency (lightweight v2)

Without introducing mandatory SHA pinning now:

- record source metadata at install time:
  - source URL/path
  - requested ref/branch (if any)
  - resolved commit SHA when source is git
  - install timestamp

This creates a foundation for future hardening (`--pin-sha`, drift checks, trust policies) without bloating the first revamp.

## Risks and Mitigations

- Drift and broken links:
  - Mitigation: `validate` + health checks in `status`.
- Overwrite/data loss:
  - Mitigation: backup-on-overwrite in canonical backup tree.
- UX complexity from many flags:
  - Mitigation: guided prompts + smart defaults.
- Tool capability mismatches:
  - Mitigation: explicit support matrix and clear skip/warn behavior.
- Convention ambiguity across repos:
  - Mitigation: strict reserved-directory rules and clear docs.
- Confusion with dotfiles tooling:
  - Mitigation: document layered per-project model prominently.

## Phased Delivery

### Phase 1 - Core Revamp

- Implement convention-based discovery and install flow.
- Implement `install` parity with current shell workflow semantics.
- Implement runtime metadata.
- Implement `status` with stable `--json`.

### Phase 2 - Integrity and CI

- Implement full `validate`.
- Add strict mode and CI-focused exit behavior.
- Improve drift/orphan diagnostics.

### Phase 3 - Lifecycle Maturity

- Rework `check` and `update` over new model.
- Add optional security/consistency enhancements (pinning, drift checks).
- Consider repair tooling (`doctor`) if needed.

## Notes for Review

- This plan intentionally prioritizes correctness and observability over new advanced features.
- Secret management and broader dotfile orchestration are explicitly deferred.
- Layered state and convention-based discovery are the core abstractions.
