import * as path from "path"
import * as fs from "fs"
import simpleGit from "simple-git"
import { cloneOrFetchRepo, resolvePackage } from "../lib/git"
import {
  Issue,
  ScopeName,
  collectRuntimeIssues,
  getCanonicalRoot,
  readRuntimeManifest,
  resolveBaseDir,
  validateSource,
} from "../lib/layout"
import { error, info, warn } from "../utils/output"

export interface ValidateCommandOptions {
  path?: string
  strict?: boolean
  json?: boolean
  global?: boolean
  local?: boolean
}

function resolveScope(options: ValidateCommandOptions): {
  scope: ScopeName
  scopePath?: string
} {
  if (options.global) {
    return { scope: "global" }
  }
  return { scope: "local" }
}

interface SourceResolution {
  sourceType: "git" | "local"
  sourceInput: string
  sourcePath: string
  repo?: string
  ref?: string
  commit?: string
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

function printIssues(issues: Issue[]): void {
  for (const issue of issues) {
    const text = `${issue.code}: ${issue.message}${
      issue.path ? ` (${issue.path})` : ""
    }`
    if (issue.severity === "error") {
      error(text)
    } else {
      warn(text)
    }
  }
}

function printListTree(
  label: string,
  entries: string[],
  prefix: string,
  isLast: boolean
): void {
  const branch = isLast ? "└─" : "├─"
  console.log(`${prefix}${branch} ${label} (${entries.length})`)
  const itemPrefix = `${prefix}${isLast ? "   " : "│  "}`
  if (entries.length === 0) {
    console.log(`${itemPrefix}└─ (0)`)
    return
  }
  entries.forEach((entry, index) => {
    const itemBranch = index === entries.length - 1 ? "└─" : "├─"
    console.log(`${itemPrefix}${itemBranch} ${entry}`)
  })
}

export async function validateCommand(
  sourceInput: string | undefined,
  options: ValidateCommandOptions
): Promise<void> {
  try {
    const resolvedSource = sourceInput
      ? await resolveSource(sourceInput)
      : options.path
      ? {
          sourceType: "local" as const,
          sourceInput: options.path,
          sourcePath: path.resolve(options.path),
        }
      : {
          sourceType: "local" as const,
          sourceInput: process.cwd(),
          sourcePath: process.cwd(),
        }
    const targetPath = resolvedSource.sourcePath
    const { discovered, issues: sourceIssues } = validateSource(targetPath)

    const { scope, scopePath } = resolveScope(options)
    const baseDir = resolveBaseDir(scope, scopePath)
    const canonicalRoot = getCanonicalRoot(baseDir, scope)
    const includeRuntimeChecks = !sourceInput && !options.path
    const runtimeManifest = includeRuntimeChecks
      ? readRuntimeManifest(canonicalRoot)
      : null
    const runtimeIssues =
      includeRuntimeChecks && runtimeManifest
        ? collectRuntimeIssues(runtimeManifest)
        : []

    const allIssues = [...sourceIssues, ...runtimeIssues]
    const errors = allIssues.filter((issue) => issue.severity === "error")
    const warnings = allIssues.filter((issue) => issue.severity === "warning")

    const payload = {
      schemaVersion: 1,
      path: targetPath,
      summary: {
        valid: errors.length === 0,
        errors: errors.length,
        warnings: warnings.length,
      },
      source: {
        type: resolvedSource.sourceType,
        input: resolvedSource.sourceInput,
        path: resolvedSource.sourcePath,
        repo: resolvedSource.repo,
        ref: resolvedSource.ref,
        commit: resolvedSource.commit,
      },
      runtime: {
        checksSkipped: !includeRuntimeChecks,
        manifestFound: runtimeManifest !== null,
      },
      discovered: {
        agents: discovered.agents,
        skills: discovered.skills,
        commands: discovered.commands,
        fileGroups: discovered.fileGroups,
        reservedIgnored: discovered.reservedIgnored,
      },
      issues: allIssues,
    }

    if (options.json) {
      console.log(JSON.stringify(payload, null, 2))
    } else {
      console.log(`Inspect (${resolvedSource.sourceType})`)
      console.log(`├─ Input: ${resolvedSource.sourceInput}`)
      console.log(`├─ Resolved: ${targetPath}`)
      if (resolvedSource.repo) {
        console.log(
          `├─ Repository: ${resolvedSource.repo}${
            resolvedSource.ref ? `#${resolvedSource.ref}` : ""
          }${
            resolvedSource.commit
              ? ` @ ${resolvedSource.commit.slice(0, 12)}`
              : ""
          }`
        )
      } else if (resolvedSource.commit) {
        console.log(`├─ Commit: ${resolvedSource.commit.slice(0, 12)}`)
      }
      console.log("└─ Source components")
      printListTree("AGENTS", discovered.agents, "   ", false)
      printListTree("SKILLS", discovered.skills, "   ", false)
      printListTree("COMMANDS", discovered.commands, "   ", false)
      printListTree("FILE GROUPS", discovered.fileGroups, "   ", true)

      console.log("")
      console.log("Runtime")
      if (!includeRuntimeChecks) {
        console.log("└─ Skipped (source inspection mode)")
      } else if (!runtimeManifest) {
        console.log("└─ No runtime manifest found")
      } else if (runtimeIssues.length === 0) {
        console.log("└─ OK (no runtime issues)")
      } else {
        console.log(`└─ Issues (${runtimeIssues.length})`)
      }

      console.log("")
      info(
        `Validation summary: errors=${errors.length}, warnings=${warnings.length}`
      )
      if (allIssues.length > 0) {
        printIssues(allIssues)
      }
    }

    if (errors.length > 0) {
      process.exit(1)
    }
    if (options.strict && warnings.length > 0) {
      process.exit(2)
    }
  } catch (err) {
    error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

export const inspectCommand = validateCommand
