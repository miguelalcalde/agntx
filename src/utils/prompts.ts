import inquirer from "inquirer"
import chalk from "chalk"
import { createRequire } from "module"
import { AgentFile } from "../lib/parse"
import { AgentTool } from "../lib/config"
import type { InstallMode } from "../lib/install"
import type { InstallScope } from "../lib/preferences"

const requireFromInquirer = createRequire(
  require.resolve("inquirer/package.json")
)
const inquirerFigures = requireFromInquirer("figures") as {
  pointer: string
  radioOn: string
  radioOff: string
}
const BaseCheckboxPrompt: any = requireFromInquirer("inquirer/lib/prompts/checkbox")
let hasRegisteredAgentCheckboxPrompt = false

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
  badges.push(`[${agent.model || "inherit"}]`)
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
  const maxNameWidth = Math.max(12, Math.min(26, Math.floor(width * 0.28)))
  const badges = getAgentBadges(agent).join(" ")
  const compactName = truncateText(agent.name, maxNameWidth)
  return `${compactName} ${badges}`
}

function renderCheckboxChoices(choices: any, pointer: number): string {
  let output = ""
  let separatorOffset = 0

  choices.forEach((choice: any, i: number) => {
    if (choice.type === "separator") {
      separatorOffset++
      output += ` ${choice}\n`
      return
    }

    if (choice.disabled) {
      separatorOffset++
      output += ` - ${choice.name}`
      output += ` (${typeof choice.disabled === "string" ? choice.disabled : "Disabled"})`
      output += "\n"
      return
    }

    const line = `${getCheckbox(choice.checked)} ${choice.name}`
    if (i - separatorOffset === pointer) {
      output += chalk.cyan(` ${line}\n`)
    } else {
      output += ` ${line}\n`
    }
  })

  return output.replace(/\n$/, "")
}

function getCheckbox(checked: boolean): string {
  return checked ? chalk.green(inquirerFigures.radioOn) : inquirerFigures.radioOff
}

function getRealIndexPosition(choices: any, pointer: number): number {
  const selectedChoice = choices.getChoice(pointer)
  const indexPosition = choices.indexOf(selectedChoice)

  return (
    choices.reduce((acc: number, value: any, i: number) => {
      if (i > indexPosition) {
        return acc
      }
      if (value.type === "separator") {
        return acc + 1
      }
      if (typeof value.name !== "string") {
        return acc + 1
      }
      return acc + value.name.split("\n").length
    }, 0) - 1
  )
}

class AgentCheckboxPrompt extends BaseCheckboxPrompt {
  private showDetails = false
  private keypressHandler: ((_: string, key: { sequence?: string }) => void) | null =
    null

  _run(cb: (value: AgentFile[]) => void): this {
    const runner = super._run(cb) as this
    this.keypressHandler = (_: string, key: { sequence?: string }) => {
      if (this.status === "answered") {
        return
      }
      if (key?.sequence === "?") {
        this.showDetails = !this.showDetails
        this.render()
      }
    }
    this.rl.input.on("keypress", this.keypressHandler)
    return runner
  }

  onEnd(state: { value: AgentFile[] }): void {
    this.cleanupKeypressHandler()
    super.onEnd(state)
  }

  render(error?: string): void {
    let message = this.getQuestion()
    let bottomContent = ""

    if (!this.dontShowHints) {
      message +=
        `(Press ${chalk.cyan.bold("<space>")} to select, ${chalk.cyan.bold("<a>")} to toggle all, ${chalk.cyan.bold("<i>")} to invert selection, ${chalk.cyan.bold("<?>")} for details, and ${chalk.cyan.bold("<enter>")} to proceed)`
    }

    if (this.status === "answered") {
      message += chalk.cyan(this.selection.join(", "))
    } else {
      const choicesStr = renderCheckboxChoices(this.opt.choices, this.pointer)
      const realIndexPosition = getRealIndexPosition(this.opt.choices, this.pointer)
      message +=
        "\n" +
        this.paginator.paginate(choicesStr, realIndexPosition, this.opt.pageSize)

      if (this.showDetails) {
        const currentChoice = this.opt.choices.getChoice(this.pointer) as {
          description?: string
        }
        const description = compactWhitespace(
          currentChoice?.description || "No description provided."
        )
        bottomContent = `${chalk.dim("│")} ${chalk.cyan("Description")}: ${description}`
      }
    }

    if (error) {
      const err = `${chalk.red(">>")} ${error}`
      bottomContent = bottomContent ? `${bottomContent}\n${err}` : err
    }

    this.screen.render(message, bottomContent)
  }

  private cleanupKeypressHandler(): void {
    if (this.keypressHandler) {
      this.rl.input.removeListener("keypress", this.keypressHandler)
      this.keypressHandler = null
    }
  }
}

function ensureAgentCheckboxPromptRegistered(): void {
  if (hasRegisteredAgentCheckboxPrompt) {
    return
  }
  ;(inquirer as any).registerPrompt("agent-checkbox", AgentCheckboxPrompt)
  hasRegisteredAgentCheckboxPrompt = true
}

export async function selectAgents(agents: AgentFile[]): Promise<AgentFile[]> {
  ensureAgentCheckboxPromptRegistered()
  const pageSize = Math.min(Math.max(agents.length + 2, 8), 20)
  const choices = agents.map((agent) => {
    const choice: {
      name: string
      value: AgentFile
      short?: string
      description?: string
    } = {
      name: formatAgentChoiceLine(agent),
      value: agent,
      short: agent.name,
      description: compactWhitespace(agent.description || ""),
    }

    return choice
  })

  const previousPointer = inquirerFigures.pointer
  inquirerFigures.pointer = " "

  let selected: AgentFile[] = []
  try {
    const result = await inquirer.prompt([
      {
        type: "agent-checkbox",
        name: "selected",
        prefix: chalk.dim("│"),
        message: `${chalk.cyan("◆")} Select agents to install`,
        choices,
        pageSize,
      },
    ])
    selected = result.selected as AgentFile[]
  } finally {
    inquirerFigures.pointer = previousPointer
  }

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
  // Reserved for future tools:
  // choices.push(
  //   { name: "openclaw (coming soon)", value: "openclaw", disabled: "coming soon" },
  //   { name: "cline (coming soon)", value: "cline", disabled: "coming soon" }
  // )

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

export async function confirmInstallPlan(
  summaryLines: string[]
): Promise<boolean> {
  const summary = summaryLines.map((line) => `  - ${line}`).join("\n")
  return confirmAction(`Proceed with installation?\n\n${summary}\n`, true)
}
