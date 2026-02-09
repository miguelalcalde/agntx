import inquirer from "inquirer"
import chalk from "chalk"
import { AgentFile } from "../lib/parse"
import { AgentTool } from "../lib/config"
import type { InstallMode } from "../lib/install"
import type { InstallScope } from "../lib/preferences"

function truncateText(value: string, maxLength: number): string {
  if (maxLength <= 0) {
    return ""
  }
  if (value.length <= maxLength) {
    return value
  }
  if (maxLength <= 3) {
    return value.slice(0, maxLength)
  }
  return `${value.slice(0, maxLength - 3)}...`
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function getAgentBadges(agent: AgentFile): string[] {
  const badges: string[] = []
  if (agent.model && agent.model !== "inherit") {
    badges.push(`[${agent.model}]`)
  }
  if (agent.readonly) {
    badges.push("[RO]")
  }
  if (agent.is_background) {
    badges.push("[BG]")
  }
  return badges
}

function formatAgentChoiceLine(agent: AgentFile): string {
  const width = Math.max(process.stdout.columns || 100, 80)
  const nameWidth = Math.max(18, Math.min(30, Math.floor(width * 0.24)))
  const badges = getAgentBadges(agent)
  const badgeText = badges.length > 0 ? ` ${badges.join(" ")}` : ""
  const desc = compactWhitespace(agent.description || "No description")

  // Reserve room for inquirer cursor/checkbox and minimal spacing.
  const contentWidth = Math.max(width - 18, 40)
  const descWidth = Math.max(contentWidth - nameWidth - badgeText.length - 2, 12)

  const compactName = truncateText(agent.name, nameWidth).padEnd(nameWidth, " ")
  const compactDesc = truncateText(desc, descWidth)

  return `${compactName} ${compactDesc}${badgeText}`
}

export async function selectAgents(agents: AgentFile[]): Promise<AgentFile[]> {
  const pageSize = Math.min(Math.max(agents.length + 2, 8), 20)
  const choices = agents.map((agent) => {
    const choice: {
      name: string
      value: AgentFile
      short?: string
    } = {
      name: `${chalk.dim("│")} ${formatAgentChoiceLine(agent)}`,
      value: agent,
      short: agent.name,
    }

    return choice
  })

  const { selected } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selected",
      prefix: chalk.dim("│"),
      message: `${chalk.cyan("◆")} Select agents to install ${chalk.dim(
        "(space to toggle)"
      )}`,
      choices,
      pageSize,
    },
  ])

  return selected
}

export async function selectAgentTools(
  availableTools: AgentTool[],
  defaultTools: AgentTool[] = availableTools
): Promise<AgentTool[]> {
  const toolLabels: Record<AgentTool, string> = {
    cursor: "cursor",
    claude: "claude code",
    codex: "codex",
  }
  const defaults = defaultTools.filter((tool) => availableTools.includes(tool))
  const choices: Array<{
    name: string
    value: AgentTool | string
    disabled?: string
  }> = availableTools.map((tool) => ({
    name: toolLabels[tool] || tool,
    value: tool,
  }))
  choices.push(
    {
      name: "openclaw (coming soon)",
      value: "openclaw",
      disabled: "coming soon",
    },
    {
      name: "cline (coming soon)",
      value: "cline",
      disabled: "coming soon",
    }
  )

  const { selected } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selected",
      message: "Select target agent tools:",
      choices,
      default: defaults.length > 0 ? defaults : availableTools,
      pageSize: 10,
    },
  ])

  return selected
}

export async function confirmAction(
  message: string,
  defaultValue: boolean = false
): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmed",
      message,
      default: defaultValue,
    },
  ])

  return confirmed
}

export async function selectAgentsToRemove(
  agentNames: string[]
): Promise<string[]> {
  const choices = agentNames.map((name) => ({
    name,
    value: name,
  }))

  const { selected } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selected",
      message: "Select agents to remove:",
      choices,
    },
  ])

  return selected
}

export async function searchQuery(): Promise<string> {
  const { query } = await inquirer.prompt([
    {
      type: "input",
      name: "query",
      message: "Search for agents:",
    },
  ])

  return query
}

export async function selectSourceRoot(sourceRoots: string[]): Promise<string> {
  const { selected } = await inquirer.prompt([
    {
      type: "list",
      name: "selected",
      message: "Multiple source directories found. Select one:",
      choices: sourceRoots.map((root) => ({ name: root, value: root })),
    },
  ])

  return selected
}

export async function selectInstallMode(
  defaultMode: InstallMode = "symlink"
): Promise<InstallMode> {
  const { selected } = await inquirer.prompt([
    {
      type: "list",
      name: "selected",
      message: "Select install mode:",
      choices: [
        { name: "symlink (recommended)", value: "symlink" },
        { name: "copy", value: "copy" },
      ],
      default: defaultMode,
    },
  ])

  return selected
}

export async function selectInstallationScope(
  defaultScope: InstallScope = "project"
): Promise<InstallScope> {
  const { selected } = await inquirer.prompt([
    {
      type: "list",
      name: "selected",
      message: "Select installation scope:",
      choices: [
        {
          name: "Project (Install in current directory) (recommended)",
          value: "project",
        },
        {
          name: "Global (Install for all projects)",
          value: "global",
        },
      ],
      default: defaultScope,
    },
  ])

  return selected
}

export async function confirmInstallPlan(summaryLines: string[]): Promise<boolean> {
  const summary = summaryLines.map((line) => `  - ${line}`).join("\n")
  return confirmAction(
    `Proceed with installation?\n\n${summary}\n`,
    true
  )
}
