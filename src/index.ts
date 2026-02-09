#!/usr/bin/env node

import { Command } from "commander"
import { addCommand } from "./commands/add"
import { removeCommand } from "./commands/remove"
import { listCommand } from "./commands/list"
import { findCommand } from "./commands/find"
import { initCommand } from "./commands/init"
import { checkCommand } from "./commands/check"
import { updateCommand } from "./commands/update"

const program = new Command()

program
  .name("agntx")
  .description(
    "A CLI to install agent definitions from GitHub repositories into local agent directories"
  )
  .version("1.0.1")

program.argument("[package]", "GitHub repository URL or package identifier")

program
  .command("add <package>")
  .description("Install agents from a GitHub repository")
  .option(
    "-g, --global",
    "Install to user-level (~/.<agent>/agents/) instead of project-level"
  )
  .option(
    "-a, --agent <agents>",
    "Specify target agents: cursor, claude, codex, or * for all"
  )
  .option(
    "-s, --agent-file <names>",
    "Specify agent names to install (use * for all)"
  )
  .option(
    "--mode <mode>",
    "Install mode: symlink (recommended) or copy"
  )
  .option("--no-symlink", "Disable symlink mode and copy files instead")
  .option("-l, --list", "List available agents in repo without installing")
  .option("-y, --yes", "Skip confirmation prompts")
  .option("-f, --force", "Overwrite existing installed files without prompting")
  .option("--all", 'Shorthand for --agent-file "*" --agent "*" -y')
  .action(async (packageInput: string, options) => {
    await addCommand(packageInput, options)
  })

program
  .command("remove [agents...]")
  .alias("rm")
  .description("Remove installed agents")
  .option("-g, --global", "Remove from global scope")
  .option("-a, --agent <agents>", "Remove from specific agent tools")
  .option("-s, --agent-file <names>", "Specify agents to remove")
  .option("-y, --yes", "Skip confirmation")
  .option("--all", "Remove all agents from all tools")
  .action(async (agentNames: string[], options) => {
    await removeCommand(agentNames, options)
  })

program
  .command("list")
  .alias("ls")
  .description("List installed agents")
  .option("-g, --global", "List global agents")
  .option("-a, --agent <agents>", "Filter by agent tool")
  .action(async (options) => {
    await listCommand(options)
  })

program
  .command("find [query]")
  .description("Search for agent packages")
  .action(async (query: string | undefined, options) => {
    await findCommand(query, options)
  })

program
  .command("init [name]")
  .description("Create a new agent file")
  .action(async (name: string | undefined) => {
    await initCommand(name)
  })

program
  .command("check")
  .description("Check for available updates to installed agents")
  .action(async () => {
    await checkCommand()
  })

program
  .command("update")
  .description("Update all agents to latest versions")
  .action(async () => {
    await updateCommand()
  })

program.action(async (packageInput: string | undefined) => {
  if (packageInput) {
    await addCommand(packageInput, {})
  } else {
    program.help()
  }
})

program.parse()
