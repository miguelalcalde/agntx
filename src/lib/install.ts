import * as fs from "fs"
import * as path from "path"
import { AgentFile } from "./parse"
import { addAgentTracking, removeAgentTracking } from "./tracking"

export async function installAgent(
  agent: AgentFile,
  sourceRepoPath: string,
  targetDir: string,
  source: string,
  useSymlink: boolean = false,
  overwrite: boolean = true
): Promise<void> {
  const installPath = agent.installPath || path.basename(agent.path)
  const targetPath = path.join(targetDir, installPath)
  const sourcePath = path.join(sourceRepoPath, agent.path)

  // Ensure target directory exists
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })

  // Remove existing file if it exists
  if (fs.existsSync(targetPath)) {
    if (!overwrite) {
      throw new Error(`Target exists: ${installPath}`)
    }
    await fs.promises.unlink(targetPath)
  }

  if (useSymlink) {
    // Create symlink
    await fs.promises.symlink(sourcePath, targetPath)
  } else {
    // Copy file
    await fs.promises.copyFile(sourcePath, targetPath)
  }

  // Update tracking
  addAgentTracking(targetDir, agent.name, source, useSymlink, agent.path, installPath)
}

export async function uninstallAgent(
  installedPath: string,
  targetDir: string
): Promise<boolean> {
  const targetPath = path.join(targetDir, installedPath)

  if (!fs.existsSync(targetPath)) {
    return false
  }

  // Remove the file (works for both symlinks and regular files)
  await fs.promises.unlink(targetPath)

  // Update tracking
  removeAgentTracking(targetDir, installedPath)

  return true
}
