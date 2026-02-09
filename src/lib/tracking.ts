import * as fs from "fs"
import * as path from "path"

export interface InstalledAgent {
  name: string
  source: string
  version?: string
  installedAt: string
  symlink: boolean
  path: string // relative path in source repo
  installedPath: string // relative path in target agent dir
}

export interface TrackingData {
  agents: Record<string, InstalledAgent>
}

const TRACKING_FILE = ".agntx.json"

export function getTrackingPath(agentDir: string): string {
  return path.join(agentDir, TRACKING_FILE)
}

export function readTracking(agentDir: string): TrackingData {
  const trackingPath = getTrackingPath(agentDir)

  if (!fs.existsSync(trackingPath)) {
    return { agents: {} }
  }

  try {
    const content = fs.readFileSync(trackingPath, "utf-8")
    const parsed = JSON.parse(content) as TrackingData
    const normalized: TrackingData = { agents: {} }

    // Backward compatibility: old keys were agent names with flat files.
    for (const [key, value] of Object.entries(parsed.agents || {})) {
      normalized.agents[value.installedPath || `${key}.md`] = {
        ...value,
        name: value.name || key,
        installedPath: value.installedPath || `${key}.md`,
      }
    }

    return normalized
  } catch (error) {
    return { agents: {} }
  }
}

export function writeTracking(agentDir: string, data: TrackingData): void {
  const trackingPath = getTrackingPath(agentDir)

  // Ensure directory exists
  fs.mkdirSync(agentDir, { recursive: true })

  fs.writeFileSync(trackingPath, JSON.stringify(data, null, 2) + "\n")
}

export function addAgentTracking(
  agentDir: string,
  agentName: string,
  source: string,
  symlink: boolean,
  agentPath: string,
  installedPath: string
): void {
  const tracking = readTracking(agentDir)

  tracking.agents[installedPath] = {
    name: agentName,
    source,
    installedAt: new Date().toISOString(),
    symlink,
    path: agentPath,
    installedPath,
  }

  writeTracking(agentDir, tracking)
}

export function removeAgentTracking(agentDir: string, installedPath: string): void {
  const tracking = readTracking(agentDir)
  delete tracking.agents[installedPath]
  writeTracking(agentDir, tracking)
}

export function getInstalledAgents(
  agentDir: string
): Record<string, InstalledAgent> {
  const tracking = readTracking(agentDir)
  return tracking.agents
}
