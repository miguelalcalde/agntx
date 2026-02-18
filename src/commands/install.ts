import * as fs from "fs"
import * as path from "path"
import inquirer from "inquirer"
import simpleGit from "simple-git"
import { cloneOrFetchRepo, resolvePackage } from "../lib/git"
import {
  RuntimeComponentEntry,
  RuntimeFileGroupEntry,
  RuntimeManifest,
  ScopeName,
  ToolName,
  DEFAULT_TOOL_SUPPORT,
  discoverSource,
  getCanonicalRoot,
  getToolComponentDir,
  isInteractiveSession,
  parseCsv,
  resolveBaseDir,
  resolveFileGroupTarget,
  writeRuntimeManifest,
  Issue,
} from "../lib/layout"
import { error, info, success, warn } from "../utils/output"

type SelectableKind = "agents" | "skills" | "commands" | "files"
type ModeValue = "copy" | "symlink"
type SelectorState = {
  requested: boolean
  values: string[] | null
}

const SELECTABLE_KIND_CONFIG: Array<{
  kind: SelectableKind
  label: string
}> = [
  { kind: "agents", label: "agent files" },
  { kind: "skills", label: "skills" },
  { kind: "commands", label: "commands" },
  { kind: "files", label: "file groups" },
]

export interface InstallCommandOptions {
  agents?: string | boolean
  skills?: string | boolean
  commands?: string | boolean
  files?: string | boolean
  global?: boolean
  local?: boolean
  path?: string
  mode?: string
  tools?: string
  force?: boolean
  dryRun?: boolean
  verbose?: boolean
  yes?: boolean
  json?: boolean
}

interface SourceResolution {
  sourceType: "git" | "local"
  sourceInput: string
  sourcePath: string
  repo?: string
  ref?: string
  commit?: string
}

function isModeValue(value: string): value is ModeValue {
  return value === "copy" || value === "symlink"
}

function parseSelector(value: string | boolean | undefined): {
  requested: boolean
  values: string[] | null
} {
  if (typeof value === "undefined") {
    return { requested: false, values: null }
  }
  if (typeof value === "boolean") {
    return { requested: value, values: null }
  }
  return { requested: true, values: parseCsv(value) }
}

async function selectKindsInteractive(): Promise<SelectableKind[]> {
  const { selectedKinds } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedKinds",
      message: "Select component categories to install:",
      choices: [
        new inquirer.Separator("Controls: <space> select, <a> toggle all"),
        ...SELECTABLE_KIND_CONFIG.map((entry) => ({
          name: entry.label,
          value: entry.kind,
        })),
      ],
      default: SELECTABLE_KIND_CONFIG.map((entry) => entry.kind),
      pageSize: 10,
      loop: false,
    },
  ])

  return selectedKinds as SelectableKind[]
}

function formatIssues(issues: Issue[]): void {
  for (const issue of issues) {
    const prefix = issue.severity === "error" ? error : warn
    prefix(
      `${issue.code}: ${issue.message}${issue.path ? ` (${issue.path})` : ""}`
    )
  }
}

async function resolveSource(input: string): Promise<SourceResolution> {
  const resolvedLocalPath = path.resolve(input)
  if (
    fs.existsSync(resolvedLocalPath) &&
    fs.lstatSync(resolvedLocalPath).isDirectory()
  ) {
    let commit: string | undefined
    try {
      if (fs.existsSync(path.join(resolvedLocalPath, ".git"))) {
        commit = (await simpleGit(resolvedLocalPath).revparse(["HEAD"])).trim()
      }
    } catch {
      // Best effort only.
    }
    return {
      sourceType: "local",
      sourceInput: input,
      sourcePath: resolvedLocalPath,
      commit,
    }
  }

  const pkg = resolvePackage(input)
  const repoPath = await cloneOrFetchRepo(pkg)
  let commit: string | undefined
  try {
    commit = (await simpleGit(repoPath).revparse(["HEAD"])).trim()
  } catch {
    // Best effort only.
  }
  return {
    sourceType: "git",
    sourceInput: input,
    sourcePath: repoPath,
    repo: `${pkg.owner}/${pkg.repo}`,
    ref: pkg.ref,
    commit,
  }
}

