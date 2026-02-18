#!/usr/bin/env node

import { Command } from "commander"
import { removeCommand } from "./commands/remove"
import { initCommand } from "./commands/init"
import { checkCommand } from "./commands/check"
import { updateCommand } from "./commands/update"
import { installCommand } from "./commands/install"
import { inspectCommand } from "./commands/validate"
import { statusCommand } from "./commands/status"

const program = new Command()

program
  .name("agntx")
  .description(
    "A CLI to install agent files and related runtime components from repositories or local paths"
  )
  .version("1.0.3")

program.argument("[package]", "GitHub repository URL or package identifier")

program
  .command("install <source>")
  .alias("add")
  .description("Install agent files, skills, commands, and file groups")
  .option(
    "--agents [items]",
    "Install selected agent files (csv) or all when omitted"
  )
  .option(
    "--skills [items]",
    "Install selected skills (csv) or all when omitted"
  )
  .option(
    "--commands [items]",
    "Install selected commands (csv) or all when omitted"
  )
  .option(
    "--files [items]",
    "Install selected file groups (csv) or all when omitted"
  )
  .option("-g, --global", "Install to global home scope")
  .option("--local", "Install to current project scope")
  .option(
    "--path <dir>",
    "Install to custom base path (flag-only, not prompted interactively)"
  )
  .option("--mode <mode>", "Install mode: symlink or copy")
  .option("--tools <tools>", "Target tools: claude, cursor, or all")
  .option("-f, --force", "Overwrite existing paths")
  .option("-d, --dry-run", "Preview changes without writing")
  .option("-v, --verbose", "Verbose output")
  .option("-y, --yes", "Skip prompts and confirmations")
  .option("--json", "Emit JSON summary output")
  .action(async (source: string, options) => {
    await installCommand(source, options)
  })

program
  .command("inspect [source]")
  .alias("validate")
  .description(
    "Inspect source structure from local path or GitHub, and validate runtime installation integrity"
  )
  .option(
    "--path <dir>",
    "Inspect a specific local path when source is omitted"
  )
  .option("-g, --global", "Validate global runtime install")
  .option("--local", "Validate local runtime install (default)")
  .option("--strict", "Treat warnings as non-zero exit")
  .option("--json", "Emit JSON report")
  .action(async (source: string | undefined, options) => {
    await inspectCommand(source, options)
  })

program
  .command("status")
  .description("Show installation state and health")
  .option("-g, --global", "Show global status")
  .option("--local", "Show local status (default)")
  .option("--path <dir>", "Show status for a custom base path")
  .option("--json", "Emit machine-readable JSON")
  .action(async (options) => {
    await statusCommand(options)
  })

program
  .command("remove [agents...]")
  .alias("rm")
  .description("Remove installed agent files")
  .option("-g, --global", "Remove from global scope")
  .option("-a, --agent <agents>", "Remove from specific agent tools")
  .option("-s, --agent-file <names>", "Specify agent files to remove")
  .option("-y, --yes", "Skip confirmation")
  .option("--all", "Remove all agents from all tools")
  .action(async (agentNames: string[], options) => {
    await removeCommand(agentNames, options)
  })

program
  .command("init [name]")
  .description("Create a new agent file")
  .action(async (name: string | undefined) => {
    await initCommand(name)
  })

program
  .command("check")
  .description("Check for available updates to installed agent files")
  .action(async () => {
    await checkCommand()
  })

program
  .command("update")
  .description("Update all installed agent files to latest versions")
  .action(async () => {
    await updateCommand()
  })

program.action(async (packageInput: string | undefined) => {
  if (packageInput) {
    await installCommand(packageInput, {})
  } else {
    program.help()
  }
})

program.parse()
