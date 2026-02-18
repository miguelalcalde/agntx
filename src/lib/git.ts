import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import simpleGit, { SimpleGit } from "simple-git"

export interface PackageInfo {
  owner: string
  repo: string
  ref?: string
  sourceRoot?: string
}

const SOURCE_ROOT_ALIASES: Record<string, string> = {
  agents: "agents",
  ".agents": ".agents/agents",
  ".cursor": ".cursor/agents",
  ".claude": ".claude/agents",
}

function normalizeSparsePaths(paths: string[]): string[] {
  const uniquePaths = new Set<string>()

  for (const sparsePath of paths) {
    const normalized = sparsePath
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
    if (normalized.length > 0) {
      uniquePaths.add(normalized)
      // In --no-cone sparse-checkout mode, patterns are gitignore-style:
      // "dir/sub" only matches a *file* at that exact path.  Adding the
      // "dir/sub/**" variant ensures all files inside the directory are
      // also checked out.
      if (!normalized.includes("*")) {
        uniquePaths.add(normalized + "/**")
      }
    }
  }

  return [...uniquePaths]
}

async function applySparseCheckout(
  repoGit: SimpleGit,
  sparsePaths: string[]
): Promise<void> {
  if (sparsePaths.length === 0) {
    return
  }

  await repoGit.raw(["sparse-checkout", "init", "--no-cone"])
  await repoGit.raw(["sparse-checkout", "set", "--no-cone", ...sparsePaths])
}

