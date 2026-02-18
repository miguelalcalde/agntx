import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { parseAgentFile } from "./parse"

export type ToolName = "claude" | "cursor"
export type ComponentKind = "agents" | "skills" | "commands" | "files"
export type InstallMode = "copy" | "symlink"
export type ScopeName = "global" | "local" | "path"
export type Severity = "error" | "warning"

export interface Issue {
  code: string
  severity: Severity
  message: string
  path?: string
}

export interface DiscoveredSource {
  rootDir: string
  agents: string[]
  skills: string[]
  commands: string[]
  fileGroups: string[]
  reservedIgnored: string[]
  issues: Issue[]
}

export interface RuntimeTarget {
  tool: ToolName
  path: string
  mode: InstallMode
}

export interface RuntimeComponentEntry {
  name: string
  canonicalPath: string
  sourcePath: string
  targets: RuntimeTarget[]
}

export interface RuntimeFileGroupEntry {
  name: string
  sourcePath: string
  targetPath: string
  mode: "copy"
}

export interface RuntimeManifest {
  schemaVersion: number
  installedAt: string
  baseDir: string
  canonicalRoot: string
  scope: ScopeName
  mode: InstallMode
  tools: ToolName[]
  source: {
    input: string
    type: "git" | "local"
    repo?: string
    ref?: string
    commit?: string
    resolvedPath: string
  }
  selection: Record<ComponentKind, string[]>
  reservedIgnored: string[]
  components: {
    agents: RuntimeComponentEntry[]
    skills: RuntimeComponentEntry[]
    commands: RuntimeComponentEntry[]
    files: RuntimeFileGroupEntry[]
  }
}

export const RESERVED_DIRECTORIES = new Set([
  "agents",
  "skills",
  "commands",
  "rules",
  "settings",
  "src",
  "lib",
  "dist",
  "build",
  "coverage",
  "node_modules",
  "test",
  "tests",
  "__tests__",
  "docs",
  "examples",
  "config",
  "tmp",
  "temp",
])

export const IGNORED_RESERVED_DIRECTORIES = new Set([
  "rules",
  "settings",
  "src",
  "lib",
  "dist",
  "build",
  "coverage",
  "node_modules",
  "test",
  "tests",
  "__tests__",
  "docs",
  "examples",
  "config",
  "tmp",
  "temp",
])

export const IGNORED_HIDDEN_FILE_GROUP_DIRECTORIES = new Set([
  ".git",
  ".github",
  ".cursor",
  ".claude",
  ".agents",
  ".vscode",
])

const RUNTIME_MANIFEST_NAME = "install-state.json"

export const DEFAULT_TOOL_SUPPORT: Record<ComponentKind, ToolName[]> = {
  agents: ["claude", "cursor"],
  skills: ["claude", "cursor"],
  commands: ["claude", "cursor"],
  files: [],
}

export interface UserConfig {
  sourceRepos: string[]
}

export function getUserConfigPath(): string {
  return path.join(os.homedir(), ".config", "agntx", "config.json")
}

export function readUserConfig(): UserConfig {
  const configPath = getUserConfigPath()
  if (!fs.existsSync(configPath)) {
    return { sourceRepos: [] }
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8")
    const parsed = JSON.parse(raw) as { sourceRepos?: unknown }
    if (!Array.isArray(parsed.sourceRepos)) {
      return { sourceRepos: [] }
    }
    const repos = parsed.sourceRepos
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => path.resolve(entry))
    return { sourceRepos: Array.from(new Set(repos)) }
  } catch {
    return { sourceRepos: [] }
  }
}

