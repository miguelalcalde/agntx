import * as fs from "fs"
import * as path from "path"
import { AgentFile } from "./parse"
import { addAgentTracking, removeAgentTracking } from "./tracking"

export type InstallMode = "copy" | "symlink"

export interface InstallAgentParams {
  agent: AgentFile
  sourcePath: string
  targetDir: string
  source: string
  mode: InstallMode
  overwrite?: boolean
  canonicalPath?: string
}

export function isSymlinkModeSupported(): boolean {
  return process.platform !== "win32"
}

function assertInstallModeSupported(mode: InstallMode): void {
  if (mode === "symlink" && !isSymlinkModeSupported()) {
    throw new Error(
      "Symlink mode is currently supported on macOS/unix only. Use --mode copy or --no-symlink."
    )
  }
}

export async function materializeAgentFile(
  sourcePath: string,
  targetDir: string,
  installPath: string,
  mode: InstallMode,
  overwrite: boolean = true
): Promise<void> {
  assertInstallModeSupported(mode)
  const targetPath = path.join(targetDir, installPath)
  const resolvedSourcePath = path.resolve(sourcePath)

  // Ensure target directory exists
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })

  // Remove existing file if it exists
  if (fs.existsSync(targetPath)) {
    if (!overwrite) {
      throw new Error(`Target exists: ${installPath}`)
    }
    await fs.promises.unlink(targetPath)
  }

  if (mode === "symlink") {
    const linkTarget = path.relative(path.dirname(targetPath), resolvedSourcePath)
    await fs.promises.symlink(linkTarget, targetPath)
  } else {
    await fs.promises.copyFile(resolvedSourcePath, targetPath)
  }
}

export async function installAgent({
  agent,
  sourcePath,
  targetDir,
  source,
  mode,
  overwrite = true,
  canonicalPath,
}: InstallAgentParams): Promise<void> {
  const installPath = agent.installPath || path.basename(agent.path)

  await materializeAgentFile(sourcePath, targetDir, installPath, mode, overwrite)

  // Update tracking
  addAgentTracking(
    targetDir,
    agent.name,
    source,
    mode === "symlink",
    agent.path,
    installPath,
    mode,
    canonicalPath ? path.resolve(canonicalPath) : undefined
  )
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