async function selectNamesInteractive(
  label: string,
  available: string[]
): Promise<string[]> {
  if (available.length === 0) {
    return []
  }

  let filtered = available
  if (available.length > 8) {
    const { query } = await inquirer.prompt([
      {
        type: "input",
        name: "query",
        message: `Search ${label} (optional):`,
      },
    ])
    const normalized = String(query || "")
      .trim()
      .toLowerCase()
    if (normalized.length > 0) {
      const matches = available.filter((entry) =>
        entry.toLowerCase().includes(normalized)
      )
      if (matches.length > 0) {
        filtered = matches
      } else {
        warn(
          `No ${label} matched "${normalized}". Showing all available ${label}.`
        )
      }
    }
  }

  const { selected } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selected",
      message: `Select ${label}:`,
      choices: [
        new inquirer.Separator("Controls: <space> select, <a> toggle all"),
        ...filtered.map((entry) => ({ name: entry, value: entry })),
      ],
      default: filtered,
      pageSize: Math.min(filtered.length + 2, 20),
      loop: false,
    },
  ])

  return selected as string[]
}

function validateExplicitSelection(
  kind: SelectableKind,
  selected: string[],
  available: string[]
): string[] {
  const availableSet = new Set(available)
  const invalid = selected.filter((entry) => !availableSet.has(entry))
  if (invalid.length > 0) {
    throw new Error(
      `Unknown ${kind} requested: ${invalid.join(", ")}. Available: ${
        available.length > 0 ? available.join(", ") : "(none)"
      }`
    )
  }
  return selected
}

async function resolveScopeAndPath(
  options: InstallCommandOptions
): Promise<{ scope: ScopeName; scopePath?: string }> {
  if (options.global) {
    return { scope: "global" }
  }
  if (options.path) {
    return { scope: "path", scopePath: options.path }
  }
  if (options.local) {
    return { scope: "local" }
  }
  if (options.yes || !isInteractiveSession()) {
    return { scope: "local" }
  }

  const { scope } = await inquirer.prompt([
    {
      type: "list",
      name: "scope",
      message: "Select installation scope:",
      choices: [
        { name: "Local (current project)", value: "local" },
        { name: "Global (home directory)", value: "global" },
      ],
      default: "local",
    },
  ])
  return { scope }
}

async function resolveMode(options: InstallCommandOptions): Promise<ModeValue> {
  if (options.mode) {
    const parsed = options.mode.toLowerCase()
    if (!isModeValue(parsed)) {
      throw new Error(`Invalid --mode value: ${options.mode}`)
    }
    return parsed
  }

  if (options.yes || !isInteractiveSession()) {
    return "symlink"
  }

  const { mode } = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "Select install mode:",
      choices: [
        { name: "symlink (recommended)", value: "symlink" },
        { name: "copy", value: "copy" },
      ],
      default: "symlink",
    },
  ])
  return mode
}

async function resolveTools(
  options: InstallCommandOptions
): Promise<ToolName[]> {
  const supportedTools: ToolName[] = ["claude", "cursor"]
  if (options.tools) {
    const parsed =
      options.tools === "all"
        ? supportedTools
        : parseCsv(options.tools).filter(
            (entry): entry is ToolName =>
              entry === "claude" || entry === "cursor"
          )
    if (parsed.length === 0) {
      throw new Error(`Invalid --tools value: ${options.tools}`)
    }
    return Array.from(new Set(parsed))
  }

  if (options.yes || !isInteractiveSession()) {
    return supportedTools
  }

  const { tools } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "tools",
      message: "Select tools:",
      choices: [
        new inquirer.Separator("Controls: <space> select, <a> toggle all"),
        ...supportedTools.map((tool) => ({ name: tool, value: tool })),
      ],
      default: supportedTools,
      pageSize: 8,
      loop: false,
      validate: (value: ToolName[]) =>
        value.length > 0 ? true : "Select at least one tool",
    },
  ])
  return tools as ToolName[]
}

