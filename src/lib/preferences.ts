import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { AgentTool, getAllAgentTools } from "./config"
import type { InstallMode } from "./install"

export type InstallScope = "project" | "global"

export interface InstallPreferences {
  defaultTools: AgentTool[]
  defaultScope: InstallScope
  defaultMode: InstallMode
  updatedAt: string
}

const PREFERENCES_PATH = path.join(os.homedir(), ".agntx", "preferences.json")

function isInstallScope(value: unknown): value is InstallScope {
  return value === "project" || value === "global"
}

function isInstallMode(value: unknown): value is InstallMode {
  return value === "symlink" || value === "copy"
}

function normalizeTools(value: unknown): AgentTool[] {
  if (!Array.isArray(value)) {
    return []
  }

  const validTools = new Set(getAllAgentTools())
  const normalized = value.filter(
    (tool): tool is AgentTool =>
      typeof tool === "string" && validTools.has(tool as AgentTool)
  )

  return Array.from(new Set(normalized))
}

export function getPreferencesPath(): string {
  return PREFERENCES_PATH
}

export function readInstallPreferences(): InstallPreferences | null {
  if (!fs.existsSync(PREFERENCES_PATH)) {
    return null
  }

  try {
    const content = fs.readFileSync(PREFERENCES_PATH, "utf-8")
    const parsed = JSON.parse(content) as Partial<InstallPreferences>

    const defaultTools = normalizeTools(parsed.defaultTools)
    if (defaultTools.length === 0) {
      return null
    }

    if (!isInstallScope(parsed.defaultScope) || !isInstallMode(parsed.defaultMode)) {
      return null
    }

    return {
      defaultTools,
      defaultScope: parsed.defaultScope,
      defaultMode: parsed.defaultMode,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function writeInstallPreferences(
  preferences: Omit<InstallPreferences, "updatedAt">
): void {
  const normalizedTools = Array.from(new Set(preferences.defaultTools)).filter(
    (tool) => getAllAgentTools().includes(tool)
  )

  if (normalizedTools.length === 0) {
    return
  }

  const payload: InstallPreferences = {
    defaultTools: normalizedTools,
    defaultScope: preferences.defaultScope,
    defaultMode: preferences.defaultMode,
    updatedAt: new Date().toISOString(),
  }

  fs.mkdirSync(path.dirname(PREFERENCES_PATH), { recursive: true })
  fs.writeFileSync(PREFERENCES_PATH, JSON.stringify(payload, null, 2) + "\n")
}
