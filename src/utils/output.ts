import chalk from "chalk"

const RAIL_GLYPH = chalk.dim("│")

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

export function step(message: string, active: boolean = false): void {
  const marker = active ? chalk.cyan("◇") : chalk.green("◆")
  console.log(`${marker} ${message}`)
}

export function rail(message?: string): void {
  if (message && message.length > 0) {
    console.log(`${RAIL_GLYPH}  ${message}`)
    return
  }
  console.log(RAIL_GLYPH)
}

export function spacer(): void {
  console.log("")
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
