# agntx

A CLI to install agent definitions from GitHub repositories into local agent directories.

## Installation

```bash
npm install -g agntx
```

Or use with npx:

```bash
npx agntx add vercel-labs/agents
```

## Usage

### Add agents from a repository

```bash
npx agntx add vercel-labs/agents
npx agntx add https://github.com/vercel-labs/agents
npx agntx add vercel-labs/agents#main
npx agntx add vercel-labs/agents --mode symlink
npx agntx add vercel-labs/agents --mode copy
npx agntx add vercel-labs/agents --no-symlink
npx agntx https://github.com/vercel-labs/agents
npx agntx https://github.com/ruvnet/claude-flow/.agents
npx agntx https://github.com/ruvnet/claude-flow/.cursor
```

**Options:**
- `-g, --global` - Install to user-level (`~/.<agent>/agents/`) instead of project-level
- `-a, --agent <agents>` - Specify target agents: `cursor`, `claude`, `codex`, or `*` for all
- `-s, --agent-file <names>` - Specify agent names to install (use `*` for all)
- `--mode <symlink|copy>` - Install mode for tool directories (`symlink` recommended)
- `--no-symlink` - Shortcut for `--mode copy`
- `-l, --list` - List available agents in repo without installing
- `-y, --yes` - Skip confirmation prompts
- `-f, --force` - Overwrite existing installed files without prompting
- `--all` - Shorthand for `--agent-file '*' --agent '*' -y`

When running interactively (without `-y`), the wizard prompts for:
- agents to install
- target tools
- installation scope (`project` or `global`)
- install mode (`symlink` or `copy`)
- final proceed confirmation

### Install Mode and Canonical Storage

Install mode is independent from target tools.

`agntx` always materializes selected agents in a canonical directory first, then installs to selected tools:

- Project scope canonical dir: `.agents/agents/`
- Global scope canonical dir: `~/.agents/agents/`

In `symlink` mode (default on macOS/unix), tool files are symlinks to canonical files.
In `copy` mode, tool files are copied from canonical files.

Example (`cursor` only, project scope, `symlink` mode):

```
.agents/agents/my-agent.md       # real file
.cursor/agents/my-agent.md       # symlink to canonical file
```

Note: symlink mode currently supports macOS/unix. Use `--mode copy` (or `--no-symlink`) otherwise.

### Wizard Defaults Cache

After a successful interactive install, `agntx` saves your defaults to:

```
~/.agntx/preferences.json
```

Cached defaults include:
- selected target tools
- installation scope (`project` or `global`)
- install mode (`symlink` or `copy`)

Precedence rules:
- explicit CLI flags always win (`-g`, `-a`, `--mode`, `--no-symlink`)
- cache is used as the interactive default when flags are omitted
- `-y` / `--all` stays promptless and deterministic

### Source Directory Selection

By default, `agntx` only discovers agents in these source directories:

- `.agents/agents`
- `.cursor/agents`
- `.claude/agents`

If multiple directories are found, you'll be prompted to select one.
You can also select one directly in the GitHub URL suffix:

- `https://github.com/<owner>/<repo>/.agents` -> `.agents/agents`
- `https://github.com/<owner>/<repo>/.cursor` -> `.cursor/agents`
- `https://github.com/<owner>/<repo>/.claude` -> `.claude/agents`

If none of the standard source directories exist, install exits with a warning.

Installed agents preserve the source directory structure and original filenames.

### Remove agents

```bash
npx agntx remove              # interactive
npx agntx remove code-review  # by name
npx agntx rm -g my-agent      # from global
```

**Options:**
- `-g, --global` - Remove from global scope
- `-a, --agent <agents>` - Remove from specific agent tools
- `-s, --agent-file <names>` - Specify agents to remove
- `-y, --yes` - Skip confirmation
- `--all` - Remove all agents from all tools

### List installed agents

```bash
npx agntx list
npx agntx ls -g
npx agntx ls -a cursor
```

**Options:**
- `-g, --global` - List global agents
- `-a, --agent <agents>` - Filter by agent tool

### Find agents

```bash
npx agntx find              # interactive search
npx agntx find typescript   # search by keyword
```

### Initialize a new agent

```bash
npx agntx init my-agent     # creates my-agent.md
npx agntx init              # creates agent.md in current dir
```

### Check for updates

```bash
npx agntx check
```

### Update agents

```bash
npx agntx update
```

## Agent File Format

Agents are markdown files with YAML frontmatter:

```markdown
---
name: agent-name
description: When to use this agent
model: inherit
readonly: false
is_background: false
---

Your agent's system prompt goes here.
```

### Frontmatter Schema

| Field           | Required | Default             | Description                                                  |
| --------------- | -------- | ------------------- | ------------------------------------------------------------ |
| `name`          | No       | filename (no `.md`) | Unique identifier. Lowercase letters and hyphens only.       |
| `description`   | No       | —                   | When to use this subagent. Agent reads to decide delegation. |
| `model`         | No       | `inherit`           | Model: `fast`, `inherit`, or specific model ID.              |
| `readonly`      | No       | `false`             | If true, subagent runs with restricted write permissions.    |
| `is_background` | No       | `false`             | If true, subagent runs in background without waiting.        |

## Installation Directories

### Project-level (current project only)
```
.agents/agents/
.cursor/agents/
.claude/agents/
.codex/agents/
```

### User-level (global, all projects)
```
~/.agents/agents/
~/.cursor/agents/
~/.claude/agents/
~/.codex/agents/
```

**Precedence:** Project agents override user agents when names conflict.

## Example Session

```bash
$ npx agntx add vercel-labs/agents

Fetching vercel-labs/agents...
Found 5 agents in .agents/agents

? Select agents to install:
❯ ◉ code-review
  ◉ pr-summary
  ◯ test-writer
  ◯ docs-generator
  ◯ refactor

? Select target agent tools:
❯ ◉ cursor
  ◉ claude code
  ◯ codex
  ───
  - openclaw (coming soon)
  - cline (coming soon)

? Select installation scope:
❯ Project (Install in current directory) (recommended)
  Global (Install for all projects)

? Select install mode:
❯ symlink (recommended)
  copy

? Proceed with installation?
  - Source: vercel-labs/agents:.agents/agents
  - Agents (2): code-review, pr-summary
  - Tools: cursor, claude
  - Scope: project
  - Install mode: symlink
  - Canonical directory: .agents/agents

Installing 2 agents using symlink mode to 2 tools (project scope)...
✓ code-review → .cursor/agents/code-review.md
✓ code-review → .claude/agents/code-review.md
✓ pr-summary → .cursor/agents/pr-summary.md
✓ pr-summary → .claude/agents/pr-summary.md

✓ Done! Installed 4 agent files.
ℹ Summary: 4 installed, 0 failed, 0 skipped.
ℹ cursor: 2 installed, 0 failed, 0 skipped
ℹ claude: 2 installed, 0 failed, 0 skipped
ℹ Saved install defaults to ~/.agntx/preferences.json
```

## License

MIT
