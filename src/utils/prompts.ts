import inquirer from "inquirer"
import { AgentFile } from "../lib/parse"
import { AgentTool } from "../lib/config"
import type { InstallMode } from "../lib/install"

export async function selectAgents(agents: AgentFile[]): Promise<AgentFile[]> {
  const choices = agents.map((agent) => ({
    name: `${agent.name}${agent.description ? ` - ${agent.description}` : ""}`,
    value: agent,
  }))

  const { selected } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selected",
      message: "Select agents to install:",
      choices,
    },
  ])

  return selected
}

export async function selectAgentTools(
  availableTools: AgentTool[]
): Promise<AgentTool[]> {
  const choices = availableTools.map((tool) => ({
    name: tool,
    value: tool,
  }))

  const { selected } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selected",
      message: "Select target agent tools:",
      choices,
      default: availableTools,
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

export async function selectInstallMode(): Promise<InstallMode> {
  const { selected } = await inquirer.prompt([
    {
      type: "list",
      name: "selected",
      message: "Select install mode:",
      choices: [
        { name: "symlink (recommended)", value: "symlink" },
        { name: "copy", value: "copy" },
      ],
      default: "symlink",
    },
  ])

  return selected
}