async function checkoutDefaultBranch(repoGit: SimpleGit): Promise<void> {
  const candidates: string[] = []

  try {
    const originHead = (
      await repoGit.raw(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
    ).trim()
    if (originHead.startsWith("origin/")) {
      candidates.push(originHead.replace(/^origin\//, ""))
    } else if (originHead.length > 0) {
      candidates.push(originHead)
    }
  } catch (error) {
    // Fallback candidates below.
  }

  candidates.push("main", "master")

  for (const candidate of [...new Set(candidates)]) {
    try {
      await repoGit.checkout(candidate)
      return
    } catch (error) {
      // Try next candidate branch.
    }
  }

  // Last resort: checkout HEAD in detached mode.
  await repoGit.checkout("HEAD")
}

async function ensureFullCheckout(repoGit: SimpleGit): Promise<void> {
  try {
    await repoGit.raw(["sparse-checkout", "disable"])
  } catch {
    // Repository is likely not in sparse-checkout mode.
  }
}

async function cloneOrFetchRepoFull(
  packageInfo: PackageInfo,
  forceFreshClone: boolean = false
): Promise<string> {
  const tempDir = path.join(
    os.tmpdir(),
    "agntx",
    `${packageInfo.owner}-${packageInfo.repo}`
  )
  const repoUrl = `https://github.com/${packageInfo.owner}/${packageInfo.repo}.git`
  const git: SimpleGit = simpleGit()

  if (forceFreshClone && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  // Check if directory exists and is a git repo
  const isRepo =
    fs.existsSync(tempDir) && fs.existsSync(path.join(tempDir, ".git"))

  if (isRepo) {
    // Fetch latest changes in existing repo
    const repoGit = simpleGit(tempDir)
    await repoGit.fetch()
    await ensureFullCheckout(repoGit)
    if (packageInfo.ref) {
      await repoGit.checkout(packageInfo.ref)
    } else {
      await checkoutDefaultBranch(repoGit)
      await repoGit.pull()
    }
  } else {
    // Remove directory if it exists but is not a repo
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }

    // Clone the repo
    await git.clone(repoUrl, tempDir)

    // Checkout specific ref if provided
    if (packageInfo.ref) {
      const repoGit = simpleGit(tempDir)
      await repoGit.checkout(packageInfo.ref)
    }
  }

  return tempDir
}

async function cloneOrFetchRepoSparse(
  packageInfo: PackageInfo,
  sparsePaths: string[]
): Promise<string> {
  const tempDir = path.join(
    os.tmpdir(),
    "agntx",
    `${packageInfo.owner}-${packageInfo.repo}`
  )
  const repoUrl = `https://github.com/${packageInfo.owner}/${packageInfo.repo}.git`
  const git: SimpleGit = simpleGit()

  // Check if directory exists and is a git repo
  const isRepo =
    fs.existsSync(tempDir) && fs.existsSync(path.join(tempDir, ".git"))

  if (isRepo) {
    const repoGit = simpleGit(tempDir)
    await repoGit.fetch()
    await applySparseCheckout(repoGit, sparsePaths)
    if (packageInfo.ref) {
      await repoGit.checkout(packageInfo.ref)
    } else {
      await repoGit.pull()
    }
  } else {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }

    // Partial clone without checkout; sparse paths are applied first.
    await git.clone(repoUrl, tempDir, ["--filter=blob:none", "--no-checkout"])
    const repoGit = simpleGit(tempDir)

    await applySparseCheckout(repoGit, sparsePaths)
    if (packageInfo.ref) {
      await repoGit.checkout(packageInfo.ref)
    } else {
      await checkoutDefaultBranch(repoGit)
    }
  }

  return tempDir
}

export function resolvePackage(input: string): PackageInfo {
  // Handle formats:
  // - vercel-labs/agents
  // - vercel-labs/agents#branch
  // - https://github.com/vercel-labs/agents
  // - https://github.com/vercel-labs/agents#branch
  // - git@github.com:vercel-labs/agents.git
  // - git@github.com:vercel-labs/agents.git#branch

  let owner: string
  let repo: string
  let ref: string | undefined
  let sourceRoot: string | undefined

  // Extract ref if present
  const refMatch = input.match(/#(.+)$/)
  if (refMatch) {
    ref = refMatch[1]
    input = input.replace(/#.+$/, "")
  }

  // Handle GitHub shorthand
  if (/^[^\/]+\/[^\/]+(?:\/(?:\.[^\/]+|agents))?$/.test(input)) {
    const segments = input.split("/")
    owner = segments[0]
    repo = segments[1]
    const sourceAlias = segments[2]
    if (sourceAlias) {
      sourceRoot = SOURCE_ROOT_ALIASES[sourceAlias]
      if (!sourceRoot) {
        throw new Error(`Unsupported source namespace: ${sourceAlias}`)
      }
    }
  }
  // Handle GitHub URLs
  else if (input.includes("github.com")) {
    if (input.startsWith("http://") || input.startsWith("https://")) {
      const url = new URL(input)
      const segments = url.pathname.split("/").filter(Boolean)

      if (segments.length < 2) {
        throw new Error(`Invalid GitHub URL: ${input}`)
      }

      owner = segments[0]
      repo = segments[1].replace(/\.git$/, "")

      if (segments.length >= 3) {
        const sourceAlias = segments[2]
        sourceRoot = SOURCE_ROOT_ALIASES[sourceAlias]
        if (!sourceRoot) {
          throw new Error(`Unsupported source namespace: ${sourceAlias}`)
        }
      }
    } else {
      const match = input.match(/github\.com[/:]([^\/]+)\/([^\/]+?)(?:\.git)?$/)
      if (match) {
        owner = match[1]
        repo = match[2]
      } else {
        throw new Error(`Invalid GitHub URL: ${input}`)
      }
    }
  }
  // Handle git@ URLs
  else if (input.startsWith("git@")) {
    const match = input.match(/git@[^:]+:([^\/]+)\/([^\/]+?)(?:\.git)?$/)
    if (match) {
      owner = match[1]
      repo = match[2]
    } else {
      throw new Error(`Invalid git URL: ${input}`)
    }
  } else {
    throw new Error(`Invalid package identifier: ${input}`)
  }

  return { owner, repo, ref, sourceRoot }
}

export async function cloneOrFetchRepo(
  packageInfo: PackageInfo,
  requiredSparsePaths: string[] = []
): Promise<string> {
  const sparsePaths = normalizeSparsePaths(requiredSparsePaths)
  if (sparsePaths.length === 0) {
    return cloneOrFetchRepoFull(packageInfo)
  }

  try {
    return await cloneOrFetchRepoSparse(packageInfo, sparsePaths)
  } catch (error) {
    console.warn(
      `Sparse checkout failed for ${packageInfo.owner}/${packageInfo.repo}; falling back to full checkout.`
    )
    console.warn(error instanceof Error ? error.message : String(error))
    return cloneOrFetchRepoFull(packageInfo, true)
  }
}
