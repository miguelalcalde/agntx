import { glob } from "glob"
import * as fs from "fs"
import * as path from "path"
import { AgentFile, parseAgentFile } from "./parse"

export const STANDARD_SOURCE_ROOTS = [
  ".agents/agents",
  ".cursor/agents",
  ".claude/agents",
]

export function findAvailableSourceRoots(repoPath: string): string[] {
  return STANDARD_SOURCE_ROOTS.filter((root) =>
    fs.existsSync(path.join(repoPath, root))
  )
}

export async function discoverAgents(
  repoPath: string,
  sourceRoot: string
): Promise<AgentFile[]> {
  const sourceRootPath = path.join(repoPath, sourceRoot)

  // Find all *.md files under the selected source root
  const mdFiles = await glob("**/*.md", {
    cwd: sourceRootPath,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.git/**"],
  })

  const agents: AgentFile[] = []

  for (const filePath of mdFiles) {
    const agent = parseAgentFile(filePath)
    if (agent) {
      // Make path relative to repo root
      agent.path = path.relative(repoPath, filePath)
      agent.sourceRoot = sourceRoot
      agent.installPath = path.relative(sourceRootPath, filePath)
      agents.push(agent)
    }
  }

  return agents
}
