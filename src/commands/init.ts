import * as fs from "fs"
import * as path from "path"
import { error, success } from "../utils/output"

export async function initCommand(name: string | undefined): Promise<void> {
  try {
    const agentName = name || "agent"
    const fileName = name ? `${name}.md` : "agent.md"
    const filePath = path.join(process.cwd(), fileName)

    if (fs.existsSync(filePath)) {
      error(`File ${fileName} already exists`)
      return
    }

    const template = `---
name: ${agentName}
description: Describe when this agent should be used
model: inherit
readonly: false
is_background: false
---

You are a specialized agent that...

## Instructions

1. First, do this
2. Then, do that

## Examples

...
`

    fs.writeFileSync(filePath, template)
    success(`Created ${fileName}`)
  } catch (err) {
    error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
