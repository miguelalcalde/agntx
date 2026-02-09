import inquirer from "inquirer"
import { AgentFile } from "../lib/parse"
import { AgentTool } from "../lib/config"
import type { InstallMode } from "../lib/install"
import type { InstallScope } from "../lib/preferences"

export async function selectAgents(agents: AgentFile[]): Promise<AgentFile[]> {
  const choices = agents.map((agent) => {
    const choice: {
      name: string
      value: AgentFile
      short?: string
    } = {
      name: agent.name,
      value: agent,
    }

    if (agent.description) {
      choice.short = `${agent.name} - ${agent.description}`
    }

    return choice
  })

  const { selected } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selected",
      message: "Select agents to install:",
      choices,
      pageSize: 20,
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
