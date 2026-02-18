# Replicate Plan: `agntx` CLI

A CLI to install agent files and runtime components from GitHub repositories into local tool directories.

## Usage

```bash
npx agntx install owner/repo
npx agntx install https://github.com/owner/repo
```

---

## 1. Agent File Format

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

### File Discovery

Unlike skills (which require `SKILL.md`), agents are **any `.md` file** with valid frontmatter. The CLI should:

1. Recursively search the repository for `*.md` files
2. Parse YAML frontmatter from each file
3. Consider valid if frontmatter exists (even if all fields use defaults)
4. Use filename as `name` if not specified in frontmatter

---

## 2. Installation Directories

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

---

## 3. CLI Commands

### `install <source>` (`add` alias)

```bash
npx agntx install owner/repo
npx agntx add owner/repo
```

**Options:**
| Flag                       | Description                                                           |
| -------------------------- | --------------------------------------------------------------------- |
| `-g, --global`             | Install to user-level (`~/.<agent>/agents/`) instead of project-level |
| `-a, --agent <agents>`     | Specify target agents: `cursor`, `claude`, `codex`, or `*` for all    |
| `-s, --agent-file <names>` | Specify agent names to install (use `*` for all)                      |
| `-l, --list`               | List available agents in repo without installing                      |
| `-y, --yes`                | Skip confirmation prompts                                             |
| `--all`                    | Shorthand for `--agent-file '*' --agent '*' -y`                       |

**Flow:**
1. Parse package identifier (GitHub shorthand or full URL)
2. Clone/fetch repository to temp directory
3. Discover all valid agent `.md` files
4. If `--list`, display agents and exit
5. Prompt user to select agents (unless `-y` or `--all`)
6. Prompt user to select target agent tools (unless specified)
7. Create symlinks (dev) or copy files to target directories
8. Report success/failure

### `remove [agents]`

```bash
npx agntx remove              # interactive
npx agntx remove code-review  # by name
npx agntx rm -g my-agent      # from global
```

**Options:**
| Flag                       | Description                      |
| -------------------------- | -------------------------------- |
| `-g, --global`             | Remove from global scope         |
| `-a, --agent <agents>`     | Remove from specific agent tools |
| `-s, --agent-file <names>` | Specify agents to remove         |
| `-y, --yes`                | Skip confirmation                |
| `--all`                    | Remove all agents from all tools |

### `list, ls`

`list` (`ls`) has been removed from the shipped command surface until it is production-ready.

### `find`

`find` has been removed from the shipped command surface.

### `init [name]`

```bash
npx agntx init my-agent     # creates my-agent.md
npx agntx init              # creates agent.md in current dir
```

**Template:**
```markdown
---
name: my-agent
description: Describe when this agent should be used
model: inherit
readonly: false
is_background: false
---

You are a specialized agent that...

## Instructions

1. First, do this
2. Then, do that

## Examples

...
```

### `check`

Check for available updates to installed agent files.

### `update`

Update all installed agent files to latest versions.

---

## 4. Implementation Details

### Package Resolution

```typescript
function resolvePackage(input: string): { owner: string; repo: string; ref?: string } {
  // Handle formats:
  // - vercel-labs/agents
  // - vercel-labs/agents#branch
  // - https://github.com/vercel-labs/agents
  // - git@github.com:vercel-labs/agents.git
}
```

### Agent Discovery

```typescript
interface AgentFile {
  path: string;           // relative path in repo
  name: string;           // from frontmatter or filename
  description?: string;
  model?: string;
  readonly?: boolean;
  is_background?: boolean;
  content: string;        // full file content
}

async function discoverAgents(repoPath: string): Promise<AgentFile[]> {
  // 1. Find all *.md files recursively
  // 2. Parse YAML frontmatter from each
  // 3. Filter to valid agent files
  // 4. Return parsed metadata + content
}
```

### Frontmatter Parsing

```typescript
import matter from 'gray-matter';

function parseAgentFile(filePath: string): AgentFile | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { data, content: body } = matter(content);
  
  // Valid if has frontmatter (even empty)
  if (!data || typeof data !== 'object') return null;
  
  const name = data.name || path.basename(filePath, '.md');
  
  return {
    path: filePath,
    name,
    description: data.description,
    model: data.model || 'inherit',
    readonly: data.readonly || false,
    is_background: data.is_background || false,
    content,
  };
}
```

### Installation Strategy

**Symlinking (preferred for development):**
```typescript
async function installAgent(agent: AgentFile, targetDir: string, useSymlink: boolean) {
  const targetPath = path.join(targetDir, `${agent.name}.md`);
  
  await fs.mkdir(targetDir, { recursive: true });
  
  if (useSymlink) {
    await fs.symlink(agent.path, targetPath);
  } else {
    await fs.copyFile(agent.path, targetPath);
  }
}
```

**Tracking installed agent files:**
Store metadata in `.agntx.json` at install location:
```json
{
  "agents": {
    "code-review": {
      "source": "vercel-labs/agents",
      "version": "1.0.0",
      "installedAt": "2026-02-06T00:00:00Z",
      "symlink": true
    }
  }
}
```

### Supported Agent Tools

```typescript
const AGENT_TOOLS = {
  cursor: {
    projectDir: '.cursor/agents',
    globalDir: '~/.cursor/agents',
  },
  claude: {
    projectDir: '.claude/agents',
    globalDir: '~/.claude/agents',
  },
  codex: {
    projectDir: '.codex/agents',
    globalDir: '~/.codex/agents',
  },
} as const;
```

---

## 5. Project Structure

```
agntx/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # CLI entry point
│   ├── commands/
│   │   ├── install.ts
│   │   ├── remove.ts
│   │   ├── list.ts
│   │   ├── init.ts
│   │   ├── check.ts
│   │   └── update.ts
│   ├── lib/
│   │   ├── git.ts         # Clone/fetch repos
│   │   ├── discover.ts    # Find agent files
│   │   ├── parse.ts       # Frontmatter parsing
│   │   ├── install.ts     # Symlink/copy logic
│   │   ├── config.ts      # Agent tool paths
│   │   └── tracking.ts    # .agntx.json management
│   └── utils/
│       ├── prompts.ts     # Interactive prompts
│       └── output.ts      # Colored output
└── README.md
```

---

## 6. Dependencies

```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "gray-matter": "^4.0.3",
    "inquirer": "^9.0.0",
    "chalk": "^5.0.0",
    "ora": "^8.0.0",
    "simple-git": "^3.22.0",
    "glob": "^10.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

---

## 7. Differences from `skills` CLI

| Aspect             | `skills` CLI                                                       | `agntx` CLI                                       |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------- |
| File format        | `SKILL.md` (specific filename)                                     | Any `*.md` with frontmatter                       |
| Directory name     | `skills/`                                                          | `agents/`                                         |
| Frontmatter fields | name, description, license, compatibility, metadata, allowed-tools | name, description, model, readonly, is_background |
| Discovery          | Look for `SKILL.md` files                                          | Look for any `.md` with valid frontmatter         |
| Package name       | `skills`                                                           | `agntx`                                           |
| Install command    | `npx skills add`                                                   | `npx agntx install` (`add` alias)                 |

---

## 8. Example Session

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

---

## 9. Open Questions

1. **Registry**: Should there be a central registry (like `skills.sh`) for discovering agents?
2. **Versioning**: How to handle versions? Git tags? Package.json in repo?
3. **Updates**: How to detect if an agent has updates available?
4. **Conflicts**: What happens if two repos have agents with the same name?
5. **Validation**: Should we validate frontmatter strictly or be permissive?
