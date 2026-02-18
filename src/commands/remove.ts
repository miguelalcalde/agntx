import * as fs from "fs"
import * as path from "path"
import {
  getAgentDirs,
  getAllAgentTools,
  AgentTool,
  getCanonicalAgentDir,
} from "../lib/config"
import { getInstalledAgents } from "../lib/tracking"
import { uninstallAgent } from "../lib/install"
import { selectAgentsToRemove, confirmAction } from "../utils/prompts"
import { success, error, info, warn } from "../utils/output"

export interface RemoveOptions {
  global?: boolean
  agent?: string
  agentFile?: string
  yes?: boolean
  all?: boolean
}

interface InstalledEntry {
  name: string
  installedPath: string
  tool: AgentTool
  dir: string
  canonicalPath?: string
}

function collectInstalledEntries(
  tools: AgentTool[],
  global: boolean
): InstalledEntry[] {
  const entries: InstalledEntry[] = []

  for (const tool of tools) {
    const agentDir = getAgentDirs(tool, global)
    if (!fs.existsSync(agentDir)) {
      continue
    }

    const installed = getInstalledAgents(agentDir)
    for (const [installedPath, installedAgent] of Object.entries(installed)) {
      entries.push({
        name: installedAgent.name,
        installedPath: installedAgent.installedPath || installedPath,
        tool,
        dir: agentDir,
        canonicalPath: installedAgent.canonicalPath,
      })
    }
  }

  return entries
}

function isCanonicalPathReferenced(
  canonicalPath: string,
  global: boolean
): boolean {
  const canonicalFullPath = path.resolve(canonicalPath)

  for (const tool of getAllAgentTools()) {
    const agentDir = getAgentDirs(tool, global)
    if (!fs.existsSync(agentDir)) {
      continue
    }

    const installed = getInstalledAgents(agentDir)
    for (const info of Object.values(installed)) {
      if (!info.canonicalPath) {
        continue
      }
      if (path.resolve(info.canonicalPath) === canonicalFullPath) {
        return true
      }
    }
  }

  return false
}

async function pruneEmptyCanonicalDirs(
  fromPath: string,
  canonicalRoot: string
): Promise<void> {
  let currentDir = path.dirname(fromPath)
  while (currentDir.startsWith(canonicalRoot) && currentDir !== canonicalRoot) {
    const entries = await fs.promises.readdir(currentDir)
    if (entries.length > 0) {
      break
    }
    await fs.promises.rmdir(currentDir)
    currentDir = path.dirname(currentDir)
  }
}

async function removeCanonicalIfUnreferenced(
  canonicalPath: string,
  global: boolean
): Promise<boolean> {
  const canonicalRoot = path.resolve(getCanonicalAgentDir(global))
  const canonicalFullPath = path.resolve(canonicalPath)

  if (
    canonicalFullPath !== canonicalRoot &&
    !canonicalFullPath.startsWith(`${canonicalRoot}${path.sep}`)
  ) {
    warn(`Skipped deleting out-of-scope canonical path: ${canonicalPath}`)
    return false
  }

  if (!fs.existsSync(canonicalFullPath)) {
    return false
  }

  await fs.promises.unlink(canonicalFullPath)
  await pruneEmptyCanonicalDirs(canonicalFullPath, canonicalRoot)
  return true
}

export async function removeCommand(
  agentNames: string[],
  options: RemoveOptions
): Promise<void> {
  try {
    const globalScope = options.global || false

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
    } else {
      targetTools = getAllAgentTools()
    }

    // Collect all installed agent files
    const allInstalledAgents = collectInstalledEntries(targetTools, globalScope)

    if (allInstalledAgents.length === 0) {
      info("No agent files installed")
      return
    }

    // Determine which agent files to remove
    let selectedNames: string[]
    if (options.all) {
      selectedNames = [...new Set(allInstalledAgents.map((a) => a.name))]
    } else if (options.agentFile) {
      const names = options.agentFile.split(",").map((n) => n.trim())
      selectedNames = names
    } else if (agentNames.length > 0) {
      selectedNames = agentNames
    } else {
      const uniqueNames = [...new Set(allInstalledAgents.map((a) => a.name))]
      selectedNames = await selectAgentsToRemove(uniqueNames)
      if (selectedNames.length === 0) {
        info("No agent files selected")
        return
      }
    }

    const entriesToRemove = options.all
      ? allInstalledAgents
      : allInstalledAgents.filter((entry) => selectedNames.includes(entry.name))

    if (entriesToRemove.length === 0) {
      info("No matching installed agent files found")
      return
    }

    // Confirm removal
    if (!options.yes && !options.all) {
      const confirmed = await confirmAction(
        `Remove ${entriesToRemove.length} installed agent file${
          entriesToRemove.length === 1 ? "" : "s"
        }?`,
        false
      )
      if (!confirmed) {
        info("Cancelled")
        return
      }
    }

    // Remove agent files
    let removedCount = 0
    for (const entry of entriesToRemove) {
      const removed = await uninstallAgent(entry.installedPath, entry.dir)
      if (removed) {
        success(
          `Removed ${entry.name} from ${entry.tool} (${entry.installedPath})`
        )
        removedCount++

        if (entry.canonicalPath) {
          const hasReferences = isCanonicalPathReferenced(
            entry.canonicalPath,
            globalScope
          )
          if (!hasReferences) {
            const removedCanonical = await removeCanonicalIfUnreferenced(
              entry.canonicalPath,
              globalScope
            )
            if (removedCanonical) {
              info(`Removed canonical file (${entry.canonicalPath})`)
            }
          }
        }
      }
    }

    if (removedCount > 0) {
      success(
        `Done! Removed ${removedCount} agent file${
          removedCount === 1 ? "" : "s"
        }.`
      )
    } else {
      info("No agent files were removed")
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