async function resolveOverwrite(
  options: InstallCommandOptions
): Promise<boolean> {
  if (options.force) {
    return true
  }
  if (options.yes || !isInteractiveSession()) {
    return false
  }
  const { overwrite } = await inquirer.prompt([
    {
      type: "confirm",
      name: "overwrite",
      message: "Overwrite existing paths when present?",
      default: false,
    },
  ])
  return overwrite as boolean
}

function relativeFromBase(baseDir: string, targetPath: string): string {
  const rel = path.relative(baseDir, targetPath)
  if (!rel.startsWith("..")) {
    return rel
  }
  const sanitized = targetPath.replaceAll(path.sep, "_")
  return `_external/${sanitized}`
}

async function backupIfNeeded(
  targetPath: string,
  backupRoot: string,
  baseDir: string,
  dryRun: boolean
): Promise<boolean> {
  if (!fs.existsSync(targetPath)) {
    return false
  }
  const rel = relativeFromBase(baseDir, targetPath)
  const backupPath = path.join(backupRoot, `${rel}.backup.${Date.now()}`)
  if (dryRun) {
    info(`[dry-run] backup ${targetPath} -> ${backupPath}`)
    return false
  }
  await fs.promises.mkdir(path.dirname(backupPath), { recursive: true })
  await fs.promises.rename(targetPath, backupPath)
  return true
}

