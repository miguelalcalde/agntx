import * as path from "path"
import * as fs from "fs"
import ora from "ora"
import chalk from "chalk"
import { resolvePackage, cloneOrFetchRepo } from "../lib/git"
import {
  discoverAgents,
  findAvailableSourceRoots,
  STANDARD_SOURCE_ROOTS,
} from "../lib/discover"
import {
  installAgent,
  materializeAgentFile,
  type InstallMode,
} from "../lib/install"
import { AgentFile } from "../lib/parse"
import {
  AgentTool,
  getAgentDirs,
  getAllAgentTools,
  getCanonicalAgentDir,
} from "../lib/config"
import {
  getPreferencesPath,
  readInstallPreferences,
  writeInstallPreferences,
  type InstallScope,
} from "../lib/preferences"
import {
  selectAgents,
  selectAgentTools,
  selectSourceRoot,
  selectInstallMode,
  selectInstallationScope,
  confirmInstallPlan,
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
  mode?: string
  symlink?: boolean
}

function parseInstallMode(mode: string): InstallMode | null {
  if (mode === "symlink" || mode === "copy") {
    return mode
  }
  return null
}

function traceStep(message: string, active: boolean = false): void {
  const marker = active ? chalk.cyan("◆") : chalk.green("◇")
  console.log(`${marker} ${message}`)
}

function traceRail(): void {
  console.log(chalk.dim("│"))
}

