import * as fs from "fs"
import * as path from "path"
import chalk from "chalk"
import { getAgentDirs, getAllAgentTools, AgentTool } from "../lib/config"
import { getInstalledAgents } from "../lib/tracking"

export interface ListOptions {
  global?: boolean
  agent?: string
}

export async function listCommand(options: ListOptions): Promise<void> {
  try {
    const targetTools: AgentTool[] = options.agent
      ? (options.agent.split(",").map((t) => t.trim()) as AgentTool[]).filter(
          (t) => getAllAgentTools().includes(t)
        )
      : getAllAgentTools()

    const scope = options.global ? "Global" : "Project"
    const agentsByTool: Record<
      AgentTool,
      Array<{ name: string; mode: "symlink" | "copy"; description?: string }>
    > = {
      cursor: [],
      claude: [],
      codex: [],
    }

    for (const tool of targetTools) {
      const agentDir = getAgentDirs(tool, options.global || false)
      if (fs.existsSync(agentDir)) {
        const installed = getInstalledAgents(agentDir)
        for (const [installedPath, info] of Object.entries(installed)) {
          // Try to read description from the agent file
          let description: string | undefined
          const agentPath = path.join(
            agentDir,
            info.installedPath || installedPath
          )
          if (fs.existsSync(agentPath)) {
            try {
              const content = fs.readFileSync(agentPath, "utf-8")
              const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
              if (frontmatterMatch) {
                const descMatch =
                  frontmatterMatch[1].match(/description:\s*(.+)/)
                if (descMatch) {
                  description = descMatch[1].trim().replace(/^["']|["']$/g, "")
                }
              }
            } catch {
              // Ignore errors reading description
            }
          }
          agentsByTool[tool].push({
            name: info.name,
            mode: info.mode || (info.symlink ? "symlink" : "copy"),
            description,
          })
        }
      }
    }

    // Output formatted list
    console.log(`${scope} agent files:`)

    let hasAny = false
    for (const tool of targetTools) {
      const agents = agentsByTool[tool]
      if (agents.length > 0) {
        hasAny = true
        console.log(`  ${chalk.cyan(tool)}:`)
        for (const agent of agents) {
          const desc = agent.description ? `    ${agent.description}` : ""
          console.log(`    ${agent.name} [${agent.mode}]${desc}`)
        }
      }
    }

    if (!hasAny) {
      console.log(`  ${chalk.gray("(none)")}`)
    }
  } catch (err) {
    console.error(
      "Error listing agents:",
      err instanceof Error ? err.message : String(err)
    )
    process.exit(1)
  }
}
