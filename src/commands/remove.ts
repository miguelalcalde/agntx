import * as fs from "fs"
import { getAgentDirs, getAllAgentTools, AgentTool } from "../lib/config"
import { getInstalledAgents } from "../lib/tracking"
import { uninstallAgent } from "../lib/install"
import { selectAgentsToRemove, confirmAction } from "../utils/prompts"
import { success, error, info } from "../utils/output"

export interface RemoveOptions {
  global?: boolean
  agent?: string
  agentFile?: string
  yes?: boolean
  all?: boolean
}

export async function removeCommand(
  agentNames: string[],
  options: RemoveOptions
): Promise<void> {
  try {
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

    // Collect all installed agents
    const allInstalledAgents: Array<{
      name: string
      installedPath: string
      tool: AgentTool
      dir: string
    }> = []

    for (const tool of targetTools) {
      const agentDir = getAgentDirs(tool, options.global || false)
      if (fs.existsSync(agentDir)) {
        const installed = getInstalledAgents(agentDir)
        for (const [installedPath, installedAgent] of Object.entries(installed)) {
          allInstalledAgents.push({
            name: installedAgent.name,
            installedPath: installedAgent.installedPath || installedPath,
            tool,
            dir: agentDir,
          })
        }
      }
    }

    if (allInstalledAgents.length === 0) {
      info("No agents installed")
      return
    }

    // Determine which agents to remove
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
        info("No agents selected")
        return
      }
    }

    const entriesToRemove = options.all
      ? allInstalledAgents
      : allInstalledAgents.filter((entry) => selectedNames.includes(entry.name))

    if (entriesToRemove.length === 0) {
      info("No matching installed agents found")
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

    // Remove agents
    let removedCount = 0
    for (const entry of entriesToRemove) {
      const removed = await uninstallAgent(entry.installedPath, entry.dir)
      if (removed) {
        success(`Removed ${entry.name} from ${entry.tool} (${entry.installedPath})`)
        removedCount++
      }
    }

    if (removedCount > 0) {
      success(
        `Done! Removed ${removedCount} agent${removedCount === 1 ? "" : "s"}.`
      )
    } else {
      info("No agents were removed")
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