async function installEntry(params: {
  sourcePath: string
  targetPath: string
  sourceType: "file" | "dir"
  mode: ModeValue
  overwrite: boolean
  backupRoot: string
  baseDir: string
  dryRun: boolean
  onBackup?: () => void
}): Promise<"installed" | "skipped"> {
  const {
    sourcePath,
    targetPath,
    sourceType,
    mode,
    overwrite,
    backupRoot,
    baseDir,
    dryRun,
    onBackup,
  } = params

  const exists = fs.existsSync(targetPath)
  if (exists && !overwrite) {
    return "skipped"
  }

  if (exists && overwrite) {
    const didBackup = await backupIfNeeded(
      targetPath,
      backupRoot,
      baseDir,
      dryRun
    )
    if (didBackup) {
      onBackup?.()
    }
  }

  if (dryRun) {
    info(`[dry-run] ${mode} ${sourcePath} -> ${targetPath}`)
    return "installed"
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
  if (fs.existsSync(targetPath)) {
    await fs.promises.rm(targetPath, { recursive: true, force: true })
  }

  if (mode === "copy") {
    if (sourceType === "dir") {
      await fs.promises.cp(sourcePath, targetPath, { recursive: true })
    } else {
      await fs.promises.copyFile(sourcePath, targetPath)
    }
    return "installed"
  }

  const linkTarget = path.relative(path.dirname(targetPath), sourcePath)
  await fs.promises.symlink(
    linkTarget,
    targetPath,
    sourceType === "dir" ? "dir" : "file"
  )
  return "installed"
}

function toJsonOutput(payload: unknown, enabled: boolean | undefined): void {
  if (!enabled) {
    return
  }
  console.log(JSON.stringify(payload, null, 2))
}

export async function installCommand(
  sourceInput: string,
  options: InstallCommandOptions
): Promise<void> {
  try {
    const source = await resolveSource(sourceInput)
    const discovered = discoverSource(source.sourcePath)
    formatIssues(discovered.issues)

    const selectorByKind: Record<SelectableKind, SelectorState> = {
      agents: parseSelector(options.agents),
      skills: parseSelector(options.skills),
      commands: parseSelector(options.commands),
      files: parseSelector(options.files),
    }
    const anyRequested = Object.values(selectorByKind).some(
      (state) => state.requested
    )

    let selectedKinds: SelectableKind[]
    if (anyRequested) {
      selectedKinds = SELECTABLE_KIND_CONFIG.filter(
        (entry) => selectorByKind[entry.kind].requested
      ).map((entry) => entry.kind)
    } else if (options.yes || !isInteractiveSession()) {
      selectedKinds = SELECTABLE_KIND_CONFIG.map((entry) => entry.kind)
    } else {
      selectedKinds = await selectKindsInteractive()
    }

    if (selectedKinds.length === 0) {
      info("No component categories selected. Nothing to install.")
      return
    }

    const { scope, scopePath } = await resolveScopeAndPath(options)
    const mode = await resolveMode(options)
    const overwrite = await resolveOverwrite(options)

    const resolveCategory = async (
      kind: SelectableKind,
      available: string[],
      label: string
    ): Promise<string[]> => {
      if (!selectedKinds.includes(kind)) {
        return []
      }
      if (available.length === 0) {
        warn(`No ${label} found. Skipping ${label}.`)
        return []
      }
      const state = selectorByKind[kind]
      if (state.values && state.values.length > 0) {
        return validateExplicitSelection(kind, state.values, available)
      }
      if (options.yes || !isInteractiveSession()) {
        return available
      }
      return selectNamesInteractive(label, available)
    }

    const selectedAgents = await resolveCategory(
      "agents",
      discovered.agents,
      "agent files"
    )
    const selectedSkills = await resolveCategory(
      "skills",
      discovered.skills,
      "skills"
    )
    const selectedCommands = await resolveCategory(
      "commands",
      discovered.commands,
      "commands"
    )
    const selectedFiles = await resolveCategory(
      "files",
      discovered.fileGroups,
      "file groups"
    )
    const tools = await resolveTools(options)
    const baseDir = resolveBaseDir(scope, scopePath)
    const canonicalRoot = getCanonicalRoot(baseDir, scope)
    const runId = new Date().toISOString().replace(/[:.]/g, "-")
    const backupRoot = path.join(canonicalRoot, "backups", runId)
    const toolSupport = DEFAULT_TOOL_SUPPORT

    if (!options.yes && isInteractiveSession()) {
      const { proceed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "proceed",
          default: true,
          message:
            `Proceed with install?\n` +
            `- source: ${sourceInput}\n` +
            `- scope: ${scope}\n` +
            `- mode: ${mode}\n` +
            `- overwrite: ${overwrite ? "overwrite" : "skip"}\n` +
            `- tools: ${tools.join(", ")}\n` +
            `- agents: ${selectedAgents.length}\n` +
            `- skills: ${selectedSkills.length}\n` +
            `- commands: ${selectedCommands.length}\n` +
            `- files: ${selectedFiles.length}`,
        },
      ])
      if (!proceed) {
        info("Installation cancelled")
        return
      }
    }

    const runtimeAgents: RuntimeComponentEntry[] = []
    const runtimeSkills: RuntimeComponentEntry[] = []
    const runtimeCommands: RuntimeComponentEntry[] = []
    const runtimeFiles: RuntimeFileGroupEntry[] = []
    let installedCount = 0
    let skippedCount = 0
    let failedCount = 0
    let backupCount = 0

    const installTyped = async (
      kind: "agents" | "skills" | "commands",
      names: string[],
      sourceType: "file" | "dir"
    ): Promise<void> => {
      for (const name of names) {
        try {
          const sourcePath =
            kind === "skills"
              ? path.join(discovered.rootDir, kind, name)
              : path.join(discovered.rootDir, kind, `${name}.md`)
          const canonicalPath =
            kind === "skills"
              ? path.join(canonicalRoot, kind, name)
              : path.join(canonicalRoot, kind, `${name}.md`)

          const canonicalResult = await installEntry({
            sourcePath,
            targetPath: canonicalPath,
            sourceType,
            mode: "copy",
            overwrite,
            backupRoot,
            baseDir,
            dryRun: options.dryRun || false,
            onBackup: () => {
              backupCount += 1
            },
          })

          if (canonicalResult === "skipped") {
            skippedCount += 1
            continue
          }

          installedCount += 1
          const entry: RuntimeComponentEntry = {
            name,
            canonicalPath,
            sourcePath,
            targets: [],
          }

          for (const tool of tools) {
            if (!toolSupport[kind].includes(tool)) {
              skippedCount += 1
              warn(
                `Skipping ${kind}:${name} for ${tool} (unsupported by compatibility rules)`
              )
              continue
            }

            try {
              const targetBase = getToolComponentDir(baseDir, tool, kind)
              const targetPath =
                kind === "skills"
                  ? path.join(targetBase, name)
                  : path.join(targetBase, `${name}.md`)
              const result = await installEntry({
                sourcePath: canonicalPath,
                targetPath,
                sourceType,
                mode,
                overwrite,
                backupRoot,
                baseDir,
                dryRun: options.dryRun || false,
                onBackup: () => {
                  backupCount += 1
                },
              })
              if (result === "skipped") {
                skippedCount += 1
                continue
              }
              installedCount += 1
              entry.targets.push({ tool, path: targetPath, mode })
            } catch (err) {
              failedCount += 1
              warn(
                `Failed to install ${kind}:${name} for ${tool}: ${
                  err instanceof Error ? err.message : String(err)
                }`
              )
            }
          }

          if (kind === "agents") {
            runtimeAgents.push(entry)
          } else if (kind === "skills") {
            runtimeSkills.push(entry)
          } else {
            runtimeCommands.push(entry)
          }
        } catch (err) {
          failedCount += 1
          warn(
            `Failed to install ${kind}:${name}: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        }
      }
    }

    await installTyped("agents", selectedAgents, "file")
    await installTyped("skills", selectedSkills, "dir")
    await installTyped("commands", selectedCommands, "file")

    for (const group of selectedFiles) {
      try {
        const sourcePath = path.join(discovered.rootDir, group)
        const targetPath = path.join(baseDir, resolveFileGroupTarget(group))
        const result = await installEntry({
          sourcePath,
          targetPath,
          sourceType: "dir",
          mode: "copy",
          overwrite,
          backupRoot,
          baseDir,
          dryRun: options.dryRun || false,
          onBackup: () => {
            backupCount += 1
          },
        })
        if (result === "skipped") {
          skippedCount += 1
          continue
        }
        installedCount += 1
        runtimeFiles.push({
          name: group,
          sourcePath,
          targetPath,
          mode: "copy",
        })
      } catch (err) {
        failedCount += 1
        warn(
          `Failed to install file group:${group}: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      }
    }

    const runtimeManifest: RuntimeManifest = {
      schemaVersion: 2,
      installedAt: new Date().toISOString(),
      baseDir,
      canonicalRoot,
      scope,
      mode,
      tools,
      source: {
        input: source.sourceInput,
        type: source.sourceType,
        repo: source.repo,
        ref: source.ref,
        commit: source.commit,
        resolvedPath: source.sourcePath,
      },
      selection: {
        agents: selectedAgents,
        skills: selectedSkills,
        commands: selectedCommands,
        files: selectedFiles,
      },
      reservedIgnored: discovered.reservedIgnored,
      components: {
        agents: runtimeAgents,
        skills: runtimeSkills,
        commands: runtimeCommands,
        files: runtimeFiles,
      },
    }

    if (!options.dryRun) {
      writeRuntimeManifest(canonicalRoot, runtimeManifest)
    }

    success(
      `${
        options.dryRun ? "Dry-run complete" : "Install complete"
      }: installed=${installedCount}, skipped=${skippedCount}, failed=${failedCount}, backups=${backupCount}`
    )
    toJsonOutput(
      {
        summary: {
          installed: installedCount,
          skipped: skippedCount,
          failed: failedCount,
          backups: backupCount,
        },
        statePath: path.join(canonicalRoot, "install-state.json"),
        selection: runtimeManifest.selection,
      },
      options.json
    )
  } catch (err) {
    error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
