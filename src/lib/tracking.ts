import * as fs from "fs"
import * as path from "path"

export interface InstalledAgent {
  source: string
  version?: string
  installedAt: string
  symlink: boolean
  path: string // relative path in source repo
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
    return JSON.parse(content)
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
  agentPath: string
): void {
  const tracking = readTracking(agentDir)

  tracking.agents[agentName] = {
    source,
    installedAt: new Date().toISOString(),
    symlink,
    path: agentPath,
  }

  writeTracking(agentDir, tracking)
}

export function removeAgentTracking(agentDir: string, agentName: string): void {
  const tracking = readTracking(agentDir)
  delete tracking.agents[agentName]
  writeTracking(agentDir, tracking)
}

export function getInstalledAgents(
  agentDir: string
): Record<string, InstalledAgent> {
  const tracking = readTracking(agentDir)
  return tracking.agents
}
