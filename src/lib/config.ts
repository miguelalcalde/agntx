import * as path from "path"
import * as os from "os"

export const AGENT_TOOLS = {
  cursor: {
    projectDir: ".cursor/agents",
    globalDir: path.join(os.homedir(), ".cursor", "agents"),
  },
  claude: {
    projectDir: ".claude/agents",
    globalDir: path.join(os.homedir(), ".claude", "agents"),
  },
  codex: {
    projectDir: ".codex/agents",
    globalDir: path.join(os.homedir(), ".codex", "agents"),
  },
} as const

export type AgentTool = keyof typeof AGENT_TOOLS

export function getAgentDirs(agent: AgentTool, global: boolean): string {
  return global ? AGENT_TOOLS[agent].globalDir : AGENT_TOOLS[agent].projectDir
}

export function getAllAgentTools(): AgentTool[] {
  return Object.keys(AGENT_TOOLS) as AgentTool[]
}
