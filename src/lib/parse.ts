import * as fs from "fs"
import * as path from "path"
import matter from "gray-matter"

export interface AgentFile {
  path: string // relative path in repo
  name: string // from frontmatter or filename
  description?: string
  model?: string
  readonly?: boolean
  is_background?: boolean
  content: string // full file content
}

export function parseAgentFile(filePath: string): AgentFile | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8")
    const parsed = matter(content)

    // Valid if has frontmatter (even empty)
    if (!parsed.data || typeof parsed.data !== "object") {
      return null
    }

    const name = parsed.data.name || path.basename(filePath, ".md")

    // Validate name: lowercase letters and hyphens only
    if (!/^[a-z0-9-]+$/.test(name)) {
      return null
    }

    return {
      path: filePath,
      name: name as string,
      description: parsed.data.description,
      model: parsed.data.model || "inherit",
      readonly: parsed.data.readonly || false,
      is_background: parsed.data.is_background || false,
      content,
    }
  } catch (error) {
    return null
  }
}