export async function addCommand(
  packageInput: string,
  options: AddOptions
): Promise<void> {
  const spinner = ora()

  try {
    traceRail()

    // Parse package identifier
    const packageInfo = resolvePackage(packageInput)
    const sourceUrl = `https://github.com/${packageInfo.owner}/${packageInfo.repo}.git${
      packageInfo.ref ? `#${packageInfo.ref}` : ""
    }`
    traceStep(`Source: ${sourceUrl}`)
    traceRail()

    // Clone or fetch repository (sparse to agent source directories).
    spinner.start(`Cloning ${packageInfo.owner}/${packageInfo.repo}...`)
    const sparsePaths = packageInfo.sourceRoot
      ? [packageInfo.sourceRoot]
      : STANDARD_SOURCE_ROOTS
    const repoPath = await cloneOrFetchRepo(packageInfo, sparsePaths)
    spinner.stop()
    traceStep("Repository cloned")
    traceRail()

    spinner.start("Discovering agents...")

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

    spinner.stop()
    traceStep(
      `Found ${agents.length} agent${
        agents.length === 1 ? "" : "s"
      } in ${sourceRoot}`
    )
    traceRail()

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
    const cachedPreferences = readInstallPreferences()

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
    const allTools = getAllAgentTools()
    if (options.all || options.agent === "*") {
      targetTools = allTools
    } else if (options.agent) {
      const tools = options.agent.split(",").map((t) => t.trim()) as AgentTool[]
      targetTools = tools.filter((t) => allTools.includes(t))
      if (targetTools.length === 0) {
        error("Invalid agent tool specified")
        return
      }
    } else if (options.yes || options.all) {
      targetTools = allTools
    } else {
      const defaultTools = cachedPreferences?.defaultTools?.filter((tool) =>
        allTools.includes(tool)
      )
      targetTools = await selectAgentTools(
        allTools,
        defaultTools && defaultTools.length > 0 ? defaultTools : allTools
      )
      if (targetTools.length === 0) {
        info("No agent tools selected")
        return
      }
    }

    // Determine installation scope independently from selected tools and mode
    let installScope: InstallScope
    if (options.global) {
      installScope = "global"
    } else if (options.yes || options.all) {
      installScope = "project"
    } else {
      installScope = await selectInstallationScope(
        cachedPreferences?.defaultScope || "project"
      )
    }
    const isGlobalInstall = installScope === "global"

    // Determine install mode independently from target tool selection
    let installMode: InstallMode
    if (options.mode) {
      const parsedMode = parseInstallMode(options.mode.toLowerCase())
      if (!parsedMode) {
        error(`Invalid install mode: ${options.mode}. Use "symlink" or "copy".`)
        return
      }
      installMode = parsedMode
    } else if (options.symlink === false) {
      installMode = "copy"
    } else if (options.yes || options.all) {
      installMode = "symlink"
    } else {
      installMode = await selectInstallMode(
        cachedPreferences?.defaultMode || "symlink"
      )
    }

    // Install agents
    const source = `${packageInfo.owner}/${packageInfo.repo}${
      packageInfo.ref ? `#${packageInfo.ref}` : ""
    }:${sourceRoot}`
    const canonicalDir = getCanonicalAgentDir(isGlobalInstall)
    const scopeLabel = isGlobalInstall ? "global" : "project"

    if (!options.yes && !options.all) {
      const selectedAgentNames = agentsToInstall.map((agent) => agent.name)
      const summarizedAgentNames =
        selectedAgentNames.length > 5
          ? `${selectedAgentNames.slice(0, 5).join(", ")} +${
              selectedAgentNames.length - 5
            } more`
          : selectedAgentNames.join(", ")

      const shouldProceed = await confirmInstallPlan([
        `Source: ${source}`,
        `Agents (${agentsToInstall.length}): ${summarizedAgentNames}`,
        `Tools: ${targetTools.join(", ")}`,
        `Scope: ${scopeLabel}`,
        `Install mode: ${installMode}`,
        `Canonical directory: ${canonicalDir}`,
      ])

      if (!shouldProceed) {
        info("Installation cancelled")
        return
      }
    }

    info(
      `Installing ${agentsToInstall.length} agent${
        agentsToInstall.length === 1 ? "" : "s"
      } using ${installMode} mode to ${targetTools.length} tool${
        targetTools.length === 1 ? "" : "s"
      } (${scopeLabel} scope)...`
    )

    let installedCount = 0
    let failedCount = 0
    let skippedCount = 0
    let canonicalFailureCount = 0
    let canonicalSkippedCount = 0
    const toolStats = new Map<
      AgentTool,
      { installed: number; failed: number; skipped: number }
    >()
    for (const tool of targetTools) {
      toolStats.set(tool, { installed: 0, failed: 0, skipped: 0 })
    }

    for (const agent of agentsToInstall) {
      const installPath = agent.installPath || path.basename(agent.path)
      const sourcePath = path.join(repoPath, agent.path)
      const canonicalPath = path.join(canonicalDir, installPath)

      try {
        let overwriteCanonical = true
        if (fs.existsSync(canonicalPath) && !options.force && !options.yes) {
          overwriteCanonical = await confirmAction(
            `canonical: ${installPath} already exists. Overwrite?`,
            false
          )
        }
        if (!overwriteCanonical) {
          info(`Skipped canonical: ${installPath}`)
          canonicalSkippedCount++
          skippedCount += targetTools.length
          for (const tool of targetTools) {
            const stats = toolStats.get(tool)
            if (stats) {
              stats.skipped++
            }
          }
          continue
        }

        // Canonical files are always concrete files, never symlinks.
        await materializeAgentFile(
          sourcePath,
          canonicalDir,
          installPath,
          "copy",
          overwriteCanonical
        )
      } catch (err) {
        error(
          `Failed to materialize canonical file for ${agent.name}: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
        canonicalFailureCount++
        failedCount += targetTools.length
        for (const tool of targetTools) {
          const stats = toolStats.get(tool)
          if (stats) {
            stats.failed++
          }
        }
        continue
      }

      for (const tool of targetTools) {
        const targetDir = getAgentDirs(tool, isGlobalInstall)
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
              skippedCount++
              const stats = toolStats.get(tool)
              if (stats) {
                stats.skipped++
              }
              continue
            }
          }

          await installAgent({
            agent,
            sourcePath: canonicalPath,
            targetDir,
            source,
            mode: installMode,
            canonicalPath,
            overwrite
          })
          success(`${agent.name} → ${targetDir}/${installPath}`)
          installedCount++
          const stats = toolStats.get(tool)
          if (stats) {
            stats.installed++
          }
        } catch (err) {
          failedCount++
          const stats = toolStats.get(tool)
          if (stats) {
            stats.failed++
          }
          error(
            `Failed to install ${agent.name} to ${tool}: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        }
      }
    }

    success(
      `Done! Installed ${installedCount} agent file${
        installedCount === 1 ? "" : "s"
      }.`
    )
    info(`Summary: ${installedCount} installed, ${failedCount} failed, ${skippedCount} skipped.`)
    for (const tool of targetTools) {
      const stats = toolStats.get(tool)
      if (!stats) {
        continue
      }
      info(
        `${tool}: ${stats.installed} installed, ${stats.failed} failed, ${stats.skipped} skipped`
      )
    }
    if (canonicalFailureCount > 0 || canonicalSkippedCount > 0) {
      info(
        `Canonical: ${canonicalFailureCount} failed, ${canonicalSkippedCount} skipped`
      )
    }

    if (installedCount > 0) {
      try {
        writeInstallPreferences({
          defaultTools: targetTools,
          defaultScope: installScope,
          defaultMode: installMode,
        })
        info(`Saved install defaults to ${getPreferencesPath()}`)
      } catch (err) {
        warn(
          `Could not save install defaults: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      }
    }
  } catch (err) {
    spinner.fail(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
