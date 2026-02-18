import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import chalk from "chalk"
import { ScopeName, getCanonicalRoot, resolveBaseDir } from "../lib/layout"
import { error, warn } from "../utils/output"

export interface StatusCommandOptions {
  global?: boolean
  local?: boolean
  path?: string
  json?: boolean
}

function resolveScope(options: StatusCommandOptions): {
  scope: ScopeName
  scopePath?: string
} {
  if (options.path) {
    return { scope: "path", scopePath: options.path }
  }
  return { scope: "local" }
}

type ComponentName = "agents" | "skills" | "commands"

interface InstalledEntry {
  name: string
  path: string
  symlink: boolean
  symlinkTarget?: string
}

interface ToolView {
  project: Record<ComponentName, InstalledEntry[]>
  global: Record<ComponentName, InstalledEntry[]>
  effective: Record<ComponentName, InstalledEntry[]>
}

const TOOLS = [
  { name: "claude", dir: ".claude" },
  { name: "cursor", dir: ".cursor" },
  { name: "codex", dir: ".codex" },
  { name: "opencode", dir: ".opencode" },
] as const

const ICONS: Record<ComponentName, string> = {
  commands: "󰘳",
  agents: "󰚩",
  skills: "",
}

function scanMarkdownEntries(dirPath: string): InstalledEntry[] {
  if (!fs.existsSync(dirPath)) {
    return []
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  const result: InstalledEntry[] = []
  for (const entry of entries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) {
      continue
    }
    if (!entry.name.endsWith(".md")) {
      continue
    }
    const fullPath = path.join(dirPath, entry.name)
    let symlink = false
    let symlinkTarget: string | undefined
    try {
      symlink = fs.lstatSync(fullPath).isSymbolicLink()
      if (symlink) {
        symlinkTarget = fs.readlinkSync(fullPath)
      }
    } catch {
      symlink = false
    }
    result.push({
      name: path.basename(entry.name, ".md"),
      path: fullPath,
      symlink,
      symlinkTarget,
    })
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

function scanSkillEntries(dirPath: string): InstalledEntry[] {
  if (!fs.existsSync(dirPath)) {
    return []
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  const result: InstalledEntry[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue
    }
    const fullPath = path.join(dirPath, entry.name)
    const skillFile = path.join(fullPath, "SKILL.md")
    if (!fs.existsSync(skillFile)) {
      continue
    }
    let symlink = false
    let symlinkTarget: string | undefined
    try {
      symlink = fs.lstatSync(fullPath).isSymbolicLink()
      if (symlink) {
        symlinkTarget = fs.readlinkSync(fullPath)
      }
    } catch {
      symlink = false
    }
    result.push({
      name: entry.name,
      path: fullPath,
      symlink,
      symlinkTarget,
    })
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

function mergeEffective(
  globalEntries: InstalledEntry[],
  projectEntries: InstalledEntry[]
): InstalledEntry[] {
  const map = new Map<string, InstalledEntry>()
  for (const entry of globalEntries) {
    map.set(entry.name, entry)
  }
  for (const entry of projectEntries) {
    map.set(entry.name, entry)
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function scanToolView(baseDir: string): Record<string, ToolView> {
  const home = os.homedir()
  const result: Record<string, ToolView> = {}

  for (const tool of TOOLS) {
    const projectRoot = path.join(baseDir, tool.dir)
    const globalRoot = path.join(home, tool.dir)

    const projectAgents = scanMarkdownEntries(path.join(projectRoot, "agents"))
    const projectSkills = scanSkillEntries(path.join(projectRoot, "skills"))
    const projectCommands = scanMarkdownEntries(
      path.join(projectRoot, "commands")
    )

    const globalAgents = scanMarkdownEntries(path.join(globalRoot, "agents"))
    const globalSkills = scanSkillEntries(path.join(globalRoot, "skills"))
    const globalCommands = scanMarkdownEntries(
      path.join(globalRoot, "commands")
    )

    result[tool.name] = {
      project: {
        agents: projectAgents,
        skills: projectSkills,
        commands: projectCommands,
      },
      global: {
        agents: globalAgents,
        skills: globalSkills,
        commands: globalCommands,
      },
      effective: {
        agents: mergeEffective(globalAgents, projectAgents),
        skills: mergeEffective(globalSkills, projectSkills),
        commands: mergeEffective(globalCommands, projectCommands),
      },
    }
  }

  return result
}

function summarize(entries: InstalledEntry[]): {
  count: number
  symlinked: number
  copied: number
  names: string[]
} {
  const symlinked = entries.filter((entry) => entry.symlink).length
  return {
    count: entries.length,
    symlinked,
    copied: entries.length - symlinked,
    names: entries.map((entry) => entry.name),
  }
}

function hasAnyEntries(
  view: ToolView,
  scope: "project" | "global" | "effective"
): boolean {
  return (
    view[scope].agents.length > 0 ||
    view[scope].skills.length > 0 ||
    view[scope].commands.length > 0
  )
}

function componentEntries(
  view: ToolView,
  scope: "project" | "global" | "effective"
): Array<{ component: ComponentName; entries: InstalledEntry[] }> {
  const components: ComponentName[] = ["agents", "skills", "commands"]
  return components
    .map((component) => ({ component, entries: view[scope][component] }))
    .filter((entry) => entry.entries.length > 0)
}

function isEntryActive(
  entry: InstalledEntry,
  effectiveEntries: InstalledEntry[]
): boolean {
  const effective = effectiveEntries.find(
    (candidate) => candidate.name === entry.name
  )
  if (!effective) {
    return false
  }
  return effective.path === entry.path
}

function printItemTree(
  prefix: string,
  entries: InstalledEntry[],
  effectiveEntries: InstalledEntry[]
): void {
  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1
    const branch = isLast ? "└─" : "├─"
    const active = isEntryActive(entry, effectiveEntries)
    const marker = active ? "●" : "○"
    if (entry.symlink) {
      const line = `${prefix}${branch} ${marker} ${entry.name} -> ${chalk.dim(
        entry.symlinkTarget || "(broken)"
      )}`
      console.log(active ? line : chalk.dim(line))
      return
    }
    const line = `${prefix}${branch} ${marker} ${entry.name} [C]`
    console.log(active ? line : chalk.dim(line))
  })
}

function printComponentTree(
  prefix: string,
  component: ComponentName,
  entries: InstalledEntry[],
  effectiveEntries: InstalledEntry[],
  isLast: boolean
): void {
  if (entries.length === 0) {
    return
  }
  const branch = isLast ? "└─" : "├─"
  const summary = summarize(entries)
  console.log(
    `${prefix}${branch} ${ICONS[component]} ${component.toUpperCase()} (${
      summary.count
    })`
  )
  const itemPrefix = `${prefix}${isLast ? "   " : "│  "}`
  printItemTree(itemPrefix, entries, effectiveEntries)
}

function printToolTree(
  scopeLabel: "project" | "global" | "effective",
  tools: Record<string, ToolView>
): void {
  const toolNames = TOOLS.map((tool) => tool.name).filter((toolName) =>
    hasAnyEntries(tools[toolName], scopeLabel)
  )

  if (toolNames.length === 0) {
    console.log(`└─ (0)`)
    return
  }

  for (const [index, toolName] of toolNames.entries()) {
    const isLastTool = index === toolNames.length - 1
    const toolBranch = isLastTool ? "└─" : "├─"
    const componentPrefix = `${isLastTool ? "   " : "│  "}`
    console.log(`${toolBranch} ${toolName}`)

    const view = tools[toolName]
    const components = componentEntries(view, scopeLabel)
    components.forEach((entry, componentIndex) => {
      const isLastComponent = componentIndex === components.length - 1
      printComponentTree(
        componentPrefix,
        entry.component,
        entry.entries,
        view.effective[entry.component],
        isLastComponent
      )
    })
  }
}

export async function statusCommand(
  options: StatusCommandOptions
): Promise<void> {
  try {
    const { scope, scopePath } = resolveScope(options)
    const baseDir = resolveBaseDir(scope, scopePath)
    const tools = scanToolView(baseDir)

    const toolSummary: Record<string, unknown> = {}
    for (const [toolName, view] of Object.entries(tools)) {
      toolSummary[toolName] = {
        agents: {
          project: summarize(view.project.agents),
          global: summarize(view.global.agents),
          effective: summarize(view.effective.agents),
        },
        skills: {
          project: summarize(view.project.skills),
          global: summarize(view.global.skills),
          effective: summarize(view.effective.skills),
        },
        commands: {
          project: summarize(view.project.commands),
          global: summarize(view.global.commands),
          effective: summarize(view.effective.commands),
        },
      }
    }

    const payload: Record<string, any> = {
      schemaVersion: 1,
      current: {
        baseDir,
        availability: toolSummary,
      },
    }

    if (options.json) {
      console.log(JSON.stringify(payload, null, 2))
      return
    }

    console.log(`Local (${baseDir})`)
    printToolTree("project", tools)

    console.log("")
    console.log(`Global (${getCanonicalRoot(os.homedir(), "global")})`)
    printToolTree("global", tools)
    console.log("")
    console.log("● active in current resolution, ○ overridden")
  } catch (err) {
    error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
