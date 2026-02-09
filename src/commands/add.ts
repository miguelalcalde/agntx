import * as path from "path"
import * as fs from "fs"
import ora from "ora"
import { resolvePackage, cloneOrFetchRepo } from "../lib/git"
import {
  discoverAgents,
  findAvailableSourceRoots,
  STANDARD_SOURCE_ROOTS,
} from "../lib/discover"
import { installAgent } from "../lib/install"
import { AgentFile } from "../lib/parse"
import { AgentTool, getAgentDirs, getAllAgentTools } from "../lib/config"
import {
  selectAgents,
  selectAgentTools,
  selectSourceRoot,
  confirmAction,
} from "../utils/prompts"
import { success, error, info, formatAgentList, warn } from "../utils/output"

export interface AddOptions {
  global?: boolean
  agent?: string
  agentFile?: string
  list?: boolean
  yes?: boolean
  force?: boolean
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

    // Resolve source directory
    const availableSourceRoots = findAvailableSourceRoots(repoPath)
    let sourceRoot: string

    if (packageInfo.sourceRoot) {
      sourceRoot = packageInfo.sourceRoot
      if (!availableSourceRoots.includes(sourceRoot)) {
        spinner.fail(`Source directory not found: ${sourceRoot}`)
        warn(
          `Available source directories: ${
            availableSourceRoots.length > 0
              ? availableSourceRoots.join(", ")
              : STANDARD_SOURCE_ROOTS.join(", ")
          }`
        )
        process.exit(1)
      }
    } else {
      if (availableSourceRoots.length === 0) {
        spinner.fail("No standard agent source directories found")
        warn(`Expected one of: ${STANDARD_SOURCE_ROOTS.join(", ")}`)
        process.exit(1)
      }

      if (availableSourceRoots.length === 1) {
        sourceRoot = availableSourceRoots[0]
      } else if (options.yes) {
        spinner.fail("Multiple source directories found")
        warn(
          "Use a suffixed GitHub URL (/.agents, /.cursor, /.claude) to select one source directory."
        )
        process.exit(1)
      } else {
        spinner.stop()
        sourceRoot = await selectSourceRoot(availableSourceRoots)
        spinner.start("Discovering agents...")
      }
    }

    // Discover agents from selected source directory only
    const agents = await discoverAgents(repoPath, sourceRoot)

    if (agents.length === 0) {
      spinner.fail("No agents found in repository")
      return
    }

    spinner.succeed(
      `Found ${agents.length} agent${
        agents.length === 1 ? "" : "s"
      } in ${sourceRoot}`
    )

    // Warn on duplicate names in the selected source directory
    const nameCounts = new Map<string, number>()
    for (const agent of agents) {
      nameCounts.set(agent.name, (nameCounts.get(agent.name) || 0) + 1)
    }
    const duplicateNames = [...nameCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name)
    if (duplicateNames.length > 0) {
      warn(
        `Duplicate agent names found in source directory: ${duplicateNames.join(
          ", "
        )}`
      )
    }

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
    }:${sourceRoot}`
    const useSymlink = false // Default to copying files

    info(
      `Installing ${agentsToInstall.length} agent${
        agentsToInstall.length === 1 ? "" : "s"
      } to ${targetTools.length} tool${targetTools.length === 1 ? "" : "s"}...`
    )

    for (const agent of agentsToInstall) {
      for (const tool of targetTools) {
        const targetDir = getAgentDirs(tool, options.global || false)
        const installPath = agent.installPath || path.basename(agent.path)
        const targetPath = path.join(targetDir, installPath)
        try {
          let overwrite = true
          if (fs.existsSync(targetPath) && !options.force && !options.yes) {
            overwrite = await confirmAction(
              `${tool}: ${installPath} already exists. Overwrite?`,
              false
            )
            if (!overwrite) {
              info(`Skipped ${tool}: ${installPath}`)
              continue
            }
          }

          await installAgent(
            agent,
            repoPath,
            targetDir,
            source,
            useSymlink,
            overwrite
          )
          success(`${agent.name} → ${targetDir}/${installPath}`)
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