export function parseCsv(input: string | undefined): string[] {
  if (!input) {
    return []
  }
  return input
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

export function isInteractiveSession(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

export function resolveBaseDir(
  scope: ScopeName,
  pathArg?: string,
  cwd: string = process.cwd()
): string {
  if (scope === "global") {
    return os.homedir()
  }
  if (scope === "path") {
    if (!pathArg) {
      throw new Error("Missing --path value for path scope")
    }
    return path.resolve(pathArg)
  }
  return path.resolve(cwd)
}

export function getCanonicalRoot(baseDir: string, scope: ScopeName): string {
  if (scope === "global") {
    return path.join(os.homedir(), ".agents")
  }
  return path.join(baseDir, ".agents")
}

export function getRuntimeManifestPath(canonicalRoot: string): string {
  return path.join(canonicalRoot, RUNTIME_MANIFEST_NAME)
}

export function getToolRootDir(baseDir: string, tool: ToolName): string {
  return path.join(baseDir, tool === "claude" ? ".claude" : ".cursor")
}

export function getToolComponentDir(
  baseDir: string,
  tool: ToolName,
  component: Extract<ComponentKind, "agents" | "skills" | "commands">
): string {
  return path.join(getToolRootDir(baseDir, tool), component)
}

export function resolveFileGroupTarget(groupName: string): string {
  return groupName.startsWith(".") ? groupName : `.${groupName}`
}

function listMarkdownBasenames(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return []
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.basename(entry.name, ".md"))
    .sort((a, b) => a.localeCompare(b))
}

function listSkillDirs(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return []
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) =>
      fs.existsSync(path.join(dirPath, entry.name, "SKILL.md"))
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

export function discoverSource(rootDir: string): DiscoveredSource {
  const resolvedRoot = path.resolve(rootDir)
  const issues: Issue[] = []
  const topLevel = fs
    .readdirSync(resolvedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())

  const agents = listMarkdownBasenames(path.join(resolvedRoot, "agents"))
  const skills = listSkillDirs(path.join(resolvedRoot, "skills"))
  const commands = listMarkdownBasenames(path.join(resolvedRoot, "commands"))
  const reservedIgnored: string[] = []

  for (const dir of topLevel) {
    if (IGNORED_RESERVED_DIRECTORIES.has(dir.name)) {
      reservedIgnored.push(dir.name)
    }
  }

  const fileGroups = topLevel
    .map((entry) => entry.name)
    .filter((name) => !IGNORED_HIDDEN_FILE_GROUP_DIRECTORIES.has(name))
    .filter((name) => !RESERVED_DIRECTORIES.has(name))
    .sort((a, b) => a.localeCompare(b))

  return {
    rootDir: resolvedRoot,
    agents,
    skills,
    commands,
    fileGroups,
    reservedIgnored: reservedIgnored.sort((a, b) => a.localeCompare(b)),
    issues,
  }
}

export function validateSource(rootDir: string): {
  discovered: DiscoveredSource
  issues: Issue[]
} {
  const discovered = discoverSource(rootDir)
  const issues: Issue[] = [...discovered.issues]

  const agentsDir = path.join(discovered.rootDir, "agents")
  if (fs.existsSync(agentsDir)) {
    const mdFiles = fs
      .readdirSync(agentsDir)
      .filter((name) => name.endsWith(".md"))
    for (const file of mdFiles) {
      const parsed = parseAgentFile(path.join(agentsDir, file))
      if (!parsed) {
        issues.push({
          code: "AGENT_INVALID",
          severity: "error",
          message: `Invalid agent markdown: ${file}`,
          path: path.join(agentsDir, file),
        })
      }
    }
  }

  const skillsDir = path.join(discovered.rootDir, "skills")
  if (fs.existsSync(skillsDir)) {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      const skillPath = path.join(skillsDir, entry.name)
      if (!fs.existsSync(path.join(skillPath, "SKILL.md"))) {
        issues.push({
          code: "SKILL_MISSING_FILE",
          severity: "error",
          message: `Skill directory is missing SKILL.md: ${entry.name}`,
          path: skillPath,
        })
      }
    }
  }

  for (const reserved of discovered.reservedIgnored) {
    issues.push({
      code: "RESERVED_IGNORED",
      severity: "warning",
      message: `Reserved directory is currently ignored: ${reserved}`,
      path: path.join(discovered.rootDir, reserved),
    })
  }

  return { discovered, issues }
}

export function readRuntimeManifest(
  canonicalRoot: string
): RuntimeManifest | null {
  const runtimePath = getRuntimeManifestPath(canonicalRoot)
  if (!fs.existsSync(runtimePath)) {
    return null
  }

  try {
    const raw = fs.readFileSync(runtimePath, "utf-8")
    const parsed = JSON.parse(raw) as Partial<RuntimeManifest>
    const components = parsed.components as
      | RuntimeManifest["components"]
      | undefined
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !components ||
      !Array.isArray(components.agents) ||
      !Array.isArray(components.skills) ||
      !Array.isArray(components.commands) ||
      !Array.isArray(components.files)
    ) {
      return null
    }
    return parsed as RuntimeManifest
  } catch {
    return null
  }
}

export function writeRuntimeManifest(
  canonicalRoot: string,
  manifest: RuntimeManifest
): void {
  fs.mkdirSync(canonicalRoot, { recursive: true })
  fs.writeFileSync(
    getRuntimeManifestPath(canonicalRoot),
    JSON.stringify(manifest, null, 2) + "\n"
  )
}

export function resolveAbsoluteSymlinkTarget(
  targetPath: string
): string | null {
  try {
    const linkValue = fs.readlinkSync(targetPath)
    return path.resolve(path.dirname(targetPath), linkValue)
  } catch {
    return null
  }
}

export function collectRuntimeIssues(manifest: RuntimeManifest): Issue[] {
  const issues: Issue[] = []

  const checkComponentEntries = (
    kind: "agents" | "skills" | "commands"
  ): void => {
    const entries = manifest.components[kind]
    for (const entry of entries) {
      if (!fs.existsSync(entry.canonicalPath)) {
        issues.push({
          code: "CANONICAL_MISSING",
          severity: "error",
          message: `${kind}:${entry.name} canonical path is missing`,
          path: entry.canonicalPath,
        })
      }

      for (const target of entry.targets) {
        if (!fs.existsSync(target.path)) {
          issues.push({
            code: "TARGET_MISSING",
            severity: "error",
            message: `${kind}:${entry.name} target is missing (${target.tool})`,
            path: target.path,
          })
          continue
        }

        if (target.mode === "symlink") {
          const stat = fs.lstatSync(target.path)
          if (!stat.isSymbolicLink()) {
            issues.push({
              code: "TARGET_NOT_SYMLINK",
              severity: "warning",
              message: `${kind}:${entry.name} expected symlink target`,
              path: target.path,
            })
            continue
          }

          const resolved = resolveAbsoluteSymlinkTarget(target.path)
          if (!resolved || !fs.existsSync(resolved)) {
            issues.push({
              code: "BROKEN_SYMLINK",
              severity: "error",
              message: `${kind}:${entry.name} symlink target is broken`,
              path: target.path,
            })
          }
        }
      }
    }
  }

  checkComponentEntries("agents")
  checkComponentEntries("skills")
  checkComponentEntries("commands")

  for (const entry of manifest.components.files) {
    if (!fs.existsSync(entry.targetPath)) {
      issues.push({
        code: "FILE_GROUP_MISSING",
        severity: "error",
        message: `File group target is missing: ${entry.name}`,
        path: entry.targetPath,
      })
    }
  }

  return issues
}
