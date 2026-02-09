import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import simpleGit, { SimpleGit } from "simple-git"

export interface PackageInfo {
  owner: string
  repo: string
  ref?: string
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

  // Extract ref if present
  const refMatch = input.match(/#(.+)$/)
  if (refMatch) {
    ref = refMatch[1]
    input = input.replace(/#.+$/, "")
  }

  // Handle GitHub shorthand
  if (/^[^\/]+\/[^\/]+$/.test(input)) {
    ;[owner, repo] = input.split("/")
  }
  // Handle GitHub URLs
  else if (input.includes("github.com")) {
    const match = input.match(/github\.com[/:]([^\/]+)\/([^\/]+?)(?:\.git)?$/)
    if (match) {
      owner = match[1]
      repo = match[2]
    } else {
      throw new Error(`Invalid GitHub URL: ${input}`)
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

  return { owner, repo, ref }
}

export async function cloneOrFetchRepo(
  packageInfo: PackageInfo
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
    // Fetch latest changes in existing repo
    const repoGit = simpleGit(tempDir)
    await repoGit.fetch()
    if (packageInfo.ref) {
      await repoGit.checkout(packageInfo.ref)
    } else {
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
