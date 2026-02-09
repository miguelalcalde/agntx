import chalk from "chalk"

export function success(message: string): void {
  console.log(chalk.green("✓"), message)
}

export function error(message: string): void {
  console.error(chalk.red("✗"), message)
}

export function info(message: string): void {
  console.log(chalk.blue("ℹ"), message)
}

export function warn(message: string): void {
  console.warn(chalk.yellow("⚠"), message)
}

export function formatAgentList(
  agents: Array<{ name: string; description?: string }>
): string {
  return agents
    .map((agent) => {
      const desc = agent.description ? `  ${agent.description}` : ""
      return `  ${chalk.cyan(agent.name)}${desc}`
    })
    .join("\n")
}
