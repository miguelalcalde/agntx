import { glob } from "glob"
import * as path from "path"
import { AgentFile, parseAgentFile } from "./parse"

export async function discoverAgents(repoPath: string): Promise<AgentFile[]> {
  // Find all *.md files recursively
  const mdFiles = await glob("**/*.md", {
    cwd: repoPath,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.git/**"],
  })

  const agents: AgentFile[] = []

  for (const filePath of mdFiles) {
    const agent = parseAgentFile(filePath)
    if (agent) {
      // Make path relative to repo root
      agent.path = path.relative(repoPath, filePath)
      agents.push(agent)
    }
  }

  return agents
}
