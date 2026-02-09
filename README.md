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
```

**Options:**
- `-g, --global` - Install to user-level (`~/.<agent>/agents/`) instead of project-level
- `-a, --agent <agents>` - Specify target agents: `cursor`, `claude`, `codex`, or `*` for all
- `-s, --agent-file <names>` - Specify agent names to install (use `*` for all)
- `-l, --list` - List available agents in repo without installing
- `-y, --yes` - Skip confirmation prompts
- `--all` - Shorthand for `--agent-file '*' --agent '*' -y`

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
.cursor/agents/
.claude/agents/
.codex/agents/
```

### User-level (global, all projects)
```
~/.cursor/agents/
~/.claude/agents/
~/.codex/agents/
```

**Precedence:** Project agents override user agents when names conflict.

## Example Session

```bash
$ npx agntx add vercel-labs/agents

Fetching vercel-labs/agents...

Found 5 agents:
  ✓ code-review     Review code for best practices
  ✓ pr-summary      Generate PR summaries  
  ✓ test-writer     Write unit tests
  ✓ docs-generator  Generate documentation
  ✓ refactor        Suggest refactoring improvements

? Select agents to install: (Press <space> to select, <a> to toggle all)
❯ ◉ code-review
  ◉ pr-summary
  ◯ test-writer
  ◯ docs-generator
  ◯ refactor

? Select target agent tools:
❯ ◉ cursor
  ◉ claude
  ◯ codex

Installing 2 agents to 2 tools...
  ✓ code-review → .cursor/agents/code-review.md
  ✓ code-review → .claude/agents/code-review.md
  ✓ pr-summary → .cursor/agents/pr-summary.md
  ✓ pr-summary → .claude/agents/pr-summary.md

Done! Installed 2 agents.
```

## License

MIT
