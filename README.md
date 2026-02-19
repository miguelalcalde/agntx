# agntx

Your agent files manager. Install skills, agents, commands, and more from GitHub repositories or local paths.

## Motivation

Managing agent resources across projects usually means repeating manual setup:

- copying agent files between repos
- syncing tool-specific folders for Cursor and Claude
- keeping local and global setups consistent

`agntx` automates that workflow so teams can install, update, and remove agent assets in a repeatable way from one command.

## Getting Started

### 1) Check requirements

`agntx` requires Node.js `>=18`.

### 2) Install or run with npx

Install globally:

```bash
npm install -g agntx
```

Or run directly with npx (no global install):

```bash
npx agntx install owner/repo
```

### 3) Install resources from a source

Quick start using interactive mode:

```bash
npx agntx install owner/repo
```

In interactive mode, the wizard guides you through:

1. component categories (`agents`, `skills`, `commands`, `files`)
2. scope (`local` or `global`, unless `--path` is provided)
3. mode (`symlink` or `copy`)
4. overwrite policy (single global decision for the run)
5. per-category item selection
6. tools (`claude`, `cursor`, or both)
7. final confirmation

### 4) Verify available commands

```bash
npx agntx --help
```

## Usage

### Install from a source

```bash
npx agntx install owner/repo
npx agntx install https://github.com/owner/repo
npx agntx install owner/repo#main
npx agntx install ./local-source-path
npx agntx owner/repo
npx agntx add owner/repo
```

`add` is an alias of `install` with the same behavior and options.

#### Command aliases

- `add` -> `install`
- `validate` -> `inspect`
- `rm` -> `remove`

#### Install options

- `--agents [items]` - install selected agent files (`csv`) or all when omitted
- `--skills [items]` - install selected skills (`csv`) or all when omitted
- `--commands [items]` - install selected commands (`csv`) or all when omitted
- `--files [items]` - install selected file groups (`csv`) or all when omitted
- `-g, --global` - install to global home scope
- `--local` - install to current project scope
- `--path <dir>` - install to a custom base path (flag-only, not prompted interactively)
- `--mode <mode>` - install mode: `symlink` or `copy`
- `--tools <tools>` - target tools: `claude`, `cursor`, or `all`
- `-f, --force` - overwrite existing paths
- `-d, --dry-run` - preview changes without writing
- `-v, --verbose` - verbose output
- `-y, --yes` - skip prompts and confirmations
- `--json` - emit JSON summary output

If a selected category has no discovered items, the installer warns and continues.
The final output is a compact summary line with install counts.

### Source layout

`agntx install` uses a convention-based source layout:

- `agents/*.md` for agent files
- `skills/<name>/SKILL.md` for skills
- `commands/*.md` for command docs
- other top-level directories as file groups (for example `backlog` -> `.backlog`)

Reserved top-level directories such as `rules`, `settings`, `src`, `dist`, and `docs` are ignored.

### Canonical storage and targets

Install mode is independent from target tools.

- local canonical root: `.agents/`
- global canonical root: `~/.agents/`

In `symlink` mode, tool targets point to canonical entries.
In `copy` mode, tool targets are copied from canonical entries.

### Remove installed agent files

```bash
npx agntx remove               # interactive
npx agntx remove code-review   # by name
npx agntx rm -g my-agent       # from global
```

#### Remove options

- `-g, --global` - remove from global scope
- `-a, --agent <agents>` - remove from specific agent tools
- `-s, --agent-file <names>` - specify agent files to remove
- `-y, --yes` - skip confirmation
- `--all` - remove all installed agent files from all tools

### Initialize a new agent file

```bash
npx agntx init my-agent   # creates my-agent.md
npx agntx init            # creates agent.md in current dir
```

### Check for updates

```bash
npx agntx check
```

### Update installed agent files

```bash
npx agntx update
```

## Agent file format

Agent files are markdown files with YAML frontmatter:

```markdown
---
name: agent-name
description: When to use this agent file
model: inherit
readonly: false
is_background: false
---

Your agent file prompt goes here.
```

### Frontmatter schema

| Field           | Required | Default             | Description                                                  |
| --------------- | -------- | ------------------- | ------------------------------------------------------------ |
| `name`          | No       | filename (no `.md`) | Unique identifier. Lowercase letters and hyphens only.      |
| `description`   | No       | —                   | When to use this subagent. Agent uses this for delegation.  |
| `model`         | No       | `inherit`           | Model: `fast`, `inherit`, or specific model ID.             |
| `readonly`      | No       | `false`             | If true, subagent runs with restricted write permissions.   |
| `is_background` | No       | `false`             | If true, subagent runs in background without waiting.       |

## Installation directories

### Local (project)

```text
.agents/agents/
.agents/skills/
.agents/commands/
.cursor/agents/
.cursor/skills/
.cursor/commands/
.claude/agents/
.claude/skills/
.claude/commands/
```

### Global (home)

```text
~/.agents/agents/
~/.agents/skills/
~/.agents/commands/
~/.cursor/agents/
~/.cursor/skills/
~/.cursor/commands/
~/.claude/agents/
~/.claude/skills/
~/.claude/commands/
```

**Precedence:** local entries override global entries when names conflict.

## License

MIT
