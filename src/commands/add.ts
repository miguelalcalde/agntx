import * as path from "path"
import ora from "ora"
import { resolvePackage, cloneOrFetchRepo } from "../lib/git"
import { discoverAgents } from "../lib/discover"
import { installAgent } from "../lib/install"
import { AgentFile } from "../lib/parse"
import { AgentTool, getAgentDirs, getAllAgentTools } from "../lib/config"
import { selectAgents, selectAgentTools } from "../utils/prompts"
import { success, error, info, formatAgentList } from "../utils/output"

export interface AddOptions {
  global?: boolean
  agent?: string
  agentFile?: string
  list?: boolean
  yes?: boolean
  all?: boolean
}

export async function addCommand(
  packageInput: string,
  options: AddOptions
): Promise<void> {
  const spinner = ora("Fetching repository...").start()

  try {
    // Parse package identifier
    const packageInfo = resolvePackage(packageInput)
    spinner.text = `Fetching ${packageInfo.owner}/${packageInfo.repo}...`

    // Clone or fetch repository
    const repoPath = await cloneOrFetchRepo(packageInfo)

    spinner.text = "Discovering agents..."

    // Discover agents
    const agents = await discoverAgents(repoPath)

    if (agents.length === 0) {
      spinner.fail("No agents found in repository")
      return
    }

    spinner.succeed(
      `Found ${agents.length} agent${agents.length === 1 ? "" : "s"}`
    )

    // List mode
    if (options.list) {
      console.log("\nAvailable agents:")
      console.log(formatAgentList(agents))
      return
    }

    // Determine which agents to install
    let agentsToInstall: AgentFile[]
    if (options.all || options.agentFile === "*") {
      agentsToInstall = agents
    } else if (options.agentFile) {
      const names = options.agentFile.split(",").map((n) => n.trim())
      agentsToInstall = agents.filter((a) => names.includes(a.name))
      if (agentsToInstall.length === 0) {
        error("No matching agents found")
        return
      }
    } else if (options.yes || options.all) {
      agentsToInstall = agents
    } else {
      agentsToInstall = await selectAgents(agents)
      if (agentsToInstall.length === 0) {
        info("No agents selected")
        return
      }
    }

    // Determine target agent tools
    let targetTools: AgentTool[]
    if (options.all || options.agent === "*") {
      targetTools = getAllAgentTools()
    } else if (options.agent) {
      const tools = options.agent.split(",").map((t) => t.trim()) as AgentTool[]
      targetTools = tools.filter((t) => getAllAgentTools().includes(t))
      if (targetTools.length === 0) {
        error("Invalid agent tool specified")
        return
      }
    } else if (options.yes || options.all) {
      targetTools = getAllAgentTools()
    } else {
      targetTools = await selectAgentTools(getAllAgentTools())
      if (targetTools.length === 0) {
        info("No agent tools selected")
        return
      }
    }

    // Install agents
    const source = `${packageInfo.owner}/${packageInfo.repo}${
      packageInfo.ref ? `#${packageInfo.ref}` : ""
    }`
    const useSymlink = false // Default to copying files

    info(
      `Installing ${agentsToInstall.length} agent${
        agentsToInstall.length === 1 ? "" : "s"
      } to ${targetTools.length} tool${targetTools.length === 1 ? "" : "s"}...`
    )

    for (const agent of agentsToInstall) {
      for (const tool of targetTools) {
        const targetDir = getAgentDirs(tool, options.global || false)
        try {
          await installAgent(agent, repoPath, targetDir, source, useSymlink)
          success(`${agent.name} → ${targetDir}/${agent.name}.md`)
        } catch (err) {
          error(
            `Failed to install ${agent.name} to ${tool}: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        }
      }
    }

    success(
      `Done! Installed ${agentsToInstall.length} agent${
        agentsToInstall.length === 1 ? "" : "s"
      }.`
    )
  } catch (err) {
    spinner.fail(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
